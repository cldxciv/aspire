import "server-only";

import { after, NextResponse } from "next/server";

import { ROBOTS_NOINDEX } from "@/lib/auth/config";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";

/**
 * Route plumbing shared by LR-META's handlers (the public webhook / sync endpoints and
 * /api/crm/integrations/meta/**). Route files may only export handlers, so the limiters live here.
 */

/** Per-IP limit of the public webhook (§18.2: 600 a minute). */
export const webhookLimiter = new SlidingWindowRateLimiter({ limit: 600, windowMs: 60_000 });
/** The loopback cron endpoint: a few calls a minute at most. */
export const syncLimiter = new SlidingWindowRateLimiter({ limit: 30, windowMs: 60_000 });

/** Test helper. */
export function resetMetaLimitersForTests(): void {
  webhookLimiter.reset();
  syncLimiter.reset();
}

/** A private (never cached, never indexed) plain answer for the public endpoints. */
export function privateAnswer(body: string, status: number, contentType: "text" | "json", extra: Record<string, string> = {}): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": contentType === "text" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": ROBOTS_NOINDEX,
      ...extra,
    },
  });
}

/**
 * Runs `job` after the response (`after()`); outside a request scope (scripts, tests without the
 * Next runtime) it is skipped. Never throws.
 */
export function afterResponse(job: () => void | Promise<void>): void {
  try {
    after(job);
  } catch {
    // No request scope: nothing to defer to.
  }
}

/** Origin as the proxy forwarded it (`X-Forwarded-Proto` / `-Host`, else Host); null when unusable. */
export function originFromHeaders(headers: { get(name: string): string | null }, fallbackProtocol: "http" | "https" = "https"): string | null {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!/^[A-Za-z0-9.-]{1,253}(?::\d{1,5})?$/.test(host)) return null;
  const forwarded = (headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : fallbackProtocol;
  return `${proto}://${host.toLowerCase()}`;
}

/** Origin of an incoming request (see `originFromHeaders`). */
export function requestOrigin(request: Request): string | null {
  return originFromHeaders(request.headers, new URL(request.url).protocol === "http:" ? "http" : "https");
}
