import { requireStudentRecord } from "@/lib/auth/guards";
import { portalApiError } from "@/lib/auth/responses";

/**
 * GET /api/parent/students/:studentId — one linked learner.
 * Role check (parent) AND record-level check (`studentId` must be in the
 * session's `linkedStudentIds`). Always 401 today: no identity provider is
 * integrated. A linked learner still gets 503 until a student-information
 * system is connected.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/parent/students/[studentId]">) {
  const { studentId } = await ctx.params;
  const auth = await requireStudentRecord(studentId, "parent");
  if (!auth.ok) return auth.response;
  return portalApiError("not_configured", "No student-information system is connected yet.");
}
