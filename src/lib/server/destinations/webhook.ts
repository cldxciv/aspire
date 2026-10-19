import "server-only";

import { createHmac } from "node:crypto";

import type { DeliveryResult, EnquiryDestination, EnquiryPayload } from "./types";

export const WEBHOOK_SIGNATURE_HEADER = "X-Aspire-Signature-256";
export const WEBHOOK_REFERENCE_HEADER = "X-Aspire-Enquiry-Reference";
export const WEBHOOK_USER_AGENT = "AspireWeb-Enquiries/1";
export const DEFAULT_WEBHOOK_TIMEOUT_MS = 8_000;

/** `sha256=<hex HMAC-SHA256 of the exact raw body bytes>` — same scheme as GitHub's X-Hub-Signature-256. */
export function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

export interface WebhookDestinationOptions {
  url: string;
  secret: string;
  timeoutMs?: number;
  /** Injected for tests; defaults to the global (Next-patched) fetch, looked up per call. */
  fetchImpl?: typeof fetch;
}

/**
 * POSTs the enquiry as JSON, signed with HMAC-SHA256. Only a 2xx response
 * counts as accepted. Redirects are not followed (a redirect could forward
 * personal data to an unexpected host), and the request is aborted after
 * `timeoutMs`. No retries: the visitor is waiting on the response.
 */
export function createWebhookDestination(options: WebhookDestinationOptions): EnquiryDestination {
  const { url, secret, timeoutMs = DEFAULT_WEBHOOK_TIMEOUT_MS } = options;

  return {
    kind: "webhook",
    async deliver(payload: EnquiryPayload): Promise<DeliveryResult> {
      const fetchImpl = options.fetchImpl ?? globalThis.fetch;
      const body = JSON.stringify(payload);
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": WEBHOOK_USER_AGENT,
            [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(body, secret),
            [WEBHOOK_REFERENCE_HEADER]: payload.reference,
          },
          body,
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
        });
        // We never need the receiver's body; release the connection.
        await response.body?.cancel().catch(() => undefined);
        if (response.ok) return { status: "accepted" };
        return { status: "failed", reason: "http_status", httpStatus: response.status };
      } catch {
        // Deliberately not inspecting/logging the error message: it can contain the webhook URL.
        return { status: "failed", reason: timedOut ? "timeout" : "network" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
