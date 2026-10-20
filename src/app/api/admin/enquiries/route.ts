import { requireRole } from "@/lib/auth/guards";
import { portalApiError } from "@/lib/auth/responses";

/**
 * GET /api/admin/enquiries — staff-only enquiry list.
 * 401 signed out, 403 for other roles. Even a signed-in admin gets 503
 * `not_configured`: enquiries are validated and (optionally) forwarded to a webhook,
 * but never stored, so there is no enquiry data to list (docs/api.md).
 */
export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;
  return portalApiError("not_configured", "Enquiries are not stored on this website, so there is nothing to list.");
}
