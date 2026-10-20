import { getLinkedStudents } from "@/lib/auth/accounts";
import { requireRole } from "@/lib/auth/guards";
import { portalApiList } from "@/lib/auth/responses";

/**
 * GET /api/parent/students — learners linked to the signed-in parent by an admin:
 * `[{ id, displayName }]` only (disabled learner accounts are left out). Resolved from
 * the session's own user id; no academic data is connected yet.
 */
export async function GET() {
  const auth = await requireRole("parent");
  if (!auth.ok) return auth.response;
  return portalApiList(getLinkedStudents(auth.session.userId));
}
