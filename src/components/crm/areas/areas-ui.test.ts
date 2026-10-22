import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Client islands call useRouter().refresh(); outside the App Router a stub is enough for static markup.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/crm/settings/areas",
}));

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import enCrm from "@/i18n/messages/en/crm";
import enAreas from "@/i18n/messages/en/crm-areas";
import hiCrm from "@/i18n/messages/hi/crm";
import hiAreas from "@/i18n/messages/hi/crm-areas";
import type { AreaResolution, CrmArea, UnmatchedPlace } from "@/lib/crm/lead-ops-types";
import { AddLeadForm } from "../AddLeadForm";
import { EMPTY_MANUAL_LEAD, manualLeadRequest } from "../lead-forms";
import { AreasManager } from "./AreasManager";
import {
  areaName,
  areaPageRequests,
  areasNeedingPeople,
  areasServedBy,
  awayDayIssue,
  coverageBadges,
  mergeIssue,
  peopleInReach,
  resolutionText,
  suggestedKind,
  suggestedLabel,
  type AreaPersonView,
  type AreasMessages,
} from "./model";
import { initialChoices } from "./PeoplePicker";

// Synthetic fixtures only (no real people, no mock-up names).
const NOW = Date.parse("2026-10-20T06:30:00.000Z"); // 12:00 IST

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

function messages(locale: Locale): AreasMessages {
  const t = locale === "hi" ? hiCrm : enCrm;
  return { a: t.areasAdmin, common: t.common, errors: t.errors, roles: t.roles };
}

/** Every <select>, <textarea> and non-hidden <input> has a <label for> or sits inside a <label>. */
function expectLabelledControls(html: string) {
  for (const [, tag, attrs] of html.matchAll(/<(select|textarea|input)\b([^>]*)>/g)) {
    if (/type="(hidden|submit)"/.test(attrs)) continue;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (id && html.includes(`for="${id}"`)) continue;
    expect(/type="(radio|checkbox)"/.test(attrs) || /aria-label="/.test(attrs), `${tag} ${attrs}`).toBe(true);
  }
}

function area(id: string, overrides: Partial<CrmArea> = {}): CrmArea {
  return {
    id,
    nameEn: `Area ${id}`,
    nameHi: `क्षेत्र ${id}`,
    kind: "district",
    defaultCentreSlug: null,
    active: true,
    mergedInto: null,
    position: 0,
    centres: [],
    aliases: [],
    members: [],
    coverage: { hasExecutive: true, hasHead: true, coveredBy: null },
    ...overrides,
  };
}

const north = area("north", {
  centres: ["centre-a"],
  defaultCentreSlug: "centre-a",
  aliases: [{ key: "northtown", label: "North Town", kind: "town" }],
  members: [
    { userId: "u-head", displayName: "Head One", crmRole: "manager", centreSlug: null, takesLeads: true, active: true, disabled: false, awayUntil: null },
    { userId: "u-exec", displayName: "Exec One", crmRole: "counsellor", centreSlug: "centre-a", takesLeads: true, active: true, disabled: false, awayUntil: null },
  ],
});
const south = area("south", { defaultCentreSlug: "centre-a", coverage: { hasExecutive: false, hasHead: false, coveredBy: "north" } });
const merged = area("old", { active: false, mergedInto: "north" });
const AREAS = [north, south, merged];
const CENTRES = [{ value: "centre-a", label: "Centre A" }];
const PEOPLE: AreaPersonView[] = [
  { userId: "u-head", displayName: "Head One", crmRole: "manager", active: true, disabled: false, areaIds: ["north"], awayUntil: null, areaScope: true },
  { userId: "u-exec", displayName: "Exec One", crmRole: "counsellor", active: true, disabled: false, areaIds: ["north"], awayUntil: null, areaScope: false },
  { userId: "u-far", displayName: "Exec Far", crmRole: "counsellor", active: true, disabled: false, areaIds: ["south"], awayUntil: "2026-10-25T18:30:00.000Z", areaScope: false },
  { userId: "u-legacy", displayName: "Legacy Head", crmRole: "manager", active: true, disabled: false, areaIds: [], awayUntil: null, areaScope: false },
];
const UNMATCHED: UnmatchedPlace[] = [{ key: "farawaytownstate", sample: "Faraway Town, Some State", count: 3, open: 2, outcomes: ["outside_hp"] }];

function render(locale: Locale, role: "sa" | "admin" | "head") {
  return inLocale(
    locale,
    createElement(AreasManager, {
      areas: AREAS,
      people: PEOPLE,
      routing: { mode: "areas", version: 0 },
      legacyManagerIds: ["u-legacy"],
      unmatched: role === "sa" ? UNMATCHED : null,
      centres: CENTRES,
      canEdit: role === "sa",
      viewer: { userId: role === "head" ? "u-head" : "u-admin", superAdmin: role === "sa", isManager: role === "head", areaIds: role === "head" ? ["north"] : [] },
      t: messages(locale),
    }),
  );
}

describe("messages", () => {
  function shape(value: unknown): unknown {
    if (typeof value !== "object" || value === null) return typeof value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]));
  }

  it("has the same keys in English and Hindi, and Hindi text everywhere", () => {
    expect(shape(hiAreas)).toEqual(shape(enAreas));
    const hiTexts = JSON.stringify(hiAreas);
    expect(/[ऀ-ॿ]/.test(hiTexts)).toBe(true);
    expect(enCrm.areasAdmin).toBe(enAreas);
    expect(hiCrm.areasAdmin).toBe(hiAreas);
  });

  it("never names a district or town (the mock-up string guard)", () => {
    for (const text of [JSON.stringify(enAreas), JSON.stringify(hiAreas)]) {
      for (const word of ["Solan", "Palampur", "Kangra", "Shimla"]) expect(text).not.toContain(word);
    }
  });
});

