import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import numbersEn from "@/i18n/messages/en/console-numbers";
import numbersHi from "@/i18n/messages/hi/console-numbers";
import { decidePortalPage } from "@/lib/auth/policy";
import type { Session } from "@/lib/auth/roles";
import type { AttentionItem, CentreNumbers as CentreRow, ConsoleNumbers } from "@/lib/crm/console/types";
import { consoleCommon } from "../shared/messages";
import { CentreNumbers, NumbersLoading } from "./CentreNumbers";
import { channelLabel } from "./labels";
import { attentionLabel, NeedsAttention } from "./NeedsAttention";

// "Your numbers" markup (docs/admin-phase-1b-plan.md §5.A, §10): both variants in both languages,
// links that carry no personal data, honest sub-lines, "No target set", the preview, and the
// gate that keeps counsellors off /admin. Synthetic data only; no database.

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const html = (locale: Locale, element: ReactElement) =>
  renderToStaticMarkup(createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, element as ReactNode));

function links(centre?: string): CentreRow["links"] {
  const at = centre ? `&centre=${centre}` : "";
  return {
    today: `/crm?created=today${centre ? `&centre=${centre}` : ""}`.replace("?&", "?"),
    week: `/crm?${centre ? `centre=${centre}&` : ""}created=week`,
    notCalled: `/crm?stage=new${at}&contact=none&signups=hide`,
    notCalledOver24h: `/crm?stage=new${at}&contact=none&signups=hide&created=over24h`,
    overdue: `/crm?stage=open${at}&due=overdue`,
    admissions: `/crm/admissions?session=S2026${at}`,
    sources: `/crm/sources?range=30d${at}`,
  };
}

function centreRow(slug: string | null, label: string, overrides: Partial<CentreRow> = {}): CentreRow {
  return {
    centre: { slug, label, demo: true },
    enquiriesToday: 2,
    enquiriesWeek: 12,
    toolSignupsWeek: 4,
    importedWeek: 3,
    erasedWeek: 0,
    notCalled: 9,
    notCalledOver24h: 5,
    overdue: 7,
    admissionsSession: 23,
    sessionTarget: 60,
    topSources: [
      { channel: "ai_assistants", count: 6 },
      { channel: "google_maps", count: 4 },
    ],
    enquiries30d: 30,
    links: links(slug ?? "none"),
    ...overrides,
  };
}

const DATA: ConsoleNumbers = {
  generatedAt: "2026-10-21T05:12:00.000Z",
  session: { key: "S2026", label: "2026–27", fromMs: 0, toMs: 1 },
  rows: [
    centreRow("shimla", "Shimla"),
    centreRow("hamirpur", "Hamirpur", { sessionTarget: null, toolSignupsWeek: 0, importedWeek: 0, erasedWeek: 3, notCalledOver24h: 0, topSources: [], enquiries30d: 2 }),
    centreRow(null, "", { sessionTarget: null }),
  ],
  total: { ...centreRow(null, ""), links: links(), sessionTarget: 60 },
  centreListIsDemo: true,
};

