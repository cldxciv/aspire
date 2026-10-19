import "server-only";

/**
 * In-memory sliding-window-log rate limiter.
 *
 * SINGLE-INSTANCE ONLY: state lives in this Node.js process. With several
 * server instances / serverless lambdas each keeps its own counters, so the
 * effective limit is multiplied and resets on cold start. Replace with a
 * shared store (e.g. Redis) before multi-instance hosting
 * (docs/integration-status.md, docs/api.md).
 *
 * Only allowed requests are recorded, so a client that keeps hammering while
 * blocked does not extend its own block; `retryAfterSeconds` is exact.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the next request would be allowed (0 when allowed). */
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Upper bound on tracked keys; oldest-touched keys are evicted beyond it. */
  maxKeys?: number;
  now?: () => number;
}

export class SlidingWindowRateLimiter {
  readonly limit: number;
  readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;
  /** key → ascending timestamps of allowed requests within the window. Map order = least recently touched first. */
  private readonly hits = new Map<string, number[]>();
  private checksSinceSweep = 0;

  constructor({ limit, windowMs, maxKeys = 10_000, now = Date.now }: RateLimiterOptions) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
    if (!(windowMs > 0)) throw new RangeError("windowMs must be positive");
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.now = now;
  }

  check(key: string): RateLimitResult {
    const now = this.now();
    this.maybeSweep(now);

    const windowStart = now - this.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.limit) {
      this.touch(key, timestamps);
      const oldest = timestamps[0];
      const retryAfterMs = oldest + this.windowMs - now;
      return {
        allowed: false,
        limit: this.limit,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    timestamps.push(now);
    this.touch(key, timestamps);
    this.enforceMaxKeys();
    return { allowed: true, limit: this.limit, remaining: this.limit - timestamps.length, retryAfterSeconds: 0 };
  }

  /** Number of keys currently tracked (for tests / diagnostics). */
  size(): number {
    return this.hits.size;
  }

  reset(): void {
    this.hits.clear();
    this.checksSinceSweep = 0;
  }

  private touch(key: string, timestamps: number[]): void {
    this.hits.delete(key);
    this.hits.set(key, timestamps);
  }

  /** Drop keys whose newest hit is outside the window (amortised: every 100 checks). */
  private maybeSweep(now: number): void {
    this.checksSinceSweep += 1;
    if (this.checksSinceSweep < 100 && this.hits.size <= this.maxKeys) return;
    this.checksSinceSweep = 0;
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.hits) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= windowStart) this.hits.delete(key);
    }
  }

  private enforceMaxKeys(): void {
    while (this.hits.size > this.maxKeys) {
      const oldestKey = this.hits.keys().next().value;
      if (oldestKey === undefined) break;
      this.hits.delete(oldestKey);
    }
  }
}

/** Enquiry policy: 5 POSTs per client IP per rolling 10 minutes. */
export const ENQUIRY_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 } as const;
