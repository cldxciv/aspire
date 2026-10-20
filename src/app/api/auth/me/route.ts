import { cookies } from "next/headers";

import { getAccountSummary } from "@/lib/auth/accounts";
import { AUTH_COOKIE_NAME } from "@/lib/auth/config";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/cookie";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { serverError } from "@/lib/auth/route-helpers";
import { getCurrentSession } from "@/lib/auth/session";

/**
 * GET /api/auth/me — the signed-in account: `{ id, role, displayName, loginId,
 * mustChangePassword, linkedStudents? (parents: id + display name), sessionExpiresAt }`.
 * 401 when signed out (a stale cookie is cleared). Re-issues the cookie when the
 * session's expiry was just extended. Never returns hashes or tokens.
 */
export async function GET() {
  try {
    const current = await getCurrentSession();
    const summary = current ? getAccountSummary(current.user.id) : null;
    if (!current || !summary) {
      const response = portalApiError("unauthenticated");
      if ((await cookies()).has(AUTH_COOKIE_NAME)) clearSessionCookie(response);
      return response;
    }
    const response = portalApiItem({ ...summary, sessionExpiresAt: new Date(current.expiresAt).toISOString() });
    if (current.refreshed) setSessionCookie(response, current.token, current.expiresAt);
    return response;
  } catch (error) {
    return serverError("me", error);
  }
}