describe("view helpers", () => {
  it("names areas in the viewer's language", () => {
    expect(areaName(north, "en")).toBe("Area north");
    expect(areaName(north, "hi")).toBe("क्षेत्र north");
    expect(areaName({ nameEn: "X", nameHi: "" }, "hi")).toBe("X");
  });

  it("turns coverage into text badges", () => {
    const t = enAreas;
    expect(coverageBadges(north, AREAS, "en", t)).toEqual([]);
    expect(coverageBadges(south, AREAS, "en", t).map((badge) => badge.text)).toEqual(["No executive", "No area head", "Covered by the Area north team"]);
    expect(coverageBadges(merged, AREAS, "en", t).map((badge) => badge.text)).toEqual(["Merged into Area north"]);
    expect(areasNeedingPeople(AREAS)).toBe(1);
  });

  it("describes the place tester's answer", () => {
    const t = enAreas;
    const result = (partial: Partial<AreaResolution>): AreaResolution => ({ areaId: null, outcome: "unknown", match: null, key: "x", ...partial });
    expect(resolutionText(result({ areaId: "north", outcome: "area", match: "town" }), AREAS, "en", t)).toBe("Area north (matched: town)");
    expect(resolutionText(result({ outcome: "ambiguous", candidates: ["north", "south"] }), AREAS, "en", t)).toBe("Could be more than one district: Area north, Area south");
    expect(resolutionText(result({ outcome: "outside_hp" }), AREAS, "en", t)).toBe("Outside Himachal");
    expect(resolutionText(result({}), AREAS, "en", t)).toBe("Not recognised");
    expect(resolutionText(result({ areaId: "north", outcome: "area", match: "fuzzy" }), AREAS, "hi", hiAreas)).toContain("क्षेत्र north");
  });

  it("suggests what to remember for an unmatched place", () => {
    expect(suggestedLabel("Faraway Town, Some State")).toBe("Faraway Town");
    expect(suggestedLabel("  Near Village  ")).toBe("Near Village");
    expect(suggestedKind(UNMATCHED[0])).toBe("border");
    expect(suggestedKind({ outcomes: ["unknown"] })).toBe("town");
  });

  it("checks the away day: after today, within 60 days", () => {
    expect(awayDayIssue("", NOW)).toBe("untilRequired");
    expect(awayDayIssue("2026-10-20", NOW)).toBe("past");
    expect(awayDayIssue("2026-10-21", NOW)).toBeNull();
    expect(awayDayIssue("2026-12-19", NOW)).toBeNull();
    expect(awayDayIssue("2027-01-30", NOW)).toBe("tooFar");
  });

  it("needs a move-or-remove choice for every person before a merge", () => {
    expect(mergeIssue({ from: "a", into: "a", people: [], choices: {} })).toBe("same");
    expect(mergeIssue({ from: "a", into: "b", people: ["p1", "p2"], choices: { p1: "move" } })).toBe("needChoice");
    expect(mergeIssue({ from: "a", into: "b", people: ["p1", "p2"], choices: { p1: "move", p2: "remove" } })).toBeNull();
  });

  it("knows which areas a centre's team joins and whom a head may act on", () => {
    expect(areasServedBy("centre-a", AREAS).map((item) => item.id)).toEqual(["north", "south"]);
    expect(peopleInReach(PEOPLE, { superAdmin: true, areaIds: [] })).toHaveLength(4);
    expect(peopleInReach(PEOPLE, { superAdmin: false, areaIds: ["north"] }).map((person) => person.userId)).toEqual(["u-head", "u-exec"]);
    expect(initialChoices(north)).toEqual({ "u-head": { centreSlug: null, takesLeads: true }, "u-exec": { centreSlug: "centre-a", takesLeads: false } });
  });

  it("builds this page's own requests", () => {
    expect(areaPageRequests.mapPlace("north", { label: " Faraway Town ", kind: "border", placeKey: "farawaytownstate" })).toEqual({
      path: "/api/crm/areas/north/aliases",
      method: "POST",
      body: { label: "Faraway Town", kind: "border", placeKey: "farawaytownstate" },
    });
    expect(areaPageRequests.setPersonAreas("u 1", ["north", "north", "south"])).toEqual({ path: "/api/crm/areas/people/u%201", method: "PUT", body: { areaIds: ["north", "south"] } });
  });
});

