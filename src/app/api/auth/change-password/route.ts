import { changeOwnPassword } from "@/lib/auth/accounts";
import { authLog } from "@/lib/auth/log";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { PASSWORD_POLICY_MESSAGES } from "@/lib/auth/password";
import { parseJsonBody, rejectCrossOrigin, REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { serverError } from "@/lib/auth/route-helpers";
import { changePasswordBodySchema } from "@/lib/auth/schemas";
import { getCurrentSession } from "@/lib/auth/session";

/**
 * POST /api/auth/change-password — `{ currentPassword, newPassword }` for the signed-in
 * user. Same-origin (403), signed in (401), JSON ≤ 4 KB, policy (10–128 characters,
 * not the login id, not the current password) → 422 with `fieldErrors`. A wrong current
 * password is 422 too and counts towards a 5-per-10-minutes limit (429). On success the
 * temporary-password flag is cleared and all of the user's OTHER sessions are revoked.
 */
export async function POST(request: Request) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      authLog({ action: "change_password", outcome: crossOrigin.outcome, reason: crossOrigin.reason });
      return crossOrigin.response;
    }

    const current = await getCurrentSession();
    if (!current) return portalApiError("unauthenticated");

    const body = await parseJsonBody(request, changePasswordBodySchema);
    if (!body.ok) {
      authLog({ action: "change_password", outcome: body.outcome, reason: body.reason });
      return body.response;
    }

    const result = await changeOwnPassword({
      userId: current.user.id,
      keepTokenHash: current.tokenHash,
      currentPassword: body.data.currentPassword,
      newPassword: body.data.newPassword,
    });

    if (result.ok) {
      authLog({ action: "change_password", outcome: "success" });
      return portalApiItem({ passwordChanged: true, otherSessionsSignedOut: result.revokedSessions });
    }

    switch (result.error) {
      case "not_found":
        return portalApiError("unauthenticated");
      case "rate_limited":
        authLog({ action: "change_password", outcome: "rate_limited" });
        return portalApiError("rate_limited", AUTH_MESSAGES.rateLimited(result.retryAfterSeconds), {
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        });
      case "wrong_current_password":
        authLog({ action: "change_password", outcome: "failed", reason: "wrong_current_password" });
        return portalApiError("validation", REQUEST_MESSAGES.validation, {
          fieldErrors: { currentPassword: [AUTH_MESSAGES.wrongCurrentPassword] },
        });
      case "same_as_current":
        return portalApiError("validation", REQUEST_MESSAGES.validation, {
          fieldErrors: { newPassword: [AUTH_MESSAGES.samePassword] },
        });
      case "policy":
        return portalApiError("validation", REQUEST_MESSAGES.validation, {
          fieldErrors: { newPassword: [PASSWORD_POLICY_MESSAGES[result.issue]] },
        });
    }
  } catch (error) {
    return serverError("change_password", error);
  }
}