describe("five numbers by centre (markup)", () => {
  it("admin variant: today and this week, linked numbers, honest sub-lines, x of y, too few to rank", () => {
    const out = html("en", createElement(CentreNumbers, { data: DATA, variant: "admin", canEditTargets: true, locale: "en" }));
    const n = numbersEn.numbers;
    for (const header of Object.values(n.columns)) expect(out).toContain(esc(header));
    expect(out).toContain("Session 2026–27 · as of 10:42 IST");
    expect(out).toContain(esc(consoleCommon("en").common.demoCentres));
    expect(out).toContain('href="/crm?created=today&amp;centre=shimla"');
    expect(out).toContain('href="/crm?stage=new&amp;centre=shimla&amp;contact=none&amp;signups=hide"');
    expect(out).toContain('aria-label="9: Not yet called, Shimla. Open the list."');
    expect(out).toContain("incl. 4 free-tool sign-ups · 3 imported");
    expect(out).toContain("3 more since erased");
    expect(out).toContain("5 waiting over 24 h");
    expect(out).toContain("23 of 60 (38 %)");
    // With a target, the link's name starts with exactly what it shows (WCAG 2.5.3), Total row too.
    for (const centre of ["Shimla", n.allCentres]) {
      expect(out).toContain(`aria-label="${esc(format(n.linkLabel, { count: "23 of 60 (38 %)", what: n.columns.admissions, centre }))}"`);
    }
    // Small linked lines and source chips are 44 px targets (plan §5 common UI rules).
    for (const label of ["5 waiting over 24 h", n.setTargets, esc(channelLabel("ai_assistants", "en"))]) {
      const link = [...out.matchAll(/<a [^>]*>(?:(?!<\/a>).)*<\/a>/g)].map((match) => match[0]).find((tag) => tag.includes(label));
      expect(link, label).toMatch(/^<a [^>]*class="[^"]*min-h-11[" ]/);
    }
    expect(out).toContain(esc(consoleCommon("en").common.noTarget));
    expect(out).toContain(n.setTargets); // super admins: "Set targets" where no target is set
    expect(out).toContain('href="/crm/targets?session=S2026"');
    expect(out).toContain(n.tooFew);
    expect(out).toContain(esc(channelLabel("ai_assistants", "en")));
    expect(out).toContain('href="/crm/sources?range=30d&amp;centre=shimla"');
    expect(out).toContain(consoleCommon("en").common.noCentre);
    expect(out).toContain('href="/crm?stage=new&amp;centre=none&amp;contact=none&amp;signups=hide"');
    expect(out).toContain(">Total<");
    expect(out).toMatch(/<caption[^>]*>Numbers by centre, session 2026–27<\/caption>/);
    expect(out).toContain('role="region"');
    expect(out).not.toMatch(/\d{10}|@/);
  });

  it("crm variant: this week only (lead routing shows today), no 'Set targets' for others", () => {
    const out = html("en", createElement(CentreNumbers, { data: DATA, variant: "crm", canEditTargets: false, locale: "en" }));
    expect(out).not.toContain(numbersEn.numbers.columns.today);
    expect(out).not.toContain("created=today");
    expect(out).toContain(numbersEn.numbers.columns.week);
    expect(out).not.toContain(numbersEn.numbers.setTargets);
    expect(out).toContain(numbersEn.numbers.leadCrm.slice(0, 30));
  });

  it("Hindi: words, x of y order and localised links", () => {
    const out = html("hi", createElement(CentreNumbers, { data: DATA, variant: "admin", canEditTargets: false, locale: "hi" }));
    expect(out).toContain(numbersHi.numbers.columns.notCalled);
    expect(out).toContain(numbersHi.numbers.columns.overdue);
    expect(out).toContain("60 में से 23 (38 %)");
    expect(out).toContain(`aria-label="${esc(format(numbersHi.numbers.linkLabel, { count: "60 में से 23 (38 %)", what: numbersHi.numbers.columns.admissions, centre: "Shimla" }))}"`);
    expect(out).toContain(format(numbersHi.numbers.waiting24, { n: "5" }));
    expect(out).toContain('href="/hi/crm?created=today&amp;centre=shimla"');
    expect(out).toContain('href="/hi/crm/admissions?session=S2026&amp;centre=shimla"');
    for (const href of [...out.matchAll(/href="([^"]+)"/g)].map((match) => match[1])) expect(href.startsWith("/hi/")).toBe(true);
  });

  it("preview: '—' and 'Preview · no live data', no table and no links", () => {
    for (const locale of ["en", "hi"] as const) {
      const out = html(locale, createElement(CentreNumbers, { data: null, variant: "admin", canEditTargets: false, locale }));
      const common = consoleCommon(locale).common;
      expect(out).toContain(esc(common.preview));
      expect(out.split(common.previewValue).length - 1).toBe(6);
      expect(out).not.toContain("<table");
      expect(out).not.toContain("href=");
      const crm = html(locale, createElement(CentreNumbers, { data: null, variant: "crm", canEditTargets: false, locale }));
      expect(crm.split(common.previewValue).length - 1).toBe(5);
    }
    expect(html("en", createElement(NumbersLoading, { locale: "en" }))).toContain('role="status"');
  });

  it("no centres: says what to do instead of a table of zeros", () => {
    const out = html("en", createElement(CentreNumbers, { data: { ...DATA, rows: [] }, variant: "admin", canEditTargets: false, locale: "en" }));
    expect(out).toContain(numbersEn.numbers.noCentres);
    expect(out).not.toContain("<table");
  });
});

describe("needs attention (markup)", () => {
  const items: AttentionItem[] = [
    { kind: "unassigned", count: 4, href: "/crm?stage=open&assignee=unassigned&signups=hide" },
    { kind: "tool_signups", count: 2, href: "/crm?stage=open&area=tool_signups" },
    { kind: "not_called_24h", count: 3, href: "/crm?stage=new&contact=none&signups=hide&created=over24h" },
    { kind: "overdue_by_counsellor", count: 5, href: "/crm?stage=open&assignee=u-one&due=overdue", userId: "u-one", name: "Counsellor One" },
    { kind: "overdue_by_counsellor", count: 1, href: "/crm?stage=open&assignee=unassigned&due=overdue", userId: null, name: null },
    { kind: "overdue_by_counsellor", count: 6, href: "/crm?stage=open&due=overdue" },
    { kind: "lost_to_review", count: 1, href: "/crm/lost" },
  ];

  it("one link per row with its count; person, nobody assigned and everyone read differently", () => {
    const out = html("en", createElement(NeedsAttention, { items, variant: "admin", locale: "en" }));
    const rows = numbersEn.attention.rows;
    expect(out).toContain(rows.unassigned);
    expect(out).toContain(rows.toolSignups);
    expect(out).toContain("Overdue follow-up tasks: Counsellor One");
    expect(out).toContain(rows.overdueUnassigned);
    expect(out).toContain(rows.overdueEveryone);
    expect(out).toContain('href="/crm/lost"');
    expect(out.match(/<a /g)).toHaveLength(items.length);
    expect(attentionLabel({ kind: "overdue_by_counsellor", count: 1, href: "/crm", userId: "u-x", name: null }, numbersEn)).toBe("Overdue follow-up tasks: Former staff member");
    const hi = html("hi", createElement(NeedsAttention, { items, variant: "crm", locale: "hi" }));
    expect(hi).toContain(numbersHi.attention.title);
    expect(hi).toContain('href="/hi/crm/lost"');
  });

  it("nothing waiting: a plain sentence; preview: '—' without links", () => {
    expect(html("en", createElement(NeedsAttention, { items: [], variant: "admin", locale: "en" }))).toContain(numbersEn.attention.nothing);
    expect(html("hi", createElement(NeedsAttention, { items: [], variant: "crm", locale: "hi" }))).toContain(numbersHi.attention.nothing);
    const preview = html("en", createElement(NeedsAttention, { items: null, variant: "admin", locale: "en" }));
    expect(preview).toContain(esc(consoleCommon("en").common.preview));
    expect(preview).not.toContain("href=");
  });
});

describe("who opens /admin (§7)", () => {
  it("counsellors and area heads (staff) never get the admin numbers; admins do", () => {
    const staff = { userId: "u-staff", role: "staff", displayName: "Staff" } as Session;
    const adminSession = { userId: "u-admin", role: "admin", displayName: "Admin" } as Session;
    expect(decidePortalPage(staff, "admin", false).kind).toBe("deny");
    // With previews on, staff get the data-free preview, never a session.
    expect(decidePortalPage(staff, "admin", true).kind).toBe("preview");
    expect(decidePortalPage(adminSession, "admin", false).kind).toBe("session");
  });
});

describe("Hindi messages", () => {
  it("have the same shape and placeholders as English", () => {
    const walk = (en: unknown, hi: unknown, path: string) => {
      if (typeof en === "string") {
        expect(typeof hi, path).toBe("string");
        const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        expect(holes(hi as string), path).toEqual(holes(en));
        return;
      }
      expect(Object.keys(hi as object).sort(), path).toEqual(Object.keys(en as object).sort());
      for (const key of Object.keys(en as object)) walk((en as Record<string, unknown>)[key], (hi as Record<string, unknown>)[key], `${path}.${key}`);
    };
    walk(numbersEn, numbersHi, "consoleNumbers");
  });
});
