/**
 * Request builders for the 1B-SOURCES endpoints (docs/admin-phase-1b-plan.md §8). Pure (path,
 * method, body), so tests check them without a network; run one with `sendCrm` or
 * `useCrmAction(...).run(request)`. The servers re-validate everything.
 */
import type { CrmRequest } from "@/components/crm/api";

export const sourcesRequests = {
  /** GET /api/crm/sources (CRM admins and area heads). */
  report(query: { range?: string; from?: string; to?: string; centre?: string } = {}): CrmRequest {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    const text = params.toString();
    return { path: `/api/crm/sources${text ? `?${text}` : ""}`, method: "GET" };
  },
  /** GET /api/crm/settings/centre-links. */
  getCentreLinks(): CrmRequest {
    return { path: "/api/crm/settings/centre-links", method: "GET" };
  },
  /** PUT /api/crm/settings/centre-links (super admins; `mapsUrl: null` = no link). */
  saveCentreLinks(centres: Record<string, { mapsUrl: string | null }>, expectedVersion: number): CrmRequest {
    return { path: "/api/crm/settings/centre-links", method: "PUT", body: { centres, expectedVersion } };
  },
};
