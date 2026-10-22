import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/crm/dashboard",
}));

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import enCrm from "@/i18n/messages/en/crm";
import hiCrm from "@/i18n/messages/hi/crm";
import type { DashboardData, SlaQueueItem, SpeedRow } from "@/lib/crm/lead-ops-types";
import { crmPermissions } from "@/lib/crm/types";
import { DashboardView } from "./DashboardView";
import { barWidth, minutesText, nowTileHref, outOf, percentText, rowLabel, rowMetRate } from "./model";

// Synthetic fixtures only.
const NOW = Date.parse("2026-10-21T06:00:00.000Z");
const LOCALES: Locale[] = ["en", "hi"];
const crm = (locale: Locale) => (locale === "hi" ? hiCrm : enCrm);

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const row = (key: string, overrides: Partial<SpeedRow> = {}): SpeedRow => ({
  key,
  leads: 10,
  attempted: 9,
  met: 6,
  missed: 3,
  reached: 5,
  medianWorkMinutes: 42.5,
  open: 1,
  overdue: 1,
  ...overrides,
});

const DATA: DashboardData = {
  range: { from: "2026-09-22T18:30:00.000Z", to: "2026-10-21T18:30:00.000Z" },
  scope: { areaIds: "all" },
  today: { newLeads: 7, bySource: [{ key: "meta_lead_ad", count: 5 }, { key: "hero", count: 2 }] },
  now: {
    callNow: 4,
    overdue: 2,
    escalated: 1,
    unassignedInAreas: 3,
    unassignedNoArea: 1,
    toolSignups: 6,
    unmatchedPlaces: 2,
    away: [{ userId: "u-away", name: "Exec Away", until: "2026-10-25T18:30:00.000Z" }],
  },
  speed: {
    live: { clocks: 12, met: 9, metRate: 0.75, reached: 6, reachedRate: 0.6, medianWorkMinutes: 18 },
    imported: { clocks: 0, met: 0, metRate: null, reached: 0, reachedRate: null, medianWorkMinutes: null },
  },
  byArea: [row("kangra"), row("none", { met: 0, missed: 0 })],
  byExecutive: [row("u-exec", { label: "Exec One" }), row("unassigned")],
  bySource: [row("meta_lead_ad")],
  byCampaign: [
    { key: "diwali-jee", total: 8, contacted: 6, reached: 4, enrolled: 1, junk: 2 },
    { key: "none", total: 2, contacted: 1, reached: 1, enrolled: 0, junk: 0 },
  ],
};

const ESCALATED: SlaQueueItem[] = [
  {
    leadId: "lead-9",
    displayName: "Late Student",
    phoneLast4: "0099",
    areaId: "kangra",
    assignee: null,
    source: "hero",
    clock: { state: "escalated", reason: "new", startedAt: "2026-10-21T03:30:00.000Z", dueAt: "2026-10-21T04:30:00.000Z", tier1At: null, tier2At: "2026-10-21T05:30:00.000Z" },
  },
];

describe("dashboard model", () => {
  it("formats rates, minutes and denominators", () => {
    expect(percentText(0.75, "en", "—")).toBe("75%");
    expect(percentText(null, "en", "—")).toBe("—");
    expect(minutesText(enCrm.dashboard.speed, 12.25, "en")).toBe("12.3 min");
    expect(minutesText(enCrm.dashboard.speed, null, "en")).toBe("—");
    expect(rowMetRate({ met: 3, missed: 1 })).toBe(0.75);
    expect(rowMetRate({ met: 0, missed: 0 })).toBeNull();
    expect(outOf(9, 0.75)).toBe(12);
    expect(outOf(0, 0)).toBeNull();
    expect(barWidth(0.756)).toBe(76);
    expect(barWidth(null)).toBe(0);
  });

  it("links each tile to the filtered list (narrowed by the chosen area)", () => {
    expect(nowTileHref("overdue", null)).toBe("/crm?sla=overdue");
    expect(nowTileHref("callNow", "kangra")).toBe("/crm?sla=open&area=kangra");
    expect(nowTileHref("unassignedInAreas", "kangra")).toBe("/crm?area=kangra&assignee=unassigned&stage=open");
    // Without a chosen area no inbox list matches the count (leads WITH an area only): no link.
    expect(nowTileHref("unassignedInAreas", null)).toBeNull();
    expect(nowTileHref("unassignedNoArea", "kangra")).toBe("/crm?area=none&assignee=unassigned&stage=open");
    expect(nowTileHref("toolSignups", null)).toBe("/crm?area=tool_signups&stage=open");
    expect(nowTileHref("away", null)).toBeNull();
  });

  it("labels rows in words", () => {
    const t = { tables: enCrm.dashboard.tables, sources: enCrm.sources };
    expect(rowLabel("area", "none", undefined, t, {})).toBe("No area");
    expect(rowLabel("area", "kangra", "Kangra (en)", t, { kangra: "कांगड़ा" })).toBe("कांगड़ा");
    expect(rowLabel("executive", "unassigned", undefined, t, {})).toBe("Nobody assigned");
    expect(rowLabel("source", "meta_lead_ad", undefined, t, {})).toBe("Meta lead form");
    expect(rowLabel("campaign", "none", undefined, t, {})).toBe("No campaign");
  });
});

