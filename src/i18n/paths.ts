import { defaultLocale, isLocale, type Locale } from "./config";

/**
 * Locale-aware URL helpers (D-028). Pure and client-safe; also used by `src/proxy.ts`.
 *
 * Public URLs: English unprefixed (`/about`), Hindi prefixed (`/hi/about`).
 * Internal route paths (after the proxy rewrite): `/en/about`, `/hi/about`.
 */

/**
 * Paths that are never localized: API routes, Next internals, public asset folders,
 * metadata files and `/.well-known`. The proxy passes them through untouched and
 * `localePath()` returns them unchanged.
 */
const NON_LOCALIZED_PREFIX = /^\/(?:api|_next|images|assets|\.well-known)(?:\/|$)/;
const NON_LOCALIZED_FILE = /^\/(?:favicon\.ico|robots\.txt|sitemap\.xml)$/;
/** A last path segment with a file extension (`/og.png`, `/manifest.webmanifest`): a file, not a page. */
const FILE_LIKE = /\/[^/]*\.[a-z0-9]+$/i;

/** True for paths the locale routing must leave alone (see NON_LOCALIZED_* above). */
export function isNonLocalizedPath(pathname: string): boolean {
  return NON_LOCALIZED_PREFIX.test(pathname) || NON_LOCALIZED_FILE.test(pathname) || FILE_LIKE.test(pathname);
}

/**
 * Splits a leading locale segment off a pathname.
 * `/hi/about` → `{ locale: "hi", path: "/about" }`, `/en` → `{ locale: "en", path: "/" }`,
 * `/about` → `{ locale: null, path: "/about" }`. Only exact segments count (`/hindi` is not `hi`).
 */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const segment = pathname.split("/")[1] ?? "";
  if (pathname.startsWith("/") && isLocale(segment)) {
    const rest = pathname.slice(segment.length + 1);
    return { locale: segment, path: rest === "" ? "/" : rest };
  }
  return { locale: null, path: pathname === "" ? "/" : pathname };
}

/** The locale-free path: `/hi/about` → `/about`, `/en` → `/`, `/about` → `/about`. */
export function stripLocale(pathname: string): string {
  return splitLocale(pathname).path;
}

/** The locale a pathname belongs to; unprefixed paths are English. */
export function localeFromPathname(pathname: string): Locale {
  return splitLocale(pathname).locale ?? defaultLocale;
}

/**
 * Builds a public href for `locale`. Use it for EVERY internal link.
 *
 * - `localePath("/about", "en")` → `/about`; `localePath("/about", "hi")` → `/hi/about`
 * - `localePath("/", "hi")` → `/hi`; query strings and hashes are kept
 *   (`/admissions#enquiry` → `/hi/admissions#enquiry`, `/login?role=student` → `/hi/login?role=student`)
 * - Idempotent / switchable: an existing locale prefix is replaced (`localePath("/hi/about", "en")` → `/about`).
 * - Left unchanged: external URLs, `mailto:`/`tel:`, protocol-relative `//x`, pure `#anchors`/`?query`,
 *   and non-localized paths (`/api/...`, `/images/...`, `/assets/...`, `/sitemap.xml`, files).
 */
export function localePath(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const pathname = cut === -1 ? href : href.slice(0, cut);
  const suffix = cut === -1 ? "" : href.slice(cut);
  if (isNonLocalizedPath(pathname)) return href;
  const path = stripLocale(pathname);
  if (locale === defaultLocale) return `${path}${suffix}`;
  return `${path === "/" ? `/${locale}` : `/${locale}${path}`}${suffix}`;
}
