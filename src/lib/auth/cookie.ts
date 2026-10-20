import "server-only";
import type { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "./config";

/**
 * `aspire_session` cookie attributes: HttpOnly (no script access), SameSite=Lax (not
 * sent on cross-site POSTs), Path=/, Secure in production (HTTPS only). The value is
 * the opaque random token; the database holds only its hash.
 */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.max(0, Math.floor(maxAgeSeconds)),
  };
}

/** Sets the session cookie to expire with the session. */
export function setSessionCookie(response: NextResponse, token: string, expiresAt: number, now: number = Date.now()): void {
  response.cookies.set(AUTH_COOKIE_NAME, token, sessionCookieOptions((expiresAt - now) / 1000));
}

/** Expires the session cookie in the browser (same attributes, empty value, Max-Age=0). */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIE_NAME, "", sessionCookieOptions(0));
}
