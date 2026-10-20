import "server-only";

import { z } from "zod";

import { enquirySchema, type EnquiryResponse } from "@/lib/contracts/enquiry";

import { createDestination } from "./destinations";
import { getSiteOrigin, parseEnquiryDestination, parseEnquiryStore, type Env } from "./env";
import { captureEnquiry, createPhoneCaptureLimiter } from "./enquiry-capture";
import { checkPreferredCentre, submitEnquiry } from "./enquiry-service";
import { apiError, jsonResponse } from "./http";
import { getLeadSink, type LeadSink } from "./lead-sink";
import { exceptionReason, logger as defaultLogger, type EnquiryLogEntry, type Logger } from "./logger";
import { ENQUIRY_RATE_LIMIT, SlidingWindowRateLimiter } from "./rate-limit";
import { checkSameOrigin, getClientIp, isJsonContentType, readBodyWithLimit } from "./request-guards";

/** Maximum accepted request body: 10 KB. */
export const MAX_ENQUIRY_BODY_BYTES = 10 * 1024;

export const ENQUIRY_MESSAGES = {
  received: "Your enquiry has been received. Please quote your reference if you contact Aspire about it.",
  notConfigured:
    "Your details were checked but have NOT been sent: online enquiries are not connected yet. Please contact Aspire directly.",
  forbidden: "This request was blocked because it did not come from this website.",
  unsupportedMediaType: "Content-Type must be application/json.",
  tooLarge: "The request is too large.",
  badRequest: "The request body must be a valid JSON object.",
  validation: "Please check the highlighted fields.",
  rateLimited: (minutes: number) =>
    `Too many enquiries from this connection. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  phoneRateLimited:
    "Several enquiries were already sent for this mobile number today. Please try again tomorrow or contact Aspire directly.",
  serverError:
    "We could not send your enquiry right now. Nothing was submitted. Please try again later or contact Aspire directly.",
} as const;

export interface EnquiryHandlerDeps {
  rateLimiter: SlidingWindowRateLimiter;
  /** Per-mobile-number daily cap on lead captures (ENQUIRY_STORE=crm only). */
  phoneLimiter: SlidingWindowRateLimiter;
  /** CRM lead store adapter (lead-sink.ts). Read per request. */
  getLeadSink: () => LeadSink;
  getEnv: () => Env;
  logger: Logger;
  now: () => Date;
  /** Defaults to the global fetch at call time. */
  fetchImpl?: typeof fetch;
  webhookTimeoutMs?: number;
  generateReference?: () => string;
  maxBodyBytes: number;
}

/** Process-wide limiters for the real route (single instance only — see rate-limit.ts). */
const sharedRateLimiter = new SlidingWindowRateLimiter(ENQUIRY_RATE_LIMIT);
const sharedPhoneLimiter = createPhoneCaptureLimiter();

/** Test helper: clears the shared limiters used by the real route. */
export function resetEnquiryRateLimiterForTests(): void {
  sharedRateLimiter.reset();
  sharedPhoneLimiter.reset();
}

function respond(body: EnquiryResponse, status: number, headers?: HeadersInit): Response {
  return jsonResponse(body, { status, headers });
}

/**
 * Builds the POST /api/enquiries handler. Order of checks:
 * origin (403) → content type (415) → rate limit (429) → body size (413) →
 * JSON (400) → schema + preferredCentre (422) → honeypot →
 *   ENQUIRY_STORE=crm (default, D-039): per-phone cap (429) → store as a CRM lead AND forward to
 *     the webhook when configured → 201 if either kept it, else 500;
 *   ENQUIRY_STORE=off: the destination only, exactly as before (200 not_configured / 201 / 500).
 */
export function createEnquiryHandler(overrides: Partial<EnquiryHandlerDeps> = {}) {
  const deps: EnquiryHandlerDeps = {
    rateLimiter: sharedRateLimiter,
    phoneLimiter: sharedPhoneLimiter,
    getLeadSink,
    getEnv: () => process.env,
    logger: defaultLogger,
    now: () => new Date(),
    maxBodyBytes: MAX_ENQUIRY_BODY_BYTES,
    ...overrides,
  };

  return async function handleEnquiryPost(request: Request): Promise<Response> {
    const startedAt = performance.now();
    const log = (entry: Omit<EnquiryLogEntry, "durationMs">) =>
      deps.logger.enquiry({ ...entry, durationMs: performance.now() - startedAt });

    try {
      const env = deps.getEnv();

      // 1. CSRF / origin
      const origin = checkSameOrigin(request, { siteOrigin: getSiteOrigin(env) });
      if (!origin.ok) {
        log({ outcome: "forbidden", reason: origin.reason });
        return apiError(403, "forbidden", ENQUIRY_MESSAGES.forbidden);
      }

      // 2. Content type
      if (!isJsonContentType(request.headers.get("content-type"))) {
        log({ outcome: "unsupported_media_type" });
        return apiError(415, "bad_request", ENQUIRY_MESSAGES.unsupportedMediaType);
      }

      // 3. Rate limit (per client IP; IP is used as a key only, never logged)
      const limit = deps.rateLimiter.check(getClientIp(request.headers));
      if (!limit.allowed) {
        log({ outcome: "rate_limited" });
        return apiError(429, "rate_limited", ENQUIRY_MESSAGES.rateLimited(Math.ceil(limit.retryAfterSeconds / 60)), {
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        });
      }

      // 4. Bounded body read
      const body = await readBodyWithLimit(request, deps.maxBodyBytes);
      if (!body.ok) {
        if (body.reason === "too_large") {
          log({ outcome: "payload_too_large" });
          return apiError(413, "bad_request", ENQUIRY_MESSAGES.tooLarge);
        }
        log({ outcome: "bad_request", reason: body.reason });
        return apiError(400, "bad_request", ENQUIRY_MESSAGES.badRequest);
      }

      // 5. JSON
      let json: unknown;
      try {
        json = JSON.parse(body.text);
      } catch {
        log({ outcome: "bad_request", reason: "invalid_json" });
        return apiError(400, "bad_request", ENQUIRY_MESSAGES.badRequest);
      }
      if (typeof json !== "object" || json === null || Array.isArray(json)) {
        log({ outcome: "bad_request", reason: "not_an_object" });
        return apiError(400, "bad_request", ENQUIRY_MESSAGES.badRequest);
      }

      // 6. Schema (authoritative server-side validation)
      const parsed = enquirySchema.safeParse(json);
      if (!parsed.success) {
        const { fieldErrors } = z.flattenError(parsed.error);
        log({ outcome: "validation_failed" });
        return apiError(422, "validation", ENQUIRY_MESSAGES.validation, {
          fieldErrors: fieldErrors as Record<string, string[]>,
        });
      }
      const enquiry = parsed.data;
      const centreErrors = await checkPreferredCentre(enquiry);
      if (centreErrors) {
        log({ outcome: "validation_failed", source: enquiry.source });
        return apiError(422, "validation", ENQUIRY_MESSAGES.validation, { fieldErrors: centreErrors });
      }

      // 7. Store and/or destination (+ honeypot inside captureEnquiry / submitEnquiry)
      const store = parseEnquiryStore(env);
      const { config, warnings } = parseEnquiryDestination(env);
      for (const code of [...store.warnings, ...warnings]) deps.logger.configWarning(code);
      const destination = createDestination(config, {
        fetchImpl: deps.fetchImpl,
        webhookTimeoutMs: deps.webhookTimeoutMs,
      });
      const received = (reference: string) =>
        respond({ ok: true, status: "received", reference, message: ENQUIRY_MESSAGES.received }, 201);

      if (store.mode === "crm") {
        const outcome = await captureEnquiry(enquiry, {
          leadSink: deps.getLeadSink(),
          destination,
          phoneLimiter: deps.phoneLimiter,
          now: deps.now,
          generateReference: deps.generateReference,
        });
        switch (outcome.kind) {
          case "received":
            if (outcome.honeypot) {
              log({ outcome: "honeypot", reference: outcome.reference, source: enquiry.source });
            } else {
              log({
                outcome: "received",
                reference: outcome.reference,
                source: enquiry.source,
                store: outcome.store,
                forward: outcome.forward,
                // A store failure covered by the webhook (or a webhook failure covered by the store) keeps its code.
                ...(outcome.storeCode
                  ? { reason: `store_${outcome.storeCode}` as const }
                  : outcome.forwardReason
                    ? { reason: forwardReasonCode(outcome.forwardReason, outcome.httpStatus) }
                    : {}),
              });
            }
            return received(outcome.reference);
          case "phone_capped":
            log({ outcome: "phone_rate_limited", source: enquiry.source });
            return apiError(429, "rate_limited", ENQUIRY_MESSAGES.phoneRateLimited, {
              headers: { "Retry-After": String(outcome.retryAfterSeconds) },
            });
          case "failed":
            log({
              outcome: "delivery_failed",
              reference: outcome.reference,
              source: enquiry.source,
              store: "failed",
              forward: outcome.forward,
              reason: `store_${outcome.storeCode}`,
            });
            return apiError(500, "server_error", ENQUIRY_MESSAGES.serverError);
        }
      }

      const outcome = await submitEnquiry(enquiry, {
        destination,
        now: deps.now,
        generateReference: deps.generateReference,
      });

      switch (outcome.kind) {
        case "received":
          log({ outcome: outcome.honeypot ? "honeypot" : "received", reference: outcome.reference, source: enquiry.source });
          return received(outcome.reference);
        case "not_configured":
          log({ outcome: outcome.honeypot ? "honeypot" : "not_configured", source: enquiry.source });
          return respond({ ok: true, status: "not_configured", message: ENQUIRY_MESSAGES.notConfigured }, 200);
        case "failed":
          log({
            outcome: "delivery_failed",
            reference: outcome.reference,
            source: enquiry.source,
            reason: forwardReasonCode(outcome.reason, outcome.httpStatus),
          });
          return apiError(500, "server_error", ENQUIRY_MESSAGES.serverError);
      }
    } catch (error) {
      log({ outcome: "error", reason: exceptionReason(error) });
      return apiError(500, "server_error", ENQUIRY_MESSAGES.serverError);
    }
  };
}

function forwardReasonCode(reason: "timeout" | "network" | "http_status", httpStatus?: number) {
  return reason === "http_status" ? (`http_${httpStatus ?? 0}` as const) : reason;
}

/** The handler used by src/app/api/enquiries/route.ts. */
export const handleEnquiryPost = createEnquiryHandler();
