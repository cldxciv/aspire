import "server-only";
import { connection } from "next/server";
import type { Session } from "./roles";

/**
 * Returns the verified session for the current request, or `null`.
 *
 * No identity provider is integrated yet, so this ALWAYS returns `null` and
 * every portal API denies with 401 (D-011).
 *
 * INTEGRATION POINT (docs/auth-and-portals.md): replace the body with the
 * provider's server-side verification — read its session cookie via
 * `cookies()` from `next/headers`, verify signature/expiry with the provider
 * SDK, look the user up, and map them to `{ userId, role, linkedStudentIds }`
 * from server-side records. Pass the result through `isValidSession()`.
 * Never accept a role or user id from query strings, headers, or an unsigned
 * cookie.
 *
 * Request-time only: it awaits `connection()`, so with Cache Components every
 * caller must sit under `<Suspense>` (pages) or run in a route handler.
 */
export async function getSession(): Promise<Session | null> {
  await connection();
  return null;
}
