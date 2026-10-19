import { requireRole } from "@/lib/auth/guards";
import { portalApiError } from "@/lib/auth/responses";

/**
 * GET /api/admin/enquiries — staff-only enquiry list.
 * Always 401 today: no identity provider is integrated (getSession() → null).
 * Even with a valid admin session it returns 503 until an enquiry store with
 * audit logging is connected; no enquiry data is ever returned from here yet.
 */
export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;
  return portalApiError("not_configured", "No enquiry store is connected yet.");
}
