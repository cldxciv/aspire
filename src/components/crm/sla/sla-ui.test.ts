import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Client islands call useRouter().refresh(); outside the App Router a stub is enough for static markup.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/crm/today",
}));

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import enCrm from "@/i18n/messages/en/crm";
import enDashboard from "@/i18n/messages/en/crm-dashboard";
import enSpeed from "@/i18n/messages/en/crm-speed";
import hiCrm from "@/i18n/messages/hi/crm";
import hiDashboard from "@/i18n/messages/hi/crm-dashboard";
import hiSpeed from "@/i18n/messages/hi/crm-speed";
import { DEFAULT_CALLING_HOURS, DEFAULT_SPEED_RULE, type SlaQueueItem, type SlaSummary } from "@/lib/crm/lead-ops-types";
import { TodayView } from "../TodayView";
import { CallNowList } from "./CallNowList";
import { EscalationList } from "./EscalationList";
import {
  addClosedDate,
  areaLines,
  baseTitle,
  callingHoursIssues,
  clockSourceOptions,
  countdownText,
  durationText,
  executiveDigest,
  hasAlerts,
  setDay,
  speedRuleIssues,
  speedSaveRequest,
  summaryRequest,
  superAdminLinks,
  titleWithCount,
} from "./model";
import { SlaAlertStrip, SlaAlertStripView } from "./SlaAlertStrip";
import { SpeedSettingsForm } from "./SpeedSettingsForm";

// Synthetic fixtures only (no real people, numbers or places beyond the HP district names).
const NOW = Date.parse("2026-10-21T06:00:00.000Z"); // 11:30 IST
const LOCALES: Locale[] = ["en", "hi"];
const crm = (locale: Locale) => (locale === "hi" ? hiCrm : enCrm);

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/** Every <select>, <textarea> and non-hidden <input> has a <label for>, sits inside a <label>, or is named. */
function expectLabelledControls(html: string) {
  for (const [, tag, attrs] of html.matchAll(/<(select|textarea|input)\b([^>]*)>/g)) {
    if (/type="(hidden|submit)"/.test(attrs)) continue;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (id && html.includes(`for="${id}"`)) continue;
    expect(/type="(radio|checkbox)"/.test(attrs) || /aria-label="/.test(attrs), `${tag} ${attrs}`).toBe(true);
  }
}

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => keysOf(item, prefix ? `${prefix}.${key}` : key));
}

function placeholders(value: unknown): string[] {
  return keysOf(value).map((key) => {
    const text = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], value);
    return `${key}:${[...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",")}`;
  });
}

const item = (overrides: Partial<SlaQueueItem> = {}): SlaQueueItem => ({
  leadId: "lead-1",
  displayName: "Test Student",
  phoneLast4: "0042",
  areaId: "kangra",
  assignee: { userId: "u-exec", displayName: "Exec One" },
  source: "admissions",
  clock: { state: "due", reason: "new", startedAt: new Date(NOW).toISOString(), dueAt: new Date(NOW + 25 * 60_000).toISOString(), tier1At: null, tier2At: null },
  ...overrides,
});

const summary = (overrides: Partial<SlaSummary> = {}): SlaSummary => ({
  generatedAt: new Date(NOW).toISOString(),
  mine: { callNow: 0, overdue: 0, nextDueAt: null, retriesDue: 0 },
  ...overrides,
});

describe("messages (en ↔ hi)", () => {
  it("have the same keys and placeholders in both languages", () => {
    expect(keysOf(hiSpeed)).toEqual(keysOf(enSpeed));
    expect(keysOf(hiDashboard)).toEqual(keysOf(enDashboard));
    expect(placeholders(hiSpeed)).toEqual(placeholders(enSpeed));
    expect(placeholders(hiDashboard)).toEqual(placeholders(enDashboard));
    expect(JSON.stringify(hiSpeed)).toMatch(/[ऀ-ॿ]/);
  });
});

