import type { NextRequest } from "next/server";

import { recordSignOut } from "@/lib/auth/accounts";
import { AUTH_COOKIE_NAME } from "@/lib/auth/config";
import { clearSessionCookie } from "@/lib/auth/cookie";
import { authLog } from "@/lib/auth/log";
import { rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiItem } from "@/lib/auth/responses";
import { serverError } from "@/lib/auth/route-helpers";
import { resolveSessionToken, revokeSessionToken } from "@/lib/auth/sessions";

/**
 * POST /api/auth/logout — same-origin only (403 otherwise). Deletes the session row
 * behind the cookie and expires the cookie. Idempotent: signed-out callers also get
 * 200 `{ signedOut: true }`. No request body.
 */
export async function POST(request: NextRequest) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      authLog({ action: "logout", outcome: crossOrigin.outcome, reason: crossOrigin.reason });
      return crossOrigin.response;
    }

    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const current = resolveSessionToken(token);
      revokeSessionToken(token);
      if (current) recordSignOut(current.user.id);
    }

    const response = portalApiItem({ signedOut: true });
    clearSessionCookie(response);
    authLog({ action: "logout", outcome: "success" });
    return response;
  } catch (error) {
    return serverError("logout", error);
  }
}
