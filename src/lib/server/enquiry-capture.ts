import "server-only";

import { createHash } from "node:crypto";

import type { Enquiry } from "@/lib/contracts/enquiry";

import type { EnquiryDestination } from "./destinations";
import { consentLocale, consentRecord } from "./enquiry-consent";
import { buildEnquiryPayload, generateEnquiryReference, isHoneypotTriggered } from "./enquiry-service";
import { safeSinkCode, type LeadCaptureInput, type LeadSink } from "./lead-sink";
import { exceptionReason } from "./logger";
import { SlidingWindowRateLimiter } from "./rate-limit";

/**
 * Lead capture for POST /api/enquiries when ENQUIRY_STORE=crm (D-039): store the enquiry as a CRM
 * lead, then also forward it to the webhook destination when one is configured. With
 * ENQUIRY_STORE=off the handler keeps using `submitEnquiry` (enquiry-service.ts) unchanged.
 */

/** Per-mobile-number cap on lead captures: 5 per rolling 24 hours (stops one lead being flooded). */
export const PHONE_CAPTURE_LIMIT = { limit: 5, windowMs: 24 * 60 * 60 * 1000 } as const;

/** In-memory, single instance (same caveat as the IP limiter in rate-limit.ts). Keys are hashes, never numbers. */
export function createPhoneCaptureLimiter(now?: () => number): SlidingWindowRateLimiter {
  return new SlidingWindowRateLimiter({ ...PHONE_CAPTURE_LIMIT, now });
}

/**
 * `+91` + the 10-digit mobile number. Input is the contract's validated phone, which is an
 * optional +91 / 91 / 0 prefix followed by 10 digits, so the last 10 digits are the number.
 */
export function toE164IndianMobile(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `+91${digits.slice(-10)}`;
}

/** Limiter key for a phone: a hash, so the limiter's memory holds no phone numbers. */
export function phoneCapKey(e164: string): string {
  return createHash("sha256").update(`enquiry-phone-cap:${e164}`).digest("hex").slice(0, 32);
}

/** Maps a validated enquiry to the lead store's input (blank optional fields dropped). */
export function buildLeadCapture(enquiry: Enquiry, reference: string, receivedAt: Date): LeadCaptureInput {
  const optional = (value: string | undefined) => (value && value.trim() !== "" ? value : undefined);
  const input: LeadCaptureInput = {
    reference,
    receivedAt: receivedAt.toISOString(),
    source: enquiry.source,
    phone: toE164IndianMobile(enquiry.phone),
    name: enquiry.name,
    email: optional(enquiry.email),
    message: optional(enquiry.message),
    consent: consentRecord(enquiry.consentVersion, enquiry.context, receivedAt),
    locale: consentLocale(enquiry.context),
    context: enquiry.context,
  };
  switch (enquiry.source) {
    case "hero":
      input.guardianName = enquiry.guardianName;
      input.currentClass = enquiry.currentClass;
      input.programInterest = enquiry.programInterest;
      input.preferredCentre = optional(enquiry.preferredCentre);
      break;
    case "admissions":
      input.currentClass = enquiry.currentClass;
      input.programInterest = enquiry.programInterest;
      input.preferredCentre = optional(enquiry.preferredCentre);
      break;
    case "quick":
      input.currentClass = enquiry.currentClass;
      input.programInterest = enquiry.programInterest;
      input.intent = enquiry.intent;
      break;
    case "contact":
      input.topic = enquiry.topic;
      break;
  }
  for (const key of Object.keys(input) as (keyof LeadCaptureInput)[]) {
    if (input[key] === undefined) delete input[key];
  }
  return input;
}

export type CaptureStore = "stored" | "duplicate" | "failed";
export type CaptureForward = "sent" | "failed" | "none";

export type CaptureOutcome =
  /** Stored as a lead and/or forwarded. `honeypot`: looks received, nothing was kept. */
  | {
      kind: "received";
      reference: string;
      honeypot: boolean;
      store?: CaptureStore;
      forward?: CaptureForward;
      /** The CRM lead it was stored as / appended to (store `stored` / `duplicate` only). Never logged or returned. */
      leadId?: string;
      /** Log-safe sink failure code when the store failed but the webhook took it. */
      storeCode?: string;
      forwardReason?: "timeout" | "network" | "http_status";
      httpStatus?: number;
    }
  /** The per-phone daily cap was reached: nothing stored or sent. */
  | { kind: "phone_capped"; retryAfterSeconds: number }
  /** Neither the store nor the webhook kept it. */
  | {
      kind: "failed";
      reference: string;
      storeCode: string;
      forward: "failed" | "none";
      forwardReason?: "timeout" | "network" | "http_status";
      httpStatus?: number;
    };

export interface CaptureDeps {
  leadSink: LeadSink;
  destination: EnquiryDestination;
  phoneLimiter: SlidingWindowRateLimiter;
  now?: () => Date;
  generateReference?: () => string;
}

/**
 * Honesty rule (D-008 + D-039): `received` only when the lead was stored or the webhook
 * accepted it. A store failure is never hidden: with no webhook (or a failing one) the result is
 * `failed`. Honeypot submissions get a normal-looking `received` and nothing is stored or sent;
 * they do not count towards the phone cap.
 */
export async function captureEnquiry(enquiry: Enquiry, deps: CaptureDeps): Promise<CaptureOutcome> {
  const now = deps.now ?? (() => new Date());
  const makeReference = deps.generateReference ?? generateEnquiryReference;

  if (isHoneypotTriggered(enquiry)) return { kind: "received", reference: makeReference(), honeypot: true };

  const phone = toE164IndianMobile(enquiry.phone);
  const cap = deps.phoneLimiter.check(phoneCapKey(phone));
  if (!cap.allowed) return { kind: "phone_capped", retryAfterSeconds: cap.retryAfterSeconds };

  const reference = makeReference();
  const receivedAt = now();

  let store: CaptureStore;
  let storeCode: string | undefined;
  let leadId: string | undefined;
  try {
    const result = await deps.leadSink.capture(buildLeadCapture(enquiry, reference, receivedAt));
    if (result.ok) {
      store = result.duplicate ? "duplicate" : "stored";
      leadId = result.leadId;
    } else {
      store = "failed";
      storeCode = safeSinkCode(result.code);
    }
  } catch (error) {
    store = "failed";
    storeCode = safeSinkCode(exceptionReason(error).toLowerCase());
  }

  let forward: CaptureForward = "none";
  let forwardReason: "timeout" | "network" | "http_status" | undefined;
  let httpStatus: number | undefined;
  if (deps.destination.kind !== "none") {
    const delivery = await deps.destination.deliver(buildEnquiryPayload(enquiry, reference, receivedAt));
    if (delivery.status === "accepted") forward = "sent";
    else if (delivery.status === "failed") {
      forward = "failed";
      forwardReason = delivery.reason;
      httpStatus = delivery.httpStatus;
    }
  }

  if (store !== "failed" || forward === "sent") {
    return {
      kind: "received",
      reference,
      honeypot: false,
      store,
      forward,
      ...(leadId ? { leadId } : {}),
      ...(storeCode ? { storeCode } : {}),
      ...(forwardReason ? { forwardReason } : {}),
      ...(httpStatus !== undefined ? { httpStatus } : {}),
    };
  }
  return {
    kind: "failed",
    reference,
    storeCode: storeCode ?? "unknown",
    forward: forward === "failed" ? "failed" : "none",
    ...(forwardReason ? { forwardReason } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
  };
}
