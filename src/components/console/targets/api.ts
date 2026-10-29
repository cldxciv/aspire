/**
 * Request builders for the targets endpoint (docs/admin-phase-1b-plan.md §5.B, §8; owner:
 * 1B-NUMBERS). Pure (path, method, body), so tests check them without a network; run one with
 * `sendCrm` or `useCrmAction(...).run(request)`. The server re-validates everything.
 */
import type { CrmRequest } from "@/components/crm/api";
import type { ConsoleProgram, SessionKey, TargetMetric } from "@/lib/crm/console/types";

export const targetsRequests = {
  /** GET /api/crm/targets?period=S2026 (CRM admins and area heads). */
  get(period?: SessionKey): CrmRequest {
    return { path: period ? `/api/crm/targets?period=${encodeURIComponent(period)}` : "/api/crm/targets", method: "GET" };
  },
  /** PUT /api/crm/targets (super admins): replaces every cell of one session × metric. */
  save(
    period: SessionKey,
    metric: TargetMetric,
    cells: { centreSlug: string; program: ConsoleProgram; value: number }[],
    expectedUpdatedAt: string | null,
  ): CrmRequest {
    return { path: "/api/crm/targets", method: "PUT", body: { period, metric, cells, expectedUpdatedAt } };
  },
};
