import { getLinkedStudents } from "@/lib/auth/accounts";
import { requireStudentRecord } from "@/lib/auth/guards";
import { NOT_CONNECTED_AREAS } from "@/lib/auth/messages";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";

/**
 * GET /api/parent/students/:studentId — one linked learner.
 * Role check (parent) AND record-level check (`studentId` must be in the session's
 * `linkedStudentIds`, which come from the server-side parent_links table). Returns the
 * learner's display name only, plus `notConnected` for the academic areas that have no
 * data source yet.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await ctx.params;
  const auth = await requireStudentRecord(studentId, "parent");
  if (!auth.ok) return auth.response;
  const student = getLinkedStudents(auth.session.userId).find((linked) => linked.id === studentId);
  if (!student) return portalApiError("forbidden");
  return portalApiItem({ id: student.id, displayName: student.displayName, notConnected: [...NOT_CONNECTED_AREAS] });
}
