/**
 * TEST HELPER (not shipped): test-defined answers for the routing and SLA seams
 * (docs/lead-routing-plan.md §14.3). LR-ROUTING and LR-SLA replace those seams in parallel, so
 * LR-META's tests never depend on a sibling's real answers (P5): they check the CALLS a Meta lead
 * causes (e.g. `startSlaClock` with `arrivedAt` = the inbox `received_at`). Imports nothing from the
 * app (it is loaded inside `vi.mock` factories):
 *
 *   vi.mock("@/lib/crm/routing", async (original) => ({ ...(await original()), ...(await import("./fixtures/seams")).routingSeam() }));
 *   vi.mock("@/lib/crm/sla", async (original) => ({ ...(await original()), ...(await import("./fixtures/seams")).slaSeam() }));
 */
import { vi } from "vitest";

/** Test-defined routing / SLA seams (LR-ROUTING and LR-SLA replace them in parallel; P5). */
export function routingSeam() {
  return {
    ensureAreasSeeded: vi.fn(),
    routeLead: vi.fn(() => ({ areaId: null, outcome: "empty" as const, match: null })),
    pickAssigneeForLead: vi.fn(() => null),
    isAssignable: vi.fn(() => true),
    setUserAreas: vi.fn(() => ({ ok: true as const })),
  };
}

export function slaSeam() {
  return {
    startSlaClock: vi.fn(() => false),
    onContactLogged: vi.fn(),
    closeSlaClock: vi.fn(),
    recomputeOpenClocks: vi.fn(() => 0),
  };
}
