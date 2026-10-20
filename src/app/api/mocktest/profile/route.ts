import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { MOCKTEST_MESSAGES, mocktestLog, mocktestServerError, rateLimited } from "@/lib/mocktest/http";
import { nicknameIdentityIssue, profileBodySchema } from "@/lib/mocktest/schemas";
import { mocktestLimiters } from "@/lib/mocktest/service";
import { getProfile, saveProfile } from "@/lib/mocktest/store";

/**
 * GET /api/mocktest/profile — the signed-in student's leaderboard profile, or `null` (never created).
 * PUT /api/mocktest/profile — `{ nickname, district, school, showSchool, leaderboardOptIn }`.
 * Opt-in (D-034): nothing appears on a leaderboard until `leaderboardOptIn` is true. The nickname is
 * pseudonymous (3–24 letters / digits / space . _ -, no 6-digit runs, no impersonation) and may not
 * contain the student's login id (`login_id`) or their real name — first name plus another part of
 * the account's display name, ignoring case and spaces (`real_name`, QA-SEC-M6 L6); 422 with the
 * code in `fieldErrors.nickname`, the page shows it in English or Hindi. District is one of
 * Himachal's 12 districts or null; the school is counted only in the aggregate schools table and
 * only with `showSchool` — never shown next to the nickname. Student only (401 / 403), same-origin,
 * JSON ≤ 4 KB, 20 per hour.
 */
export async function GET() {
  try {
    await connection();
    const auth = await requireRole("student");
    if (!auth.ok) return auth.response;
    return portalApiItem(getProfile(auth.session.userId));
  } catch (error) {
    return mocktestServerError("profile", error);
  }
}

export async function PUT(request: Request) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      mocktestLog({ route: "profile", outcome: "forbidden", reason: crossOrigin.reason });
      return crossOrigin.response;
    }
    const auth = await requireRole("student");
    if (!auth.ok) return auth.response;
    const limit = mocktestLimiters.profile.check(auth.session.userId);
    if (!limit.allowed) return rateLimited(limit);

    const body = await parseJsonBody(request, profileBodySchema);
    if (!body.ok) return body.response;

    const identity = nicknameIdentityIssue(body.data.nickname, { displayName: auth.session.displayName, loginId: auth.session.loginId });
    if (identity) return portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: { nickname: [identity] } });
    return portalApiItem(saveProfile(auth.session.userId, body.data, Date.now()));
  } catch (error) {
    return mocktestServerError("profile", error);
  }
}
