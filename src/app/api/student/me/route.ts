import { getAccountSummary } from "@/lib/auth/accounts";
import { requireRole } from "@/lib/auth/guards";
import { NOT_CONNECTED_AREAS } from "@/lib/auth/messages";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";

/**
 * GET /api/student/me — the signed-in student's own account. Looked up by the
 * session's `userId` only, never an id from the client. No academic data exists yet
 * (no student-information system is connected), so the response says so explicitly in
 * `notConnected` instead of inventing a timetable, results or attendance.
 */
export async function GET() {
  const auth = await requireRole("student");
  if (!auth.ok) return auth.response;
  const account = getAccountSummary(auth.session.userId);
  if (!account) return portalApiError("unauthenticated");
  return portalApiItem({
    id: account.id,
    displayName: account.displayName,
    loginId: account.loginId,
    notConnected: [...NOT_CONNECTED_AREAS],
  });
}
