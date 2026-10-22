/**
 * Browser-side requests for /api/crm/import/** (LR-IMPORT; only the import UI calls these, so
 * they live here and not in CORE's `lead-ops-api.ts`). Pure builders, sent with `sendCrm`.
 */
import type { ImportConsentBasis, ImportRowInput } from "@/lib/crm/intake/rows";
import type { CrmRequest } from "../api";

const batch = (id: string) => `/api/crm/import/batches/${encodeURIComponent(id)}`;

export const importRequests = {
  /** Dry run of one chunk (≤ 250 rows); nothing is written. */
  preview(rows: readonly ImportRowInput[], consentBasis: ImportConsentBasis | null): CrmRequest {
    return { path: "/api/crm/import/preview", method: "POST", body: { rows, consentBasis } };
  },
  start(input: { consentBasis: ImportConsentBasis; startClock: boolean; rowsTotal: number; fileName: string | null; fileSha256: string | null }): CrmRequest {
    return { path: "/api/crm/import/batches", method: "POST", body: input };
  },
  /**
   * One chunk, imported in one transaction. `offset` = rows sent before it; sending the same chunk
   * with the same offset again (after a dropped connection) is safe and is not counted twice.
   */
  rows(batchId: string, rows: readonly ImportRowInput[], offset: number): CrmRequest {
    return { path: `${batch(batchId)}/rows`, method: "POST", body: { rows, offset } };
  },
  finish(batchId: string): CrmRequest {
    return { path: `${batch(batchId)}/finish`, method: "POST", body: {} };
  },
  history(): CrmRequest {
    return { path: "/api/crm/import/batches", method: "GET" };
  },
};
