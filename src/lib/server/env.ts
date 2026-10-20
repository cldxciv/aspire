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

export type EnquiryStoreMode = "crm" | "off";

export interface ParsedEnquiryStore {
  mode: EnquiryStoreMode;
  /** Fixed codes only. */
  warnings: ConfigWarningCode[];
}

/**
 * ENQUIRY_STORE (D-039): whether POST /api/enquiries stores each valid enquiry as a CRM lead.
 *  - unset / "" / "crm" → crm (the default since M7)
 *  - "off" / "none" → off: the previous behaviour (webhook only, or validate only)
 *  - anything else → off with a warning: storing personal data is never switched on by a typo.
 * Independent of ENQUIRY_DESTINATION: with both, the lead is stored AND forwarded.
 */
export function parseEnquiryStore(env: Env): ParsedEnquiryStore {
  const raw = (env.ENQUIRY_STORE ?? "").trim().toLowerCase();
  if (raw === "" || raw === "crm") return { mode: "crm", warnings: [] };
  if (raw === "off" || raw === "none") return { mode: "off", warnings: [] };
  return { mode: "off", warnings: ["enquiry_store_unknown"] };
}

export type EnquiryDeliveryStatus = "connected" | "not_configured";

/**
 * Whether online enquiries would currently be kept: "connected" when they are stored as
 * CRM leads (ENQUIRY_STORE=crm, the default) or a valid webhook destination is configured,
 * otherwise "not_configured" (the same rule POST /api/enquiries applies). Returns the status
 * word only — never the URL, the secret or the config warnings — so it is safe to pass to
 * client components.
 *
 * Pages that are prerendered read it at build time, so it can be stale if the
 * environment changes after the build. The API response stays the source of
 * truth: a form must still branch on `received` / `not_configured`.
 */
export function getEnquiryDeliveryStatus(env: Env = process.env): EnquiryDeliveryStatus {
  if (parseEnquiryStore(env).mode === "crm") return "connected";
  return parseEnquiryDestination(env).config.kind === "webhook" ? "connected" : "not_configured";
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
