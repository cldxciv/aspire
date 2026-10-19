/**
 * Portal auth configuration (docs/auth-and-portals.md, decision D-011).
 * Safe to import from the proxy, route handlers and server components.
 */

/** Sent on every portal page and portal API response. */
export const ROBOTS_NOINDEX = "noindex, nofollow";

/**
 * Name of the identity provider's session cookie. The proxy uses it ONLY as an
 * optimistic "might be signed in" hint; pages and route handlers always verify
 * the session again through `getSession()`.
 *
 * `null` = no identity provider is integrated, so the proxy treats every request
 * as signed out. Set this when a provider is connected (see the docs).
 */
export const SESSION_COOKIE_NAME: string | null = null;

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
