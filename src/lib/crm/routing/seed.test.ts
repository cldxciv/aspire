import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SLA seam is LR-SLA's: routing tests never depend on its answers.
vi.mock("@/lib/crm/sla", () => ({
  startSlaClock: vi.fn(() => false),
  onContactLogged: vi.fn(),
  closeSlaClock: vi.fn(),
  recomputeOpenClocks: vi.fn(() => 0),
}));

import { centres } from "@/content/centres";
import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests, withTransaction } from "@/lib/db/connection";

import { findLeadRouting } from "../repo/areas-core";
import { listAliasRows, listAreaRows, listCentreAreas } from "../repo/areas";
import { getAreasSeed } from "../settings";
import { DISTRICT_SEEDS } from "./districts";
import { previewPlace, routeLead } from "./index";
import { findLeadById } from "../repo/leads";
import { buildAliasIndex, resolveDistrict } from "./resolve";
import { ensureAreasSeeded, ensureAreasSeededForRead, seedAliases } from "./seed";
import { lead, phone, T0 } from "./test-kit";

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("ensureAreasSeeded (§13.1)", () => {
  it("writes the 12 districts with Hindi names, serving centres, centres and aliases — once", () => {
    const db = getDb();
    withTransaction(db, () => ensureAreasSeeded(db, T0));
    const areas = listAreaRows(db);
    expect(areas.map((area) => area.id)).toEqual(DISTRICT_SEEDS.map((district) => district.id));
    expect(areas.find((area) => area.id === "solan")).toMatchObject({ nameEn: "Solan", nameHi: "सोलन", defaultCentreSlug: "shimla", kind: "district", active: true });
    expect(areas.find((area) => area.id === "lahaul-spiti")).toMatchObject({ nameHi: "लाहौल और स्पीति", defaultCentreSlug: "kullu" });
    expect(Object.fromEntries(listCentreAreas(db))).toEqual({ dharamshala: "kangra", hamirpur: "hamirpur", kullu: "kullu", shimla: "shimla" });
    const aliasCount = listAliasRows(db).length;
    expect(aliasCount).toBe(DISTRICT_SEEDS.reduce((sum, district) => sum + seedAliases(district).length, 0));
    expect(getAreasSeed(db)).toMatchObject({ version: 1 });

    // Idempotent: a second run (and a run after an admin renamed an area) changes nothing.
    db.prepare("UPDATE crm_areas SET name_en = 'Renamed' WHERE id = 'una'").run();
    withTransaction(db, () => ensureAreasSeeded(db, T0 + 1000));
    expect(listAreaRows(db)).toHaveLength(12);
    expect(listAliasRows(db)).toHaveLength(aliasCount);
    expect(listAreaRows(db).find((area) => area.id === "una")?.nameEn).toBe("Renamed");
  });

  it("is lazy, writes no audit and no activity rows, and never runs again once marked", () => {
    const db = getDb();
    expect(listAreaRows(db)).toHaveLength(0);
    ensureAreasSeededForRead(db, T0);
    expect(listAreaRows(db)).toHaveLength(12);
    expect(listAudit(db, { limit: 50 })).toEqual([]);
    expect(Number(db.prepare("SELECT COUNT(*) AS n FROM crm_activities").get()?.n)).toBe(0);
    // The marker stays: deleting every area does not bring the seed back.
    db.prepare("DELETE FROM crm_areas").run();
    withTransaction(db, () => ensureAreasSeeded(db, T0));
    expect(listAreaRows(db)).toHaveLength(0);
  });

  it("is rolled back with its transaction and runs again next time", () => {
    const db = getDb();
    expect(() =>
      withTransaction(db, () => {
        ensureAreasSeeded(db, T0);
        throw new Error("capture failed");
      }),
    ).toThrow("capture failed");
    expect(getAreasSeed(db)).toBeNull();
    withTransaction(db, () => ensureAreasSeeded(db, T0));
    expect(listAreaRows(db)).toHaveLength(12);
  });

  it("matches the centre map in src/content/centres.ts (district and servesDistricts)", () => {
    const index = buildAliasIndex(DISTRICT_SEEDS.flatMap((district) => seedAliases(district).map((alias) => ({ ...alias, areaId: district.id }))));
    const areaOfName = (name: string) => resolveDistrict(name, null, index).areaId;
    for (const centre of centres) {
      const home = DISTRICT_SEEDS.find((district) => district.id === areaOfName(centre.district));
      expect(home?.centres, `${centre.slug} is in ${centre.district}`).toContain(centre.slug);
      for (const served of centre.servesDistricts ?? []) {
        const district = DISTRICT_SEEDS.find((item) => item.id === areaOfName(served));
        expect(district?.defaultCentre, `${served} is served by ${centre.slug}`).toBe(centre.slug);
      }
    }
    const seededCentres = DISTRICT_SEEDS.flatMap((district) => district.centres).sort();
    expect(seededCentres).toEqual(centres.map((centre) => centre.slug).sort());
  });
});

