import "server-only";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { AUTH_COOKIE_NAME } from "./config";
import { authLog, exceptionCode } from "./log";
import type { Session } from "./roles";
import { resolveSessionToken, type ResolvedSession } from "./sessions";

export type CurrentSession = ResolvedSession & {
  /** The cookie value, so a route handler can re-issue the cookie when `refreshed`. Never log or return it. */
  token: string;
};

/**
 * The verified session for the current request plus its bookkeeping (token hash,
 * expiry, whether the expiry was just extended), or `null`.
 *
 * Reads the `aspire_session` cookie with `cookies()` and validates the token against
 * the session store (src/lib/auth/sessions.ts): unknown, expired, revoked or disabled
 * → `null`. A database error is logged and also treated as signed out (fail closed).
 *
 * Request-time only: with Cache Components every caller must sit under `<Suspense>`
 * (pages, via `<PortalGate>`) or run in a route handler. `connection()` and `cookies()`
 * are awaited OUTSIDE the try block and before any database access, so during a
 * build-time prerender they suspend/abort the render (as Next expects) and the database
 * is never touched.
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  await connection();
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const resolved = resolveSessionToken(token);
    return resolved ? { ...resolved, token } : null;
  } catch (error) {
    unstable_rethrow(error);
    authLog({ action: "session", outcome: "error", reason: exceptionCode(error) });
    return null;
  }
}

/**
 * Returns the verified session for the current request, or `null` (D-011, D-029).
 * Roles and user ids come only from the server-side session store, never from query
 * strings, headers, client state or the cookie's contents themselves.
 */
export async function getSession(): Promise<Session | null> {
  return (await getCurrentSession())?.session ?? null;
}
