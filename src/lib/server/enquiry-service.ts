import "server-only";

import { randomBytes } from "node:crypto";

import type { Enquiry } from "@/lib/contracts/enquiry";
import { getCentres } from "@/lib/data";

import type { EnquiryDestination, EnquiryPayload, ForwardedEnquiry } from "./destinations";

/** Value the admissions and hero forms send for "Not sure yet" (contract comment on `preferredCentre`). */
export const PREFERRED_CENTRE_NOT_SURE = "not-sure";
export const PREFERRED_CENTRE_ERROR = "Select a centre from the list";

/**
 * Server-side enforcement of the contract note "Centre slug or 'not-sure'.
 * Free text is not accepted" (D-016) for the admissions and hero forms — the
 * shared schema only checks the slug shape. Allowed: absent/empty, "not-sure",
 * or the slug of a centre getCentres() currently publishes (the same list the
 * forms' options are built from). Returns field errors, or null when valid.
 */
export async function checkPreferredCentre(enquiry: Enquiry): Promise<Record<string, string[]> | null> {
  if (enquiry.source !== "admissions" && enquiry.source !== "hero") return null;
  const value = enquiry.preferredCentre;
  if (!value || value === PREFERRED_CENTRE_NOT_SURE) return null;
  const centres = await getCentres();
  return centres.some((centre) => centre.slug === value) ? null : { preferredCentre: [PREFERRED_CENTRE_ERROR] };
}

/** Crockford base32 (no I, L, O, U) — readable over the phone. 32 symbols, so `byte & 31` is unbiased. */
const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const REFERENCE_LENGTH = 10; // 50 bits of randomness

/** e.g. `ENQ-7K3M9Q2XWD`. Random, so it reveals nothing about volume or timing. */
export function generateEnquiryReference(): string {
  const bytes = randomBytes(REFERENCE_LENGTH);
  let suffix = "";
  for (const byte of bytes) suffix += REFERENCE_ALPHABET[byte & 31];
  return `ENQ-${suffix}`;
}

export const ENQUIRY_REFERENCE_PATTERN = /^ENQ-[0-9A-HJKMNP-TV-Z]{10}$/;

/** The hidden `website` field is filled → almost certainly a bot. */
export function isHoneypotTriggered(enquiry: Enquiry): boolean {
  return typeof enquiry.website === "string" && enquiry.website.trim() !== "";
}

/** Drops the honeypot and empty optional strings so destinations receive only meaningful fields. */
export function toForwardedEnquiry(enquiry: Enquiry): ForwardedEnquiry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `website` is intentionally discarded.
  const { website, ...rest } = enquiry;
  const forwarded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === "") continue;
    forwarded[key] = value;
  }
  return forwarded as ForwardedEnquiry;
}

export function buildEnquiryPayload(enquiry: Enquiry, reference: string, receivedAt: Date): EnquiryPayload {
  const iso = receivedAt.toISOString();
  return { reference, receivedAt: iso, consentAt: iso, enquiry: toForwardedEnquiry(enquiry) };
}

export type SubmitOutcome =
  | { kind: "received"; reference: string; honeypot: boolean }
  | { kind: "not_configured"; honeypot: boolean; reference?: undefined }
  | { kind: "failed"; reference: string; reason: "timeout" | "network" | "http_status"; httpStatus?: number };

export interface SubmitDeps {
  destination: EnquiryDestination;
  now?: () => Date;
  generateReference?: () => string;
}

/**
 * Hands a validated enquiry to the configured destination.
 *
 * Honesty rule (D-008): `received` only when a configured destination
 * returned success. Honeypot submissions get the response a genuine
 * submission would get for the current configuration, but nothing is sent.
 */
export async function submitEnquiry(enquiry: Enquiry, deps: SubmitDeps): Promise<SubmitOutcome> {
  const now = deps.now ?? (() => new Date());
  const makeReference = deps.generateReference ?? generateEnquiryReference;

  if (isHoneypotTriggered(enquiry)) {
    return deps.destination.kind === "none"
      ? { kind: "not_configured", honeypot: true }
      : { kind: "received", reference: makeReference(), honeypot: true };
  }

  if (deps.destination.kind === "none") return { kind: "not_configured", honeypot: false };

  const reference = makeReference();
  const result = await deps.destination.deliver(buildEnquiryPayload(enquiry, reference, now()));
  switch (result.status) {
    case "accepted":
      return { kind: "received", reference, honeypot: false };
    case "not_configured":
      return { kind: "not_configured", honeypot: false };
    case "failed":
      return { kind: "failed", reference, reason: result.reason, httpStatus: result.httpStatus };
  }
}
