/**
 * Portal auth configuration (docs/auth-and-portals.md, decisions D-011 and D-029).
 * Safe to import from the proxy, route handlers and server components: no I/O and
 * no database imports here.
 */

/** Sent on every portal page and portal API response. */
export const ROBOTS_NOINDEX = "noindex, nofollow";

/** The session cookie set by `POST /api/auth/login` (HttpOnly, SameSite=Lax, Secure in production). */
export const AUTH_COOKIE_NAME = "aspire_session";

/**
 * Name of the session cookie, as seen by the proxy. The proxy uses it ONLY as an
 * optimistic "might be signed in" hint; pages and route handlers always verify the
 * session again through `getSession()`, which looks the token up in the database.
 * Presence of the cookie grants nothing on its own.
 *
 * Typed `string | null` on purpose: `null` would switch the hint off again (every
 * request treated as signed out by the proxy).
 */
export const SESSION_COOKIE_NAME: string | null = AUTH_COOKIE_NAME;

/**
 * Data-free portal preview shells.
 *
 * `PORTAL_PREVIEW="true"` turns previews on, `"false"` turns them off. Any other
 * value (or unset) falls back to: on in development, off everywhere else, so
 * production denies by default. Read at request time, never baked into a page.
 */
export function isPortalPreviewEnabled(): boolean {
  const flag = process.env.PORTAL_PREVIEW;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "development";
}