describe("model", () => {
  const c = enSpeed.callNow;
  it("words countdowns, rounding up and switching to 'late by' at the due time", () => {
    expect(durationText(c, 25 * 60_000)).toBe("25 min");
    expect(durationText(c, 65 * 60_000 + 1)).toBe("1 h 6 min");
    expect(durationText(c, 10)).toBe("1 min");
    const due = new Date(NOW + 25 * 60_000).toISOString();
    expect(countdownText(c, due, NOW)).toEqual({ late: false, text: "due in 25 min" });
    expect(countdownText(c, due, NOW + 35 * 60_000)).toEqual({ late: true, text: "late by 10 min" });
  });

  it("decides when the strip speaks and what it links to", () => {
    expect(hasAlerts(null)).toBe(false);
    expect(hasAlerts(summary())).toBe(false);
    expect(hasAlerts(summary({ mine: { callNow: 1, overdue: 0, nextDueAt: null, retriesDue: 0 } }))).toBe(true);
    expect(hasAlerts(summary({ sa: { escalated: 0, unassignedNoArea: 0, toolSignups: 0, unmatchedPlaces: 0, meta: null } }))).toBe(false);
    const links = superAdminLinks(
      { escalated: 2, unassignedNoArea: 1, toolSignups: 0, unmatchedPlaces: 3, meta: { pending: 0, failed: 1, paused: "auth", silentHours: 50 } },
      enSpeed.strip,
    );
    expect(links.map((link) => link.href)).toEqual([
      "/crm?sla=escalated",
      "/crm?area=none&assignee=unassigned&stage=open",
      "/crm/settings/areas",
      "/crm/settings/integrations",
      "/crm/settings/integrations",
      "/crm/settings/integrations",
    ]);
    expect(links[0]).toMatchObject({ text: "2 escalated", tone: "danger" });
  });

  it("writes the head's digest per area and per executive (A7)", () => {
    const area = {
      areas: [
        { id: "kangra", name: "Kangra", overdue: 4, unassigned: 2 },
        { id: "none", name: "", overdue: 1, unassigned: 0 },
      ],
      byExecutive: [
        { userId: "a", name: "Exec A", overdue: 3, away: false },
        { userId: "b", name: "Exec B", overdue: 1, away: true },
      ],
    };
    expect(areaLines(area, enSpeed.strip)).toEqual(["Kangra: 4 overdue · 2 waiting for someone", "No area: 1 overdue"]);
    expect(executiveDigest(area, enSpeed.strip)).toBe("Exec A 3, Exec B (away) 1");
    expect(areaLines(area, hiSpeed.strip)[1]).toBe("कोई एरिया नहीं: 1 में देर");
  });

  it("keeps one count in the tab title", () => {
    expect(titleWithCount(enSpeed.strip, "Today's calls", 3)).toBe("(3) Today's calls");
    expect(titleWithCount(enSpeed.strip, "(3) Today's calls", 0)).toBe("Today's calls");
    expect(baseTitle("(12) Enquiries")).toBe("Enquiries");
    expect(summaryRequest("hi").path).toBe("/api/crm/sla/summary?lang=hi");
    expect(summaryRequest("en").path).toBe("/api/crm/sla/summary");
  });

  it("checks calling hours and the speed rule before saving", () => {
    const h = enSpeed.hours;
    expect(callingHoursIssues(DEFAULT_CALLING_HOURS, h)).toEqual({});
    expect(callingHoursIssues(setDay(DEFAULT_CALLING_HOURS, "mon", { start: "19:00", end: "09:00" }), h)).toEqual({ "week.mon": "Monday: the end must be after the start." });
    const shut = Object.keys(DEFAULT_CALLING_HOURS.week).reduce((hours, day) => setDay(hours, day as "mon", { open: false }), DEFAULT_CALLING_HOURS);
    expect(callingHoursIssues(shut, h)).toEqual({ week: h.issues.noOpenDay });
    expect(addClosedDate(DEFAULT_CALLING_HOURS, "2026-02-30", h)).toEqual({ ok: false, issue: h.issues.dateInvalid });
    const added = addClosedDate(DEFAULT_CALLING_HOURS, "2026-12-25", h);
    expect(added).toEqual({ ok: true, value: { ...DEFAULT_CALLING_HOURS, closedDates: ["2026-12-25"] } });
    expect(added.ok && addClosedDate(added.value, "2026-12-25", h)).toEqual({ ok: false, issue: h.issues.dateDuplicate });

    const r = enSpeed.rule;
    expect(speedRuleIssues(DEFAULT_SPEED_RULE, r)).toEqual({});
    const backwards = { ...DEFAULT_SPEED_RULE, tiers: { areaHead: { enabled: true, afterMinutes: 240 }, superAdmin: { enabled: true, afterMinutes: 60 } } };
    expect(speedRuleIssues(backwards, r)).toEqual({ "tiers.superAdmin": r.issues.tierOrder });
    expect(Object.keys(speedRuleIssues({ ...DEFAULT_SPEED_RULE, firstCallMinutes: Number.NaN, reachedOutcomes: [] }, r))).toEqual(["firstCallMinutes", "reachedOutcomes"]);
    expect(clockSourceOptions({ ...DEFAULT_SPEED_RULE, sources: [...DEFAULT_SPEED_RULE.sources, "fair_2026"] })).toContain("fair_2026");
  });

  it("sends only the changed document, with the version the page loaded", () => {
    const saved = { callingHours: DEFAULT_CALLING_HOURS, speedRule: DEFAULT_SPEED_RULE, versions: { callingHours: 2, speedRule: 5 } };
    expect(speedSaveRequest({ callingHours: DEFAULT_CALLING_HOURS, speedRule: DEFAULT_SPEED_RULE }, saved)).toBeNull();
    const rule = { ...DEFAULT_SPEED_RULE, firstCallMinutes: 30 };
    expect(speedSaveRequest({ callingHours: DEFAULT_CALLING_HOURS, speedRule: rule }, saved)).toEqual({
      path: "/api/crm/settings/speed",
      method: "PUT",
      body: { speedRule: rule, expectedVersion: { speedRule: 5 } },
    });
  });
});

