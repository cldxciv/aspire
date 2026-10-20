/**
 * Preview access gate (D-027). When `PREVIEW_ACCESS_PASSWORD` is set, every page and
 * API asks for HTTP Basic credentials, so a shared preview that shows placeholder
 * content (unverified names, results, contact details) is not publicly reachable.
 * Any username is accepted; only the password is checked. Unset = no gate (default).
 *
 * The password lives only in the environment (`.env.local` / host settings) — never in
 * source, docs or git. Comparison is constant-time.
 */

import { NextResponse } from "next/server";

export const PREVIEW_REALM = "Aspire preview";

/** The configured preview password, or null when the gate is off. */
export function previewAccessPassword(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.PREVIEW_ACCESS_PASSWORD;
  return value && value.length > 0 ? value : null;
}

/** Constant-time string comparison (length is not secret here). */
function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

/** True when the `Authorization` header carries Basic credentials with the expected password. */
export function isPreviewAuthorized(authorization: string | null, password: string): boolean {
  if (!authorization) return false;
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(authorization);
  if (!match) return false;
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;
  return safeEqual(decoded.slice(separator + 1), password);
}

/** 401 challenge that makes browsers show their sign-in prompt. Never cached or indexed. */
export function previewChallenge(): NextResponse {
  return new NextResponse("Preview access requires a password.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${PREVIEW_REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
