import type { NextRequest } from "next/server";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { isRecordId } from "@/lib/auth/roles";
import { requireAdmin } from "@/lib/auth/route-helpers";
import { recordAudit } from "@/lib/db/audit";
import { getDb, withTransaction } from "@/lib/db/connection";
import { findUserById } from "@/lib/db/users";
import { MOCKTEST_MESSAGES, mocktestLog, mocktestServerError } from "@/lib/mocktest/http";
import { deleteProfile } from "@/lib/mocktest/store";

type Context = { params: Promise<{ userId: string }> };

/** Audit action for the moderation below (shown as written in the portal's audit log). */
const MOCKTEST_PROFILE_REMOVE_ACTION = "admin.mocktest_profile_remove";

/**
 * DELETE /api/admin/mocktest/profile/:userId — moderation (QA-SEC-M6 L6): deletes a student's
 * mock-test leaderboard profile (nickname, district, school, opt-in), which resets the nickname and
 * takes them off every mock-test leaderboard at once. Their saved attempts stay; they may choose a
 * new nickname later. `{ removed }` (false when there was no profile). Same-origin, admin only
 * (401 / 403, 403 on a temporary password), 400 malformed id, 404 when the account is not a
 * student. Audited (`admin.mocktest_profile_remove`, no nickname in the details).
 */
export async function DELETE(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireAdmin(request, { write: true });
    if (!auth.ok) return auth.response;
    const { userId } = await ctx.params;
    if (!isRecordId(userId)) return portalApiError("bad_request", "Invalid user id.");
    const db = getDb();
    const user = findUserById(db, userId);
    if (!user || user.role !== "student") return portalApiError("not_found", MOCKTEST_MESSAGES.studentNotFound);
    const result = withTransaction(db, () => {
      const outcome = deleteProfile(userId, db);
      recordAudit(db, {
        actorId: auth.session.userId,
        action: MOCKTEST_PROFILE_REMOVE_ACTION,
        target: userId,
        details: { removed: outcome.removed, wasOptedIn: outcome.wasOptedIn },
        now: Date.now(),
      });
      return outcome;
    });
    mocktestLog({ route: "admin_profile", outcome: "success" });
    return portalApiItem({ removed: result.removed });
  } catch (error) {
    return mocktestServerError("admin_profile", error);
  }
}