describe("alert strip", () => {
  for (const locale of LOCALES) {
    const t = crm(locale);
    it(`renders nothing before its first answer, then counts in words with links (${locale})`, () => {
      expect(inLocale(locale, createElement(SlaAlertStrip, { locale, role: "manager", superAdmin: false, pagePath: "/crm", t: { strip: t.speed.strip, errors: t.errors } }))).toBe("");
      expect(inLocale(locale, createElement(SlaAlertStripView, { summary: summary(), locale, t: t.speed.strip, chime: false }))).toBe("");

      const html = inLocale(
        locale,
        createElement(SlaAlertStripView, {
          summary: summary({
            mine: { callNow: 3, overdue: 1, nextDueAt: new Date(NOW + 30 * 60_000).toISOString(), retriesDue: 2 },
            area: { areas: [{ id: "kangra", name: locale === "hi" ? "कांगड़ा" : "Kangra", overdue: 4, unassigned: 0 }], byExecutive: [{ userId: "a", name: "Exec A", overdue: 4, away: false }] },
            sa: { escalated: 1, unassignedNoArea: 0, toolSignups: 2, unmatchedPlaces: 0, meta: null },
          }),
          locale,
          t: t.speed.strip,
          chime: true,
        }),
      );
      expect(html).toContain(`aria-label="${esc(t.speed.strip.label)}"`);
      expect(html).toContain(esc(t.speed.strip.callNow.replace("{count}", "3")));
      expect(html).toContain(esc(t.speed.strip.overdue.replace("{count}", "1")));
      expect(html).toContain(esc(t.speed.strip.retriesDue.replace("{count}", "2")));
      expect(html).toContain(esc(t.speed.strip.saAreaTitle));
      expect(html).toContain(esc(t.speed.strip.inAppOnly));
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain(locale === "hi" ? 'href="/hi/crm/today"' : 'href="/crm/today"');
      expect(html).toContain("sla=escalated");
      expect(html).toContain("area=tool_signups");
    });
  }
});

