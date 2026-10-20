import type { NextRequest } from "next/server";

import { portalApiError, portalApiList } from "@/lib/auth/responses";
import { isTaskRange, myTasks } from "@/lib/crm";
import { crmServerError, requireCrm } from "@/lib/crm/http";

const ROUTE = "tasks";

/** GET /api/crm/tasks[?range=today|overdue|upcoming|open|done] — the viewer's own tasks (`MyTask[]`). */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const range = request.nextUrl.searchParams.get("range") ?? "open";
    if (!isTaskRange(range)) return portalApiError("bad_request", "range must be today, overdue, upcoming, open or done.");
    return portalApiList(myTasks(auth.viewer, range, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