describe("AreasManager", () => {
  it("gives a super admin every control, labelled, in both languages", () => {
    for (const locale of ["en", "hi"] as const) {
      const html = render(locale, "sa");
      const a = messages(locale).a;
      for (const text of [a.routing.save, a.routing.reroute, a.area.edit, a.area.managePeople, a.create.open, a.merge.open, a.setup.submit, a.unmatched.map, a.legacy.switch, a.staff.setAway, a.staff.reassign]) {
        expect(html, text).toContain(text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;"));
      }
      expect(html).toContain("Faraway Town, Some State");
      expect(html).toContain("Legacy Head");
      expectLabelledControls(html);
    }
  });

  it("shows area heads the districts read-only, with actions only for their own people", () => {
    const html = render("en", "head");
    const a = enAreas;
    for (const text of [a.routing.save, a.area.edit, a.create.open, a.merge.open, a.setup.submit, a.legacy.switch]) expect(html).not.toContain(text);
    expect(html).toContain(a.unmatched.saOnly.replace(/'/g, "&#x27;"));
    expect(html).not.toContain("Faraway Town");
    expect(html).toContain(a.staff.reassign);
    // Exec Far (south) is outside the head's districts: never in their people table.
    expect(html.match(/Exec Far/g)?.length ?? 0).toBe(0);
    expect(html).toContain("Covered by the Area north team");
  });

  it("gives an ordinary admin a read-only page without the people actions", () => {
    const html = render("en", "admin");
    expect(html).not.toContain(enAreas.staff.reassign);
    expect(html).not.toContain(enAreas.area.edit);
    expect(html).toContain(enAreas.sections.tester);
  });
});

describe("Add enquiry: the district select (§13.8)", () => {
  const t = { add: enCrm.add, common: enCrm.common, errors: enCrm.errors };

  it("offers the district while no centre is chosen", () => {
    const html = inLocale(
      "en",
      createElement(AddLeadForm, { openSignal: NOW, sources: [{ value: "walk_in", label: "Walk-in" }], options: { classes: [], programs: [], centres: CENTRES }, t }),
    );
    expect(html).toContain(enAreas.addLead.district);
    expect(html).toContain(enAreas.addLead.outsideHp);
    expect(html).toContain('value="lahaul-spiti"');
  });

  it("sends the district only without a centre", () => {
    const values = { ...EMPTY_MANUAL_LEAD, studentName: "Test Student", phone: "9876543210", consentMethod: "in_person", consent: true };
    const withDistrict = manualLeadRequest({ ...values, district: "una" });
    expect(withDistrict.ok && withDistrict.request.body).toMatchObject({ district: "una" });
    const withCentre = manualLeadRequest({ ...values, district: "una", centreSlug: "centre-a" });
    expect(withCentre.ok && (withCentre.request.body as Record<string, unknown>).district).toBeUndefined();
    const invalid = manualLeadRequest({ ...values, district: "Atlantis" });
    expect(invalid.ok && (invalid.request.body as Record<string, unknown>).district).toBeUndefined();
  });
});
