import type { NextRequest } from "next/server";

import { qbResponse, qbServerError, requireQbAdmin } from "../_lib/http";
import { listMembers } from "../_lib/services";

const ROUTE = "members";

/**
 * GET /api/admin/qb/members — the question-bank team (`manage_team`, admins) → `QbTeamView`:
 * memberships of `staff` accounts (author / reviewer, subject scope, active) and the staff accounts
 * without one. Accounts are created on /admin/users; CRM memberships are never read or written here.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "manage_team", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return qbResponse(await listMembers(auth.viewer));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
