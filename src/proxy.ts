import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, type Locale } from "@/i18n/config";
import { isNonLocalizedPath, splitLocale } from "@/i18n/paths";
import { isPortalPreviewEnabled, ROBOTS_NOINDEX, SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { buildLoginHref, isAccountPagePath, isPortalApiPath, isPortalPagePath } from "@/lib/auth/paths";
import { isPreviewAuthorized, previewAccessPassword, previewChallenge } from "@/lib/auth/preview-gate";
import { portalApiError } from "@/lib/auth/responses";

/**
 * Proxy (Next 16's renamed middleware). In order:
 *
 * 1. Preview access gate (D-027): every matched route, only when PREVIEW_ACCESS_PASSWORD is set.
 * 2. Portal APIs (D-011): `Cache-Control: no-store`, `X-Robots-Tag`, optimistic 401 JSON when
 *    there is no session hint.
 * 3. Non-localized paths (`/api`, `/_next`, `/images`, `/assets`, `/favicon.ico`, `/robots.txt`,
 *    `/sitemap.xml`, `/.well-known`, files) pass through untouched.
 * 4. Locale routing (D-028): `/en/...` redirects to the unprefixed URL; `/hi/...` is served as
 *    is; unprefixed URLs are rewritten internally to `/en/...` (all routes live under `[lang]`).
 * 5. Portal pages (D-011), checked on the locale-free path: every response carries
 *    `X-Robots-Tag: noindex, nofollow`; without previews or a session hint they redirect to
 *    the login page in the same locale (`/login?next=/student`, `/hi/login?next=/student`).
 * 6. Account pages (`/account/**`, e.g. the change-password page): same `X-Robots-Tag`; without
 *    a session hint they always redirect to the login page in the same locale (no preview).
 *
 * OPTIMISTIC ONLY: it never decides who may see data. Pages re-check via
 * `requirePortalAccess()` and route handlers via `requireRole()`.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Preview access gate (D-027): only when PREVIEW_ACCESS_PASSWORD is configured.
  const previewPassword = previewAccessPassword();
  if (previewPassword && !isPreviewAuthorized(request.headers.get("authorization"), previewPassword)) {
    return previewChallenge();
  }

  if (isPortalApiPath(pathname)) {
    if (!hasSessionHint(request)) return portalApiError("unauthenticated");
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX);
    return response;
  }

  const { locale: prefix, path } = splitLocale(pathname);
  const portalPage = isPortalPagePath(path);
  const accountPage = isAccountPagePath(path);
  const privatePage = portalPage || accountPage;

  // APIs, assets and metadata files are not localized (the matcher still covers some of them for the
  // preview gate). Private paths never take this exit, even when they look like files (`/admin//evil.com`).
  if (!privatePage && isNonLocalizedPath(pathname)) return NextResponse.next();

  // English has no prefix: /en/about → /about (query kept). Temporary, so the URL scheme stays reversible.
  if (prefix === defaultLocale) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.redirect(url);
  }

  const locale: Locale = prefix ?? defaultLocale;

  const needsLogin = portalPage ? !isPortalPreviewEnabled() && !hasSessionHint(request) : accountPage && !hasSessionHint(request);
  if (needsLogin) {
    // `next` stays locale-free (sanitizeNextPath only accepts portal paths, so account pages carry none);
    // the login page is localized.
    const loginHref = buildLoginHref(portalPage ? path : undefined, locale);
    const response = NextResponse.redirect(new URL(loginHref, request.url));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX);
    return response;
  }

  let response: NextResponse;
  if (prefix === null) {
    // Unprefixed = English: serve the /en route without changing the URL.
    const url = request.nextUrl.clone();
    url.pathname = path === "/" ? `/${defaultLocale}` : `/${defaultLocale}${path}`;
    response = NextResponse.rewrite(url);
  } else {
    response = NextResponse.next();
  }

  if (privatePage) response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX);
  return response;
}

/**
 * Cheap "might be signed in" hint: the provider's session cookie is present.
 * Not verified here — presence alone grants nothing. With no provider
 * integrated (`SESSION_COOKIE_NAME === null`) it is always false.
 */
function hasSessionHint(request: NextRequest): boolean {
  return SESSION_COOKIE_NAME !== null && request.cookies.has(SESSION_COOKIE_NAME);
}

export const config = {
  // Everything except Next's own assets and the public design-image folders, so the preview
  // gate covers every page and API. Images are excluded because next/image fetches originals
  // with an internal request that carries no credentials (a 401 there made browsers re-prompt
  // for the password); they hold stock/design images only, no personal data.
  // Locale routing skips the non-localized paths itself (see `isNonLocalizedPath`).
  matcher: ["/((?!_next/|images/|assets/|favicon.ico).*)"],
};
