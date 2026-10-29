import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import en from "@/i18n/messages/en/console-numbers";
import hi from "@/i18n/messages/hi/console-numbers";
import type { AdmissionsReport } from "@/lib/crm/console/admissions/admissions";
import type { CentreRef } from "@/lib/crm/console/types";
import { AdmissionsView } from "./AdmissionsView";

// Admissions done markup (docs/admin-phase-1b-plan.md §5.B): filters, the centre × programme
// summary with targets, the list with back links, erased rows without a name, paging, the empty
// state, both languages. Synthetic data only; no database.

const html = (locale: Locale, element: ReactElement) =>
  renderToStaticMarkup(createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, element as ReactNode));
const zero = { jee: 0, neet: 0, foundation: 0, integrated: 0, any: 0 };
const CENTRES: CentreRef[] = [
  { slug: "shimla", label: "Shimla", demo: true },
  { slug: "hamirpur", label: "Hamirpur", demo: true },
  { slug: null, label: "", demo: false },
];

function report(overrides: Partial<AdmissionsReport> = {}): AdmissionsReport {
  return {
    session: { key: "S2026", label: "2026–27", fromMs: 0, toMs: 1 },
    centre: null,
    total: 3,
    summary: {
      rows: [
        { centre: "shimla", counts: { ...zero, jee: 2 }, total: 2, target: 60 },
        { centre: "hamirpur", counts: { ...zero, any: 1 }, total: 1, target: null },
      ],
      totals: { ...zero, jee: 2, any: 1 },
      total: 3,
      target: 60,
    },
    showTargets: true,
    items: [
      { leadId: "lead-a", name: "Synthetic Student", erased: false, centreSlug: "shimla", program: "jee", programInterest: "jee", currentClass: "class-11", assignee: { userId: "u-one", displayName: "Counsellor One" }, admittedAt: "2026-10-19T06:00:00.000Z", channel: "ai_assistants" },
      { leadId: "lead-b", name: null, erased: true, centreSlug: "shimla", program: "jee", programInterest: "jee", currentClass: null, assignee: null, admittedAt: "2026-10-18T06:00:00.000Z", channel: "direct" },
      { leadId: "lead-c", name: "Other Student", erased: false, centreSlug: "hamirpur", program: "any", programInterest: null, currentClass: null, assignee: null, admittedAt: "2026-10-17T06:00:00.000Z", channel: "walk_in" },
    ],
    page: 2,
    pageSize: 50,
    pages: 3,
    ...overrides,
  };
}

const view = (locale: Locale, data: AdmissionsReport, scopeNote: "own" | "manager" | null = null) =>
  html(locale, createElement(AdmissionsView, { report: data, centres: CENTRES, scopeNote, locale, crm: messagesFor(locale, "crm") }));

describe("admissions done (markup)", () => {
  it("shows the summary with targets, the list with back links, erased rows nameless, and paging", () => {
    const out = view("en", report({ centre: "shimla" }));
    expect(out).toContain("3 admitted in 2026–27");
    expect(out).toMatch(/<caption[^>]*>Admissions by centre and programme, 2026–27<\/caption>/);
    expect(out).toContain("2 of 60 (3 %)");
    expect(out).toContain("No target set");
    expect(out).toContain('href="/crm/leads/lead-a?back=%2Fcrm%2Fadmissions%3Fsession%3DS2026%26centre%3Dshimla%26page%3D2"');
    expect(out).toContain("Synthetic Student");
    expect(out).toContain(en.admissions.erased);
    expect(out).not.toContain("lead-b"); // no link for an erased lead
    expect(out).toContain(en.admissions.erasedNote);
    expect(out).toContain("Counsellor One");
    expect(out).toContain(en.admissions.unassigned);
    expect(out).toContain("19 Oct 2026");
    expect(out).toContain("AI assistants");
    expect(out).toContain('href="/crm/admissions?session=S2026&amp;centre=shimla"'); // previous page (1)
    expect(out).toContain('href="/crm/admissions?session=S2026&amp;centre=shimla&amp;page=3"');
    expect(out).toContain("Page 2 of 3");
    expect(out).toContain('<option value="none">No centre yet</option>');
    expect(out).toContain('<input type="hidden" name="session" value="S2026"/>');
  });

  it("hides targets from counsellors and says whose families are listed", () => {
    const out = view("en", report({ showTargets: false }), "own");
    expect(out).not.toContain(en.admissions.target);
    expect(out).toContain(en.admissions.scopeOwn);
    expect(view("en", report(), "manager")).toContain(en.admissions.scopeManager);
  });

  it("empty: says how admissions are counted", () => {
    const empty = report({ total: 0, items: [], summary: { rows: [], totals: zero, total: 0, target: null }, page: 1, pages: 1 });
    expect(view("en", empty)).toContain("No one has been marked Admitted for 2026–27 yet.");
    const hiOut = view("hi", empty);
    expect(hiOut).toContain("2026–27 के लिए अभी तक किसी का एडमिशन दर्ज नहीं हुआ है।");
  });

  it("Hindi: words and localised links", () => {
    const out = view("hi", report());
    expect(out).toContain(hi.admissions.listTitle);
    expect(out).toContain("60 में से 2 (3 %)");
    expect(out).toContain('href="/hi/crm/leads/lead-a?back=');
    expect(out).toContain(`action="/hi/crm/admissions"`);
  });
});
