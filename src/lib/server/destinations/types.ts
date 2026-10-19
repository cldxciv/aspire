import "server-only";

import type { Enquiry } from "@/lib/contracts/enquiry";

/** `Omit` that keeps a union discriminated (plain `Omit` collapses it to the common keys). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Enquiry fields forwarded to a destination: the validated enquiry minus the honeypot. */
export type ForwardedEnquiry = DistributiveOmit<Enquiry, "website">;

/** Exact JSON body POSTed to a destination (documented in docs/api.md). */
export interface EnquiryPayload {
  reference: string;
  /** ISO-8601 server time the enquiry was accepted for processing. */
  receivedAt: string;
  /** ISO-8601 time consent was given (the submission time; consent is required by the schema). */
  consentAt: string;
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
