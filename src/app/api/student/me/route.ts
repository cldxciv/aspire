import { requireRole } from "@/lib/auth/guards";
import { portalApiError } from "@/lib/auth/responses";

/**
 * GET /api/student/me — the signed-in student's own profile.
 * Always 401 today: no identity provider is integrated (getSession() → null).
 * With a valid student session it returns 503 until a student-information
 * system is connected; records must then be looked up by `auth.session.userId`
 * only, never by an id supplied by the client.
 */
export async function GET() {
  const auth = await requireRole("student");
  if (!auth.ok) return auth.response;
  return portalApiError("not_configured", "No student-information system is connected yet.");
}
