import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { captureLead } from "@/lib/crm/capture";
import { findLeadByPhone } from "@/lib/crm/repo/leads";
import { previewPlace } from "@/lib/crm/routing";
import { getDb, withTransaction } from "@/lib/db/connection";
import { keyedHash, secretBoxStatus } from "@/lib/server/secret-box";

import type { ImportDeps } from "./import";

/**
 * Production wiring of the CSV import service (`import.ts`) to LR-CORE (docs/lead-routing-plan.md
 * §14, §17, §19). Kept apart from `import.ts` so tests can spy on the capture call. Nothing here is
 * cast: tsc checks every contract.
 *
 * - `captureLead(input, now, options)` — §14.2 (`origin`, `existing: "attach"`, `suppression`,
 *   `submissionMeta`, `answers`, `slaClock`, `clockReason: "import"`, `arrivedAt`); it runs the
 *   arrival pipeline (§14.1: routing, assignment, first-call clock) inside its transaction.
 * - `keyedHash(purpose, value[, { previous: true }])` and `secretBoxStatus()` — §19.
 * - `findLeadByPhone` → `LeadRow.areaId` (§13.5) for the "already in the CRM" preview.
 * - `previewPlace(db, …)` — the routing seam's READ-ONLY "which area would this family land in"
 *   (§14.3, owner LR-ROUTING); null = not available (legacy routing mode, or the stub).
 */
export function importDeps(db: DatabaseSync = getDb()): ImportDeps {
  return {
    db,
    transaction: (fn) => withTransaction(db, fn),
    capture: (input, now, options) => captureLead(input, now, options),
    keyConfigured: () => secretBoxStatus().configured,
    keyedHash: (purpose, value) => keyedHash(purpose, value),
    keyedHashPrevious: (purpose, value) => (secretBoxStatus().previousKeyId ? keyedHash(purpose, value, { previous: true }) : null),
    family: (phoneE164) => {
      const lead = findLeadByPhone(db, phoneE164);
      return lead ? { leadId: lead.id, lost: lead.stage === "lost", areaId: lead.areaId } : null;
    },
    resolvePlace: (input) => {
      try {
        return previewPlace(db, { districtInput: input.district, stateInput: input.state, centreSlug: input.centreSlug });
      } catch {
        // The preview must not fail because the place check did; the import routes the lead anyway.
        return null;
      }
    },
  };
}
