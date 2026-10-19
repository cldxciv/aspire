import { describe, expect, it } from "vitest";

import { ENQUIRY_RATE_LIMIT, SlidingWindowRateLimiter } from "./rate-limit";

const MINUTE = 60_000;

function limiterAt(start = 1_000_000) {
  let now = start;
  const limiter = new SlidingWindowRateLimiter({ ...ENQUIRY_RATE_LIMIT, now: () => now });
  return {
    limiter,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("SlidingWindowRateLimiter", () => {
  it("enquiry policy is 5 requests per 10 minutes", () => {
    expect(ENQUIRY_RATE_LIMIT).toEqual({ limit: 5, windowMs: 10 * MINUTE });
  });

  it("allows `limit` requests then blocks with Retry-After", () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 5; i++) {
      const result = limiter.check("1.2.3.4");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
    const blocked = limiter.check("1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(600);
  });

  it("is a sliding window: capacity returns one request at a time as old hits expire", () => {
    const { limiter, advance } = limiterAt();
    limiter.check("ip"); // t=0
    advance(2 * MINUTE);
    for (let i = 0; i < 4; i++) limiter.check("ip"); // t=2m
    advance(1 * MINUTE); // t=3m
    const blocked = limiter.check("ip");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(7 * 60); // first hit expires at t=10m

    advance(7 * MINUTE); // t=10m: exactly window length after the first hit → it has expired
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false); // the four t=2m hits are still inside the window

    advance(2 * MINUTE); // t=12m: the t=2m hits expire
    expect(limiter.check("ip").remaining).toBe(3);
  });

  it("does not count rejected requests (hammering does not extend the block)", () => {
    const { limiter, advance } = limiterAt();
    for (let i = 0; i < 5; i++) limiter.check("ip");
    for (let i = 0; i < 50; i++) {
      advance(1_000);
      expect(limiter.check("ip").allowed).toBe(false);
    }
    advance(10 * MINUTE - 50_000);
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 5; i++) limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("bounds memory by evicting least-recently-touched keys", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: MINUTE, maxKeys: 3, now: () => now });
    for (const key of ["a", "b", "c", "d"]) {
      limiter.check(key);
      now += 1;
    }
    expect(limiter.size()).toBe(3);
    expect(limiter.check("a").allowed).toBe(true); // "a" was evicted, so it starts fresh
  });

  it("sweeps expired keys", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({ limit: 5, windowMs: MINUTE, now: () => now });
    for (let i = 0; i < 50; i++) limiter.check(`ip-${i}`);
    now += 2 * MINUTE;
    for (let i = 0; i < 60; i++) limiter.check("fresh");
    expect(limiter.size()).toBe(1);
  });

  it("reset() clears all state", () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 6; i++) limiter.check("ip");
    limiter.reset();
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("rejects invalid configuration", () => {
    expect(() => new SlidingWindowRateLimiter({ limit: 0, windowMs: 1 })).toThrow(RangeError);
    expect(() => new SlidingWindowRateLimiter({ limit: 1, windowMs: 0 })).toThrow(RangeError);
  });
});
