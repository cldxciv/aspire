import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";

/**
 * Lead-gate limits (docs/lead-gate-plan.md §7). In-memory, single instance: the same caveat as
 * the enquiry limiter (src/lib/server/rate-limit.ts). Separate instances from the enquiry ones, so
 * a family unlocking the tools never eats into the enquiry form's allowance. Keys are IP buckets
 * (IPv6 per /64, critique 1.2) or hashes, never phone numbers.
 *
 * A family unlocks ONCE per browser; every later tool use goes through the generous usage / status
 * limits, so several tools in a row are never blocked.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const LEAD_GATE_LIMITS = {
  /** POST /api/lead-gate per connection (school labs and mobile carrier NAT share addresses). */
  submit: { limit: 60, windowMs: 10 * MINUTE },
  /** New submissions per mobile number (past it, the pass binds to the existing lead without a new activity). */
  phone: { limit: 5, windowMs: 24 * HOUR },
  /** GET /api/lead-gate per connection (the client caches its answer, so this is rarely hit). */
  status: { limit: 600, windowMs: 10 * MINUTE },
  /** POST /api/lead-gate/usage per connection and per pass. */
  usage: { limit: 600, windowMs: 10 * MINUTE },
  usagePerPass: { limit: 120, windowMs: HOUR },
  /** DELETE /api/lead-gate per connection. */
  forget: { limit: 30, windowMs: 10 * MINUTE },
} as const;

/**
 * Rate-limit bucket for a client IP: IPv4 as is (and IPv4-mapped IPv6 as its IPv4), IPv6 reduced to
 * its /64 network, because one subscriber's device rotates through many privacy addresses inside it.
 */
export function ipBucket(ip: string): string {
  const value = ip.trim().toLowerCase().split("%")[0];
  if (isIP(value) !== 6) return value;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) return mapped[1];
  const [head, tail] = value.includes("::") ? value.split("::", 2) : [value, null];
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const parts =
    tail === null ? headParts : [...headParts, ...Array<string>(Math.max(0, 8 - headParts.length - tailParts.length)).fill("0"), ...tailParts];
  return `${parts
    .slice(0, 4)
    .map((part) => part.padStart(4, "0"))
    .join(":")}::/64`;
}

/** Limiter key for a mobile number (hash; the gate's own prefix, separate from the enquiry cap). */
export function gatePhoneKey(e164: string): string {
  return createHash("sha256").update(`lead-gate-phone-cap:${e164}`).digest("hex").slice(0, 32);
}

/**
 * Circuit breaker on NEW gate leads per rolling hour (critique 1.2). No OTP means scripted fake
 * numbers become real strangers' leads; above the ceiling new captures pause (503, nothing stored)
 * and the gate degrades to `optional` until the hour rolls on. Logged as `paused`.
 */
export class LeadFloodBreaker {
  private readonly hits: number[] = [];

  constructor(private readonly windowMs: number = HOUR) {}

  private trim(now: number): void {
    while (this.hits.length > 0 && this.hits[0] <= now - this.windowMs) this.hits.shift();
  }

  tripped(now: number, limit: number): boolean {
    this.trim(now);
    return this.hits.length >= limit;
  }

  record(now: number): void {
    this.trim(now);
    this.hits.push(now);
  }

  reset(): void {
    this.hits.length = 0;
  }
}

export interface LeadGateLimiters {
  submit: SlidingWindowRateLimiter;
  phone: SlidingWindowRateLimiter;
  status: SlidingWindowRateLimiter;
  usage: SlidingWindowRateLimiter;
  usagePerPass: SlidingWindowRateLimiter;
  forget: SlidingWindowRateLimiter;
  breaker: LeadFloodBreaker;
}

export function createLeadGateLimiters(now?: () => number): LeadGateLimiters {
  return {
    submit: new SlidingWindowRateLimiter({ ...LEAD_GATE_LIMITS.submit, now }),
    phone: new SlidingWindowRateLimiter({ ...LEAD_GATE_LIMITS.phone, now }),
    status: new SlidingWindowRateLimiter({ ...LEAD_GATE_LIMITS.status, now }),
    usage: new SlidingWindowRateLimiter({ ...LEAD_GATE_LIMITS.usage, now }),
    usagePerPass: new SlidingWindowRateLimiter({ ...LEAD_GATE_LIMITS.usagePerPass, now }),
    forget: new SlidingWindowRateLimiter({ ...LEAD_GATE_LIMITS.forget, now }),
    breaker: new LeadFloodBreaker(),
  };
}

const SHARED_KEY = Symbol.for("aspire.leadGate.limiters");
const globalStore = globalThis as typeof globalThis & { [SHARED_KEY]?: LeadGateLimiters };

/** Process-wide limiters for the real routes (kept on globalThis so separately bundled routes share them). */
export function sharedLeadGateLimiters(): LeadGateLimiters {
  globalStore[SHARED_KEY] ??= createLeadGateLimiters();
  return globalStore[SHARED_KEY];
}

/** Test helper. */
export function resetLeadGateLimitersForTests(): void {
  const limiters = globalStore[SHARED_KEY];
  if (!limiters) return;
  for (const limiter of [limiters.submit, limiters.phone, limiters.status, limiters.usage, limiters.usagePerPass, limiters.forget]) {
    limiter.reset();
  }
  limiters.breaker.reset();
}
