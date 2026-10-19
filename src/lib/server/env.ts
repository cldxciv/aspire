import "server-only";

import type { ConfigWarningCode } from "./logger";

/**
 * Server-side environment parsing. Values are read per call (not at module
 * load) so deployments and tests see the current environment. Variable names
 * are the ones in `.env.example`; nothing here is exposed to the client.
 */

export type Env = Readonly<Record<string, string | undefined>>;

/** Minimum secret length accepted for webhook signing. 32+ random characters recommended. */
export const MIN_WEBHOOK_SECRET_LENGTH = 16;

export type EnquiryDestinationConfig =
  | { kind: "none" }
  | { kind: "webhook"; url: string; secret: string };

export interface ParsedDestinationConfig {
  config: EnquiryDestinationConfig;
  /** Fixed codes only — never echo the URL or secret. */
  warnings: ConfigWarningCode[];
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * ENQUIRY_DESTINATION:
 *  - unset / "" / "none" → none (validate only; nothing is sent or stored)
 *  - "webhook" → POST to ENQUIRY_WEBHOOK_URL signed with ENQUIRY_WEBHOOK_SECRET.
 *    If either is missing or unsafe, falls back to none with a warning so the
 *    site never claims an enquiry was received when it could not be.
 *  - anything else → none with a warning.
 */
export function parseEnquiryDestination(env: Env): ParsedDestinationConfig {
  const raw = (env.ENQUIRY_DESTINATION ?? "").trim().toLowerCase();
  if (raw === "" || raw === "none") return { config: { kind: "none" }, warnings: [] };
  if (raw !== "webhook") return { config: { kind: "none" }, warnings: ["enquiry_destination_unknown"] };

  const warnings: ConfigWarningCode[] = [];
  const rawUrl = (env.ENQUIRY_WEBHOOK_URL ?? "").trim();
  const secret = env.ENQUIRY_WEBHOOK_SECRET ?? "";

  let url: URL | null = null;
  if (rawUrl === "") {
    warnings.push("enquiry_webhook_url_missing");
  } else {
    try {
      url = new URL(rawUrl);
    } catch {
      warnings.push("enquiry_webhook_url_invalid");
    }
  }
  if (url) {
    const isProduction = env.NODE_ENV === "production";
    const httpsOk = url.protocol === "https:";
    const localHttpOk = !isProduction && url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      warnings.push("enquiry_webhook_url_invalid");
      url = null;
    } else if (!httpsOk && !localHttpOk) {
      // Enquiries carry personal data: plain HTTP is only allowed to localhost outside production.
      warnings.push("enquiry_webhook_url_insecure");
      url = null;
    } else if (url.username || url.password) {
      // Credentials belong in the signature secret, not in the URL.
      warnings.push("enquiry_webhook_url_invalid");
      url = null;
    }
  }

  if (secret.trim() === "") warnings.push("enquiry_webhook_secret_missing");
  else if (secret.length < MIN_WEBHOOK_SECRET_LENGTH) warnings.push("enquiry_webhook_secret_too_short");

  if (!url || warnings.length > 0) return { config: { kind: "none" }, warnings };
  return { config: { kind: "webhook", url: url.toString(), secret }, warnings: [] };
}

/** Origin of NEXT_PUBLIC_SITE_URL (e.g. "https://aspireiit.in"), or null if unset/invalid. */
export function getSiteOrigin(env: Env): string | null {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}
