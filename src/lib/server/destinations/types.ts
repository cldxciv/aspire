import "server-only";

import type { Enquiry, EnquiryContext } from "@/lib/contracts/enquiry";

/** `Omit` that keeps a union discriminated (plain `Omit` collapses it to the common keys). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * Enquiry fields forwarded to a destination: the validated enquiry minus the honeypot. The consent
 * version and the attribution context travel at the top level of the payload (D-039), so the
 * `enquiry` object keeps the shape receivers already parse.
 */
export type ForwardedEnquiry = DistributiveOmit<Enquiry, "website" | "consentVersion" | "context">;

/** Exact JSON body POSTed to a destination (documented in docs/api.md). */
export interface EnquiryPayload {
  reference: string;
  /** ISO-8601 server time the enquiry was accepted for processing. */
  receivedAt: string;
  /** ISO-8601 time consent was given (the submission time; consent is required by the schema). */
  consentAt: string;
  /** Id of the consent sentence the visitor agreed to (contract CONSENT_VERSION, D-039). */
  consentVersion?: string;
  /** Attribution only (page, locale, utm_*, tool, referrer host). Omitted when empty. */
  context?: EnquiryContext;
  enquiry: ForwardedEnquiry;
}

export type DeliveryResult =
  | { status: "accepted" }
  | { status: "not_configured" }
  | { status: "failed"; reason: "timeout" | "network" | "http_status"; httpStatus?: number };

export interface EnquiryDestination {
  readonly kind: "none" | "webhook";
  deliver(payload: EnquiryPayload): Promise<DeliveryResult>;
}
