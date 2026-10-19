import { requireRole } from "@/lib/auth/guards";
import { portalApiError } from "@/lib/auth/responses";

/**
 * GET /api/parent/students — learners linked to the signed-in parent.
 * Always 401 today: no identity provider is integrated (getSession() → null).
 * With a valid parent session it returns 503 until a student-information system
 * is connected; the list must then be limited to `auth.session.linkedStudentIds`.
 */
export async function GET() {
  const auth = await requireRole("parent");
  if (!auth.ok) return auth.response;
  return portalApiError("not_configured", "No student-information system is connected yet.");
}
