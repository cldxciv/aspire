import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import en from "@/i18n/messages/en/console-numbers";
import hi from "@/i18n/messages/hi/console-numbers";
import type { ActivityRow, CounsellorActivityReport } from "@/lib/crm/console/activity/activity";
import { CounsellorActivity } from "./CounsellorActivity";

// Counsellor activity markup (docs/admin-phase-1b-plan.md §5.G): one row per person for heads and
// admins, "Your numbers" for counsellors, "x of y" connected calls, a blank for no active day, the
// WhatsApp, scope and AI-assistant footnotes, the dashboard link. Synthetic data only.

const html = (locale: Locale, element: ReactElement) =>
  renderToStaticMarkup(createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, element as ReactNode));
const RANGE = { fromIso: "2026-10-18T18:30:00.000Z", toIso: "2026-10-21T18:30:00.000Z" };

const person = (overrides: Partial<ActivityRow>): ActivityRow => ({
  userId: "u-one",
  name: "Counsellor One",
  calls: 4,
  connected: 2,
  whatsapps: 1,
  followUps: 1,
  activeDays: 3,
  callsPerActiveDay: 1.3,
  openLeads: 5,
  admissions: 1,
  self: false,
  ...overrides,
});

const REPORT: CounsellorActivityReport = {
  from: RANGE.fromIso,
  to: RANGE.toIso,
  own: false,
  scoped: true,
  rows: [person({}), person({ userId: "u-head", name: "Area Head", calls: 0, connected: 0, whatsapps: 0, followUps: 0, activeDays: 0, callsPerActiveDay: null, self: true })],
  mcpIncluded: true,
};

describe("counsellor activity (markup)", () => {
  it("heads and admins: every person, x of y, blanks, footnotes and the dashboard link", () => {
    const out = html("en", createElement(CounsellorActivity, { report: REPORT, range: RANGE, canViewDashboard: true, locale: "en" }));
    expect(out).toContain(en.activity.title);
    expect(out).toContain("19 Oct 2026");
    expect(out).toContain("21 Oct 2026"); // the last day (toIso is exclusive)
    expect(out).not.toContain("22 Oct 2026");
    for (const header of Object.values(en.activity.columns)) expect(out).toContain(header);
    expect(out).toContain("2 of 4 (50 %)");
    expect(out).toContain("0 of 0");
    expect(out).toContain(">1.3<");
    expect(out).toContain("Area Head (You)");
    expect(out).toContain(en.activity.whatsappNote);
    expect(out).toContain(en.activity.scopeNote);
    expect(out).toContain(en.activity.mcpFootnote);
    expect(out).toContain('href="/crm/dashboard"');
    expect(out).toMatch(/<caption[^>]*>Counsellor activity, 19 Oct 2026 to 21 Oct 2026<\/caption>/);
  });

  it("counsellors: 'Your numbers', no dashboard link, no AI footnote when none was used", () => {
    const own: CounsellorActivityReport = { ...REPORT, own: true, scoped: false, mcpIncluded: false, rows: [person({ self: true })] };
    const out = html("hi", createElement(CounsellorActivity, { report: own, range: RANGE, canViewDashboard: false, locale: "hi" }));
    expect(out).toContain(hi.activity.titleOwn);
    expect(out).not.toContain("/crm/dashboard");
    expect(out).not.toContain(hi.activity.mcpFootnote);
    expect(out).not.toContain(hi.activity.scopeNote);
    expect(out).toContain("4 में से 2 (50 %)");
    expect(out).toContain("Counsellor One");
    expect(out).not.toContain(`(${hi.activity.you})`);
  });

  it("says when nothing was logged", () => {
    const quiet: CounsellorActivityReport = { ...REPORT, mcpIncluded: false, rows: [person({ calls: 0, connected: 0, whatsapps: 0, followUps: 0, activeDays: 0, callsPerActiveDay: null })] };
    expect(html("en", createElement(CounsellorActivity, { report: quiet, range: RANGE, canViewDashboard: true, locale: "en" }))).toContain(en.activity.empty);
  });
});
