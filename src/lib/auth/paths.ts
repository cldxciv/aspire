import { defaultLocale, type Locale } from "@/i18n/config";
import { localePath, splitLocale } from "@/i18n/paths";
import type { Role } from "./roles";

/**
 * Portal / sign-in paths (D-011, D-028, D-029). Pure and client-safe: the proxy, route
 * handlers, server pages and the login form all use these.
 *
 * Every path here is LOCALE-FREE (`/student`, `/login`). Build the public URL with
 * `localePath(path, locale)` (or the `locale` argument of the helpers below), so Hindi
 * visitors stay on `/hi/...`.
 */

/** Landing page of each portal area. */
export const PORTAL_HOME: Readonly<Record<Role, string>> = {
  student: "/student",
  parent: "/parent",
  admin: "/admin",
};

export const LOGIN_PATH = "/login";

/** "Forgot password" help page (no self-service reset: there is no email service, D-029). */
export const FORGOT_PASSWORD_PATH = "/forgot-password";

/**
 * Change-password page for every role, and where accounts with an admin-issued temporary
 * password (`mustChangePassword`) are sent before any portal page.
 */
export const CHANGE_PASSWORD_PATH = "/account/password";

const PORTAL_PAGE = /^\/(student|parent|admin)(?:\/|$)/;
const PORTAL_API = /^\/api\/(student|parent|admin)(?:\/|$)/;
const ACCOUNT_PAGE = /^\/account(?:\/|$)/;

/** `/student`, `/parent`, `/admin` and anything below them. */
export function isPortalPagePath(pathname: string): boolean {
  return PORTAL_PAGE.test(pathname);
}

/** `/account` and anything below it (signed-in account pages shared by every role). */
export function isAccountPagePath(pathname: string): boolean {
  return ACCOUNT_PAGE.test(pathname);
}

/** `/api/student`, `/api/parent`, `/api/admin` and anything below them. */
export function isPortalApiPath(pathname: string): boolean {
  return PORTAL_API.test(pathname);
}

/** Which portal area a page path belongs to, or null for non-portal paths. */
export function portalRoleForPath(pathname: string): Role | null {
  const match = PORTAL_PAGE.exec(pathname);
  return match ? (match[1] as Role) : null;
}

const MAX_NEXT_LENGTH = 512;
// Control characters (incl. tab/CR/LF, which URL parsers silently strip) and DEL.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const SENTINEL_ORIGIN = "https://sanitise.invalid";

/**
 * Sanitises a post-login `next` value so it can only ever point at a portal page on this
 * site. Returns the normalised, LOCALE-FREE pathname (query and hash dropped) or `null` if
 * the value is unsafe or not a portal path.
 *
 * A leading locale segment is accepted and removed (`/hi/student/timetable` and
 * `/en/student/timetable` → `/student/timetable`); the caller re-applies the locale of the
 * page the visitor is on with `localePath()`. The allowlist is unchanged: after the locale
 * segment the path must still be under /student, /parent or /admin.
 *
 * Rejects absolute URLs (`https://evil.com`), protocol-relative URLs (`//evil.com`,
 * `/hi//evil.com`), backslash tricks (`/\evil.com`), control characters, doubled slashes,
 * and anything that normalises outside /student, /parent or /admin.
 */
export function sanitizeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || CONTROL_CHARS.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, SENTINEL_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== SENTINEL_ORIGIN) return null;

  if (url.pathname.includes("//")) return null;
  // Only an exact locale segment counts (`/hi/…`, `/en/…`; not `/hindi/…`).
  const { path } = splitLocale(url.pathname);
  if (path.includes("//")) return null;
  if (!isPortalPagePath(path)) return null;
  return path;
}

/**
 * The login page, plus `?next=<path>` when `next` survives sanitisation. With a `locale`
 * the login page is localised (`/hi/login?next=%2Fstudent`); `next` itself stays locale-free.
 */
export function buildLoginHref(next?: unknown, locale: Locale = defaultLocale): string {
  const safe = sanitizeNextPath(next);
  const href = safe ? `${LOGIN_PATH}?${new URLSearchParams({ next: safe })}` : LOGIN_PATH;
  return localePath(href, locale);
}

/**
 * Where to send a user after sign-in: the sanitised `next` if it is inside their own
 * portal area, otherwise their portal home. Never an off-site or other-role path.
 * Locale-free: the login API returns this as `redirectTo`.
 */
export function postLoginRedirect(role: Role, next?: unknown): string {
  const safe = sanitizeNextPath(next);
  return safe && portalRoleForPath(safe) === role ? safe : PORTAL_HOME[role];
}

/**
 * The public URL a signed-in user is sent to from a page in `locale`: `postLoginRedirect`
 * re-applied (so even a tampered `redirectTo` can only reach the user's own portal) and
 * then localised (`/hi/student/timetable` for Hindi).
 */
export function localizedPostLoginPath(role: Role, next: unknown, locale: Locale): string {
  return localePath(postLoginRedirect(role, next), locale);
}

/**
 * The change-password page in `locale`, carrying a sanitised portal `next` (so a user with
 * a temporary password still lands on the page they asked for once it is changed).
 */
export function buildChangePasswordHref(locale: Locale, next?: unknown): string {
  const safe = sanitizeNextPath(next);
  const href = safe ? `${CHANGE_PASSWORD_PATH}?${new URLSearchParams({ next: safe })}` : CHANGE_PASSWORD_PATH;
  return localePath(href, locale);
}