describe("Call now and escalation lists", () => {
  for (const locale of LOCALES) {
    const t = crm(locale);
    const messages = { callNow: t.speed.callNow, slaChip: t.slaChip, sources: t.sources, common: t.common };
    it(`lists waiting families with a countdown, masked phone and a named call link (${locale})`, () => {
      const html = inLocale(
        locale,
        createElement(CallNowList, {
          items: [item(), item({ leadId: "lead-2", displayName: null, clock: { ...item().clock, state: "overdue", dueAt: new Date(NOW - 10 * 60_000).toISOString(), reason: "import" } })],
          total: 5,
          now: NOW,
          locale,
          areaNames: { kangra: locale === "hi" ? "कांगड़ा" : "Kangra" },
          backPath: "/crm/today",
          t: messages,
        }),
      );
      expect(html).toContain(esc(t.speed.callNow.dueIn.replace("{time}", t.speed.callNow.minutes.replace("{count}", "25"))));
      expect(html).toContain(esc(t.speed.callNow.lateBy.replace("{time}", t.speed.callNow.minutes.replace("{count}", "10"))));
      expect(html).toContain(esc(t.common.callLead.replace("{name}", "Test Student")));
      expect(html).toContain(esc(t.common.callLead.replace("{name}", t.common.unnamed)));
      expect(html).toContain("#crm-lead-contact");
      expect(html).toContain("back=%2Fcrm%2Ftoday");
      expect(html).toContain(esc(t.speed.callNow.imported));
      expect(html).toContain(esc(t.speed.callNow.more.replace("{count}", "3")));
      expect(html).not.toMatch(/\+91\d|9\d{9}/);
      expect(inLocale(locale, createElement(CallNowList, { items: [], total: 0, now: NOW, locale, areaNames: {}, backPath: "/crm/today", t: messages }))).toContain(
        esc(t.speed.callNow.empty),
      );

      const table = inLocale(
        locale,
        createElement(EscalationList, { items: [item()], now: NOW, locale, areaNames: { kangra: "Kangra" }, backPath: "/crm?sla=escalated", t: { escalation: t.speed.escalation, common: t.common } }),
      );
      expect(table).toContain("<caption");
      expect(table).toContain('scope="row"');
      expect(table).toContain("Exec One");
    });

    it(`puts "Call now" first on Today's calls when given (${locale})`, () => {
      const html = inLocale(
        locale,
        createElement(TodayView, {
          data: { overdue: [], dueToday: [], fresh: [], callNow: { items: [item()], total: 1, areaNames: {}, maxRetries: 3 } },
          centres: {},
          now: NOW,
          locale,
          t,
        }),
      );
      expect(html.indexOf(esc(t.speed.callNow.title))).toBeGreaterThan(-1);
      expect(html.indexOf(esc(t.speed.callNow.title))).toBeLessThan(html.indexOf(esc(t.today.overdueTitle)));
      expect(html).toContain(esc(t.speed.callNow.retriesNote.replace("{count}", "3")));
    });
  }
});

describe("Calling hours & speed form", () => {
  for (const locale of LOCALES) {
    const t = crm(locale);
    const props = (canEdit: boolean) => ({
      initial: {
        callingHours: { key: "calling_hours" as const, value: { ...DEFAULT_CALLING_HOURS, closedDates: ["2026-12-25"] }, version: 1, updatedAt: null, updatedBy: null, isDefault: false },
        speedRule: { key: "speed_rule" as const, value: DEFAULT_SPEED_RULE, version: 0, updatedAt: null, updatedBy: null, isDefault: true },
      },
      canEdit,
      pagePath: "/crm/settings/speed",
      locale,
      t: { speed: { form: t.speed.form, hours: t.speed.hours, rule: t.speed.rule }, sources: t.sources, outcomes: t.lead.contact.outcomes, errors: t.errors },
    });

    it(`labels every control, names each day, and lets only a super admin save (${locale})`, () => {
      const editable = inLocale(locale, createElement(SpeedSettingsForm, props(true)));
      expectLabelledControls(editable);
      expect(editable).toContain(esc(t.speed.hours.open.replace("{day}", t.speed.hours.days.mon)));
      expect(editable).toContain(esc(t.speed.hours.from.replace("{day}", t.speed.hours.days.sun)));
      expect(editable).toContain(esc(t.speed.form.save));
      expect(editable).toContain(esc(t.speed.hours.removeDate.split("{date}")[0].trim() || t.speed.hours.removeDate.split("{date}")[1].trim()));
      expect(editable).toContain('type="radio"');
      expect(editable).toContain(esc(t.sources.meta_lead_ad));

      const readOnly = inLocale(locale, createElement(SpeedSettingsForm, props(false)));
      expect(readOnly).not.toContain(esc(t.speed.form.save));
      expect(readOnly).not.toContain(esc(t.speed.hours.addDate) + "</button>");
      expect((readOnly.match(/disabled=""/g) ?? []).length).toBeGreaterThan(20);
    });
  }
});
