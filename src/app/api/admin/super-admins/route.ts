import type { NextRequest } from "next/server";

import { portalApiItem } from "@/lib/auth/responses";
import { requireAdmin, serverError } from "@/lib/auth/route-helpers";
import { listSuperAdmins } from "@/lib/auth/super-admin";

/**
 * GET /api/admin/super-admins — `{ items: SuperAdminEntry[], youAreSuperAdmin, bootstrapPending }`
 * (docs/lead-routing-plan.md §11, §21; D-044). Any admin may read it: names, login ids and how
 * each grant was made, never a secret. Runs the one-time bootstrap rule (exactly one enabled admin
 * and no grant rows yet → that admin becomes super admin, audited); `bootstrapPending` = nobody is
 * an effective super admin (every admin then sees "run the server command").
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, { write: false });
    if (!auth.ok) return auth.response;
    return portalApiItem(listSuperAdmins(auth.session.userId));
  } catch (error) {
    return serverError("admin_users", error);
  }
}
