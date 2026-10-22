/**
 * TEST HELPER (not shipped): test-defined answers for the routing and SLA seams
 * (docs/lead-routing-plan.md §14.3). LR-ROUTING and LR-SLA replace those seams in parallel, so the
 * import's tests never depend on a stub's or a sibling package's real answers (P5): they check the
 * CALLS the import causes. Imports nothing from the app (it is loaded inside `vi.mock` factories).
 *
 *   vi.mock("@/lib/crm/routing", async (original) => ({ ...(await original()), ...(await import("./fixtures/seams")).routingSeam() }));
 *   vi.mock("@/lib/crm/sla", async (original) => ({ ...(await original()), ...(await import("./fixtures/seams")).slaSeam() }));
 */
import { vi } from "vitest";

type PlaceInput = { districtInput: string | null; stateInput: string | null; centreSlug: string | null };

/**
 * The preview's "where would this family land": Kangra for Kangra / Dharamshala (the centre or the
 * typed place), "empty" with nothing typed, "unknown" otherwise.
 */
export function testPreviewPlace(_db: unknown, input: PlaceInput): { areaId: string | null; outcome: "area" | "unknown" | "empty" } {
  const place = input.districtInput ?? "";
  if (!place) return { areaId: null, outcome: "empty" };
  return /kangra|dharamshala|धर्मशाला/i.test(place) ? { areaId: "kangra", outcome: "area" } : { areaId: null, outcome: "unknown" };
}

/** Routing seam: no seed, no area, nobody picked, everyone assignable; the preview as above. */
export function routingSeam() {
  return {
    ensureAreasSeeded: vi.fn(),
    routeLead: vi.fn(() => ({ areaId: null, outcome: "empty" as const, match: null })),
    pickAssigneeForLead: vi.fn(() => null),
    isAssignable: vi.fn(() => true),
    setUserAreas: vi.fn(() => ({ ok: true as const })),
    previewPlace: vi.fn(testPreviewPlace),
  };
}

/** SLA seam: records calls only. */
export function slaSeam() {
  return {
    startSlaClock: vi.fn(() => false),
    onContactLogged: vi.fn(),
    closeSlaClock: vi.fn(),
    recomputeOpenClocks: vi.fn(() => 0),
  };
}