describe("DashboardView", () => {
  for (const locale of LOCALES) {
    const t = crm(locale);
    const render = (superAdmin: boolean, data: DashboardData = DATA) =>
      inLocale(
        locale,
        createElement(DashboardView, {
          data,
          escalated: superAdmin ? ESCALATED : null,
          permissions: crmPermissions({ role: superAdmin ? "admin" : "manager", superAdmin }),
          range: { fromDay: "2026-09-22", toDay: "2026-10-21", invalid: false },
          presets: [{ key: "last7", fromDay: "2026-10-15", toDay: "2026-10-21" }],
          areaOptions: [{ id: "kangra", name: locale === "hi" ? "कांगड़ा" : "Kangra" }],
          area: null,
          areaNames: { kangra: locale === "hi" ? "कांगड़ा" : "Kangra" },
          now: NOW,
          locale,
          t,
        }),
      );

    it(`shows tiles linked to lists, speed split live / imported, and accessible tables (${locale})`, () => {
      const html = render(true);
      const d = t.dashboard;
      expect(html).not.toContain("<h1");
      for (const title of [d.now.title, d.today.title, d.away.title, d.speed.title, d.tables.byArea, d.tables.byExecutive, d.tables.bySource, d.tables.byCampaign]) {
        expect(html).toContain(esc(title));
      }
      expect(html).toContain(locale === "hi" ? 'href="/hi/crm?sla=overdue"' : 'href="/crm?sla=overdue"');
      expect(html).toContain("area=tool_signups");
      expect(html).toContain(esc(d.speed.live));
      expect(html).toContain(esc(d.speed.imported));
      expect(html).toContain(esc(d.speed.metOf.replace("{met}", "9").replace("{decided}", "12")));
      expect((html.match(/<caption/g) ?? []).length).toBe(5); // four speed / campaign tables + escalations
      // Each wide table scrolls inside a named, keyboard-focusable region (WCAG 2.1.1).
      const regions = [...html.matchAll(/<div role="region"([^>]*)>\s*<table/g)].map((match) => match[1]);
      expect(regions).toHaveLength(5);
      for (const attrs of regions) {
        expect(attrs).toContain('tabindex="0"');
        expect(attrs).toMatch(/aria-(labelledby|label)="[^"]+"/);
      }
      for (const id of ["crm-dash-area", "crm-dash-exec", "crm-dash-source", "crm-dash-campaign"]) {
        expect(html).toContain(`aria-labelledby="${id}" tabindex="0"`);
        expect(html).toContain(`id="${id}"`);
      }
      expect(html).toContain(esc(d.tables.byAreaNote));
      // No area chosen: the "in an area, nobody assigned" tile has no (mismatched) list link.
      expect(html).not.toMatch(/href="(?:\/hi)?\/crm\?assignee=unassigned/);
      expect(html).toContain('scope="row"');
      expect(html).toContain(esc(d.tables.noArea));
      expect(html).toContain(esc(d.tables.unassigned));
      expect(html).toContain("Exec One");
      expect(html).toContain("diwali-jee");
      expect(html).toContain("Exec Away");
      expect(html).toContain(esc(t.speed.escalation.title));
      expect(html).toContain("Late Student");
      expect(html).toContain(esc(d.meta.notConnected));
      expect(html).toContain('aria-hidden="true" class="relative h-3');
      for (const [, attrs] of html.matchAll(/<(?:select|input)\b([^>]*)>/g)) {
        const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
        expect(id && html.includes(`for="${id}"`), attrs).toBe(true);
      }
    });

    it(`hides super-admin parts from area heads and shows Meta health to super admins (${locale})`, () => {
      const head = render(false, { ...DATA, scope: { areaIds: ["kangra"] }, now: { ...DATA.now, unassignedNoArea: undefined, toolSignups: undefined, unmatchedPlaces: undefined } });
      expect(head).not.toContain(esc(t.dashboard.meta.title));
      expect(head).not.toContain(esc(t.speed.escalation.title));
      expect(head).not.toContain("area=tool_signups");
      expect(head).toContain(esc(t.dashboard.scopeAreas.replace("{areas}", locale === "hi" ? "कांगड़ा" : "Kangra")));

      const withMeta = render(true, {
        ...DATA,
        meta: { lastWebhookAt: null, lastImportAt: "2026-10-21T04:00:00.000Z", pending: 2, failed: 1, paused: "auth", silentHours: 60 },
      });
      expect(withMeta).toContain(esc(t.dashboard.meta.pausedAuth));
      expect(withMeta).toContain(esc(t.dashboard.meta.silent.replace("{hours}", "60")));
      expect(withMeta).toContain(esc(t.dashboard.meta.never));
    });
  }
});
