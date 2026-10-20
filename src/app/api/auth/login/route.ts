import type { NextRequest } from "next/server";

import { signIn, startSession } from "@/lib/auth/accounts";
import { AUTH_COOKIE_NAME } from "@/lib/auth/config";
import { setSessionCookie } from "@/lib/auth/cookie";
import { authLog } from "@/lib/auth/log";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { postLoginRedirect } from "@/lib/auth/paths";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { serverError } from "@/lib/auth/route-helpers";
import { loginBodySchema } from "@/lib/auth/schemas";
import { getClientIp } from "@/lib/server/request-guards";

/**
 * POST /api/auth/login — `{ loginId, password, role?, next? }`.
 *
 * Checks, in order: same origin (403) → JSON content type (415) → body ≤ 4 KB (413) →
 * shape (400/422) → throttle (429: 5 failures per login id, 20 per IP, per 10 min) →
 * credentials. Every credential failure (unknown id, wrong password, disabled account,
 * role-tab mismatch) is the same 401 "Incorrect login ID or password." after the same
 * scrypt work. On success: 200 `{ role, displayName, mustChangePassword, redirectTo }`
 * and a fresh `aspire_session` cookie (any previous session of this browser is revoked).
 */
export async function POST(request: NextRequest) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      authLog({ action: "login", outcome: crossOrigin.outcome, reason: crossOrigin.reason });
      return crossOrigin.response;
    }

    const body = await parseJsonBody(request, loginBodySchema);
    if (!body.ok) {
      authLog({ action: "login", outcome: body.outcome, reason: body.reason });
      return body.response;
    }

    const result = await signIn({
      loginId: body.data.loginId,
      password: body.data.password,
      role: body.data.role,
      clientIp: getClientIp(request.headers),
    });

    if (!result.ok) {
      if (result.error === "rate_limited") {
        authLog({ action: "login", outcome: "rate_limited" });
        return portalApiError("rate_limited", AUTH_MESSAGES.rateLimited(result.retryAfterSeconds), {
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        });
      }
      authLog({ action: "login", outcome: "failed", reason: result.reason });
      return portalApiError("unauthenticated", AUTH_MESSAGES.loginFailed);
    }

    const { user } = result;
    const now = Date.now();
    const session = startSession(user, {
      userAgent: request.headers.get("user-agent"),
      previousToken: request.cookies.get(AUTH_COOKIE_NAME)?.value ?? null,
      now,
    });
    const response = portalApiItem({
      role: user.role,
      displayName: user.displayName,
      mustChangePassword: user.mustChangePassword,
      redirectTo: postLoginRedirect(user.role, body.data.next),
    });
    setSessionCookie(response, session.token, session.expiresAt, now);
    authLog({ action: "login", outcome: "success" });
    return response;
  } catch (error) {
    return serverError("login", error);
  }
}
