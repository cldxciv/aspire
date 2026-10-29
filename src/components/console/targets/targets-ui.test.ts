import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/config";

// Targets markup (docs/admin-phase-1b-plan.md §5.B): the session picker, the read-only grid under
// lead routing's notice, the super admin's editor (labelled boxes, totals, hint), the optional
// targets behind a disclosure, and the request builder. Synthetic data only; no database.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/crm/targets",
  useSearchParams: () => new URLSearchParams(),
}));

const { LocaleProvider } = await import("@/i18n/client");
const { messagesFor } = await import("@/i18n/messages");
const { default: en } = await import("@/i18n/messages/en/console-numbers");
const { default: hi } = await import("@/i18n/messages/hi/console-numbers");
const { sessionsForPicker } = await import("@/lib/crm/console/session");
const { targetsHref } = await import("@/lib/crm/console/dashboard/links");
const { SessionPicker } = await import("./SessionPicker");
const { TargetsView } = await import("./TargetsView");
const { metricValues, parseTargetInput, sameValues } = await import("./TargetsEditor");
const { targetsRequests } = await import("./api");

type Grid = import("@/lib/crm/console/types").TargetGrid;

const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const html = (locale: Locale, element: ReactElement) =>
  renderToStaticMarkup(createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, element as ReactNode));
const crm = (locale: Locale) => {
  const t = messagesFor(locale, "crm");
  return { superAdmin: t.superAdmin, errors: t.errors };
};
const SESSION = { key: "S2026" as const, label: "2026–27", fromMs: 0, toMs: 1 };
const CENTRES = [
  { slug: "shimla", label: "Shimla" },
  { slug: "hamirpur", label: "Hamirpur" },
];
const GRID: Grid = {
  period: "S2026",
  cells: [
    { centreSlug: "shimla", program: "jee", metric: "admissions", value: 40 },
    { centreSlug: "shimla", program: "neet", metric: "admissions", value: 20 },
    { centreSlug: "shimla", program: "any", metric: "enquiries", value: 400 },
  ],
  updatedAt: "2026-10-20T06:00:00.000Z",
  updatedBy: "Owner",
};
const view = (locale: Locale, props: Partial<ComponentProps<typeof TargetsView>> = {}) =>
  html(locale, createElement(TargetsView, { grid: GRID, session: SESSION, centres: CENTRES, canEdit: false, managerScope: false, pagePath: "/crm/targets", locale, crm: crm(locale), ...props }));

describe("session picker", () => {
  it("links the previous two, the current and the next session; the chosen one is aria-current", () => {
    const out = html(
      "hi",
      createElement(SessionPicker, {
        sessions: sessionsForPicker(NOW),
        current: "S2026",
        selected: "S2025",
        hrefFor: (key) => targetsHref(key),
        label: hi.targets.sessionNav,
        currentLabel: hi.targets.currentSession,
        locale: "hi",
      }),
    );
    expect([...out.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "/hi/crm/targets?session=S2024",
      "/hi/crm/targets?session=S2025",
      "/hi/crm/targets?session=S2026",
      "/hi/crm/targets?session=S2027",
    ]);
    expect(out).toMatch(/aria-current="page"[^>]*href="\/hi\/crm\/targets\?session=S2025"/);
    expect(out.match(/aria-current/g)).toHaveLength(1);
    expect(out).toContain("2026–27 (मौजूदा)");
    expect(out).toContain(`aria-label="${hi.targets.sessionNav}"`);
  });
});

