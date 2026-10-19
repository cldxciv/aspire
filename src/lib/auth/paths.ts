import type { Role } from "./roles";

/** Landing page of each portal area. */
export const PORTAL_HOME: Readonly<Record<Role, string>> = {
  student: "/student",
  parent: "/parent",
  admin: "/admin",
};

export const LOGIN_PATH = "/login";

const PORTAL_PAGE = /^\/(student|parent|admin)(?:\/|$)/;
const PORTAL_API = /^\/api\/(student|parent|admin)(?:\/|$)/;

/** `/student`, `/parent`, `/admin` and anything below them. */
export function isPortalPagePath(pathname: string): boolean {
  return PORTAL_PAGE.test(pathname);
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
 * Sanitises a post-login `next` value so it can only ever point at a portal
 * page on this site. Returns the normalised pathname (query and hash dropped)
 * or `null` if the value is unsafe or not a portal path.
 *
 * Rejects absolute URLs (`https://evil.com`), protocol-relative URLs
 * (`//evil.com`), backslash tricks (`/\evil.com`), control characters, doubled
 * slashes, and anything that normalises outside /student, /parent or /admin.
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

  const { pathname } = url;
  if (pathname.includes("//")) return null;
  if (!isPortalPagePath(pathname)) return null;
  return pathname;
}

/** `/login`, plus `?next=<path>` when `next` survives sanitisation. */
export function buildLoginHref(next?: unknown): string {
  const safe = sanitizeNextPath(next);
  return safe ? `${LOGIN_PATH}?${new URLSearchParams({ next: safe })}` : LOGIN_PATH;
}
