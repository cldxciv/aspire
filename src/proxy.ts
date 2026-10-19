import { NextResponse, type NextRequest } from "next/server";
import { isPortalPreviewEnabled, ROBOTS_NOINDEX, SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { buildLoginHref, isPortalApiPath, isPortalPagePath } from "@/lib/auth/paths";
import { portalApiError } from "@/lib/auth/responses";

/**
 * Portal proxy (Next 16's renamed middleware — D-011). OPTIMISTIC ONLY: it never
 * decides who may see data. Pages re-check via `requirePortalAccess()` and route
 * handlers via `requireRole()`.
 *
 * - Every matched response carries `X-Robots-Tag: noindex, nofollow`.
 * - Portal APIs: `Cache-Control: no-store`; 401 JSON when there is no session hint.
 * - Portal pages: continue when previews are enabled or a session hint exists,
 *   otherwise redirect to `/login?next=<sanitised portal path>`.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPortalApiPath(pathname)) {
    if (!hasSessionHint(request)) return portalApiError("unauthenticated");
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX);
    return response;
  }

  if (isPortalPagePath(pathname) && !isPortalPreviewEnabled() && !hasSessionHint(request)) {
    const response = NextResponse.redirect(new URL(buildLoginHref(pathname), request.url));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX);
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX);
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
  matcher: [
    "/student/:path*",
    "/parent/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/student/:path*",
    "/api/parent/:path*",
  ],
};