describe("targets view", () => {
  it("reads plain numbers with totals and dashes for 'not set' under the read-only notice", () => {
    const out = view("en", { managerScope: true });
    expect(out).toContain(crm("en").superAdmin.readOnly);
    expect(out).toContain(en.targets.managerNote);
    expect(out).toContain("Admissions targets, 2026–27");
    expect(out).toMatch(/<caption[^>]*>Admissions targets for 2026–27 by centre and programme<\/caption>/);
    for (const program of Object.values(en.targets.programs)) expect(out).toContain(program);
    expect(out).toContain(">60<"); // Shimla total
    expect(out).toContain("Not set");
    expect(out).toContain("<details");
    expect(out).toContain(en.targets.showOptional);
    expect(out).toContain(">400<"); // the optional enquiries target
    expect(out).toContain("Last changed");
    expect(out).toContain("Owner");
    expect(out).not.toContain("<input");
  });

  it("says when nothing is set, and who enters targets", () => {
    const empty = { ...GRID, cells: [], updatedAt: null, updatedBy: null };
    expect(view("en", { grid: empty })).toContain(`No targets for 2026–27 yet. ${en.targets.emptyRead}`);
    const editor = view("en", { grid: empty, canEdit: true });
    expect(editor).toContain(`No targets for 2026–27 yet. ${en.targets.emptyEdit}`);
    expect(editor).toContain(en.targets.neverChanged);
    expect(view("en", { centres: [] })).toContain(en.targets.noCentres);
  });

  it("super admins get one labelled box per centre × programme, a total, the hint and a save button per metric", () => {
    const out = view("en", { canEdit: true });
    expect(out).toContain(crm("en").superAdmin.canEdit);
    expect(out.match(/<input/g)).toHaveLength(3 * 2 * 5); // 3 metrics × 2 centres × 5 programmes
    expect(out).toContain('inputMode="numeric"');
    expect(out).toContain("Admissions target for Shimla, JEE");
    expect(out).toContain('value="40"');
    expect(out).toContain("<legend");
    expect(out).toContain(en.targets.inputHint);
    expect(out).toContain("Save Admissions targets");
    expect(out).toContain("Save Counselling sessions targets");
    expect(out).toMatch(/<output[^>]*>60<\/output>/);
    expect(out).toMatch(/<output[^>]*>—<\/output>/); // Hamirpur: no target yet
    const inHindi = view("hi", { canEdit: true });
    expect(inHindi).toContain("Shimla, JEE: एडमिशन का लक्ष्य");
    expect(inHindi).toContain(hi.targets.showOptional);
  });
});

describe("editor helpers", () => {
  it("accepts empty (no target) and whole numbers 0–100000 only", () => {
    expect(parseTargetInput("")).toBe("");
    expect(parseTargetInput("  ")).toBe("");
    expect(parseTargetInput("0")).toBe(0);
    expect(parseTargetInput(" 60 ")).toBe(60);
    expect(parseTargetInput("100000")).toBe(100000);
    for (const bad of ["-1", "1.5", "100001", "12a", "1e3", "६०"]) expect(parseTargetInput(bad), bad).toBeNull();
  });

  it("builds the PUT body the API expects", () => {
    expect(targetsRequests.save("S2026", "admissions", [{ centreSlug: "shimla", program: "jee", value: 40 }], null)).toEqual({
      path: "/api/crm/targets",
      method: "PUT",
      body: { period: "S2026", metric: "admissions", cells: [{ centreSlug: "shimla", program: "jee", value: 40 }], expectedUpdatedAt: null },
    });
    expect(targetsRequests.get("S2026")).toEqual({ path: "/api/crm/targets?period=S2026", method: "GET" });
  });

  it("reads one metric's cells, and tells whether a refresh changed them (the editor keeps typed boxes when not)", () => {
    const grid = {
      cells: [
        { centreSlug: "shimla", program: "jee" as const, metric: "admissions" as const, value: 40 },
        { centreSlug: "shimla", program: "any" as const, metric: "enquiries" as const, value: 400 },
      ],
    };
    const admissions = metricValues(grid, "admissions");
    expect(admissions).toEqual({ "shimla|jee": 40 });
    expect(metricValues(grid, "counselling")).toEqual({});
    // Someone changed only the enquiry targets: the admissions editor's base is unchanged.
    expect(sameValues(admissions, metricValues({ cells: [...grid.cells.slice(0, 1), { ...grid.cells[1], value: 500 }] }, "admissions"))).toBe(true);
    expect(sameValues(admissions, { "shimla|jee": 41 })).toBe(false);
    expect(sameValues(admissions, { "shimla|jee": 40, "shimla|neet": 0 })).toBe(false);
    expect(sameValues({}, {})).toBe(true);
  });
});