describe("routeLead (§13.4 step 1)", () => {
  it("routes by centre first, else by the place, and always writes a row for a new lead", () => {
    const byCentre = lead(phone(), { centreSlug: "dharamshala", district: "Shimla" });
    expect(findLeadRouting(getDb(), byCentre.leadId)).toMatchObject({ areaId: "kangra", match: "centre", outcome: "area", placeInput: "Shimla", routedBy: null });
    const byPlace = lead(phone(), { district: "Nahan" });
    expect(findLeadRouting(getDb(), byPlace.leadId)).toMatchObject({ areaId: "sirmaur", match: "town", placeKey: "nahan" });
    const none = lead(phone());
    expect(findLeadRouting(getDb(), none.leadId)).toMatchObject({ areaId: null, outcome: "empty", gateOnly: false });
    const unknown = lead(phone(), { district: "Atlantis" });
    expect(findLeadRouting(getDb(), unknown.leadId)).toMatchObject({ areaId: null, outcome: "unknown", placeInput: "Atlantis", placeKey: "atlantis" });
  });

  it("only changes an existing lead's area when it had none and the new input resolves", () => {
    const number = phone();
    const first = lead(number, { district: "Atlantis" });
    lead(number, { district: "Manali" }, T0 + 1000);
    expect(findLeadRouting(getDb(), first.leadId)).toMatchObject({ areaId: "kullu", match: "town", placeInput: "Manali" });
    lead(number, { district: "Nahan" }, T0 + 2000);
    expect(findLeadRouting(getDb(), first.leadId)?.areaId).toBe("kullu");
    // Empty input on a later arrival keeps what is there.
    const other = phone();
    const second = lead(other, { district: "Atlantis" });
    lead(other, {}, T0 + 1000);
    expect(findLeadRouting(getDb(), second.leadId)).toMatchObject({ outcome: "unknown", placeInput: "Atlantis" });
  });

  it("keeps gate_only while every arrival is a tool sign-up", () => {
    const number = phone();
    const gate = lead(number, { source: "tool" }, T0, { gate: true });
    expect(findLeadRouting(getDb(), gate.leadId)?.gateOnly).toBe(true);
    lead(number, { source: "tool" }, T0 + 1000, { gate: true });
    expect(findLeadRouting(getDb(), gate.leadId)?.gateOnly).toBe(true);
    lead(number, { source: "admissions" }, T0 + 2000);
    expect(findLeadRouting(getDb(), gate.leadId)?.gateOnly).toBe(false);
  });

  it("is callable directly with the seam signature", () => {
    const created = lead(phone());
    const db = getDb();
    const row = findLeadById(db, created.leadId);
    if (!row) throw new Error("missing lead");
    const result = withTransaction(db, () => routeLead(db, row, { districtInput: "Baddi", stateInput: null, gate: false, at: T0, actorId: null }));
    expect(result).toEqual({ areaId: "solan", outcome: "area", match: "town" });
  });
});

describe("previewPlace (import preview seam)", () => {
  it("is null before the seed and in legacy mode, and never writes", () => {
    const db = getDb();
    expect(previewPlace(db, { districtInput: "Nahan", stateInput: null, centreSlug: null })).toBeNull();
    ensureAreasSeededForRead(db, T0);
    expect(previewPlace(db, { districtInput: "Nahan", stateInput: null, centreSlug: null })).toEqual({ areaId: "sirmaur", outcome: "area" });
    expect(previewPlace(db, { districtInput: "Nahan", stateInput: null, centreSlug: "kullu" })).toEqual({ areaId: "kullu", outcome: "area" });
    expect(previewPlace(db, { districtInput: "Bilaspur", stateInput: "Chhattisgarh", centreSlug: null })).toEqual({ areaId: null, outcome: "outside_hp" });
    db.prepare("INSERT INTO crm_settings (key, value, version, updated_at) VALUES ('routing', '{\"mode\":\"legacy\"}', 1, ?)").run(T0);
    expect(previewPlace(db, { districtInput: "Nahan", stateInput: null, centreSlug: null })).toBeNull();
    expect(Number(db.prepare("SELECT COUNT(*) AS n FROM crm_lead_routing").get()?.n)).toBe(0);
  });
});
