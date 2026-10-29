import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/config";

// 1B-FAMILY (docs/admin-phase-1b-plan.md §5.H): the "Lost enquiries to review" page — markup in both
// languages (filters, table, actions, matrix, empty state) and the page gate per role (prerendered
// for real sessions). Synthetic data only.
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return {
    cookies: async () => cookieStore(cookieState),
    headers: async () => new Headers({ host: "localhost:3000" }),
  };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/crm/lost",
  useSearchParams: () => new URLSearchParams(),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { createSession } = await import("@/lib/auth/sessions");
const { createTestUser } = await import("@/lib/auth/testing/harness");
const { captureLead, changeStage, resolveCrmViewer, writeStaffMembership } = await import("@/lib/crm");
const { LocaleProvider } = await import("@/i18n/client");
const { messagesFor } = await import("@/i18n/messages");
const { withTestLang } = await import("@/test/root-params-stub");
const { familyMessages } = await import("../details/messages");
const { default: CrmLostReviewPage } = await import("@/app/[lang]/(portal)/crm/lost/page");
const { LostReviewView, lostListPath } = await import("./LostReviewView");
const { insideHardWindow } = await import("./LostReviewActions");

type Report = import("@/lib/crm/console/lost/types").LostReviewReport;

const PASSWORD = "synthetic-pass-2026";
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const DAY = 86_400_000;
const LOCALES: Locale[] = ["en", "hi"];
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function provider(locale: Locale, child: ReactNode): ReactElement {
  return createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child);
}
const html = (locale: Locale, element: ReactElement) => renderToStaticMarkup(provider(locale, element));

function report(overrides: Partial<Report> = {}): Report {
  return {
    days: 14,
    since: new Date(NOW - 14 * DAY).toISOString(),
    assignee: null,
    truncated: false,
    items: [
      {
        leadId: "lead-1",
        name: "Synthetic Student",
        lostAt: "2026-10-19T05:00:00.000Z",
        fromStage: "contacted",
        reason: "fees",
        markedBy: { userId: "u1", name: "Counsellor One" },
        callsMade: 3,
        lastOutcome: "no_answer",
        daysSinceEnquiry: 6,
        assignee: { userId: "u1", displayName: "Counsellor One" },
      },
      { leadId: "lead-2", name: null, lostAt: "2026-10-18T05:00:00.000Z", fromStage: null, reason: null, markedBy: null, callsMade: 0, lastOutcome: null, daysSinceEnquiry: 0, assignee: null },
    ],
    matrix: {
      reasons: ["not_reachable", "fees"],
      rows: [
        { userId: "u1", name: "Counsellor One", counts: { fees: 2, not_reachable: 1 }, total: 3 },
        { userId: null, name: null, counts: { not_reachable: 1 }, total: 1 },
      ],
      total: 4,
    },
    ...overrides,
  };
}

const STAFF = [
  { value: "u1", label: "Counsellor One" },
  { value: "u2", label: "Counsellor Two" },
];

describe.each(LOCALES)("lost review markup (%s)", (locale) => {
  const f = familyMessages(locale).lost;
  const t = messagesFor(locale, "crm");
  const prefix = locale === "hi" ? "/hi" : "";

  it("labelled filters, a captioned table with way-back links, review buttons and the reasons matrix", () => {
    const markup = html(locale, createElement(LostReviewView, { report: report({ days: 30, assignee: "u1" }), staff: STAFF, now: NOW, locale, t }));
    for (const id of ["crm-lost-days", "crm-lost-assignee"]) expect(markup).toContain(`for="${id}"`);
    expect(markup).toContain('<option value="30" selected="">');
    expect(markup).toContain('<option value="u1" selected="">');
    expect(markup).toContain(esc(f.caption));
    expect(markup).toContain(`aria-label="${esc(f.region)}"`);
    for (const header of Object.values(f.columns)) expect(markup).toContain(esc(header));
    expect(markup).toContain(`href="${prefix}/crm/leads/lead-1?back=%2Fcrm%2Flost%3Fdays%3D30%26assignee%3Du1"`);
    expect(markup).toContain(esc(t.lostReasons.fees));
    expect(markup).toContain(esc(t.lostReasons.unspecified));
    expect(markup).toContain(esc(t.lead.contact.outcomes.no_answer));
    expect(markup).toContain(esc(f.noOutcome));
    expect(markup).toContain(esc(f.system));
    expect(markup).toContain(esc(f.ageDays.replace("{n}", "6")));
    expect(markup).toContain(esc(f.ageToday));
    expect(markup).toContain(`aria-label="${esc(f.keepLabel.replace("{name}", "Synthetic Student"))}"`);
    expect(markup).toContain(`aria-label="${esc(f.reopenLabel.replace("{name}", "Synthetic Student"))}"`);
    expect(markup).toContain(esc(f.count.replace("{count}", "2")));
    // The matrix: one column per reason, a total row, never a bare percentage.
    expect(markup).toContain(esc(f.matrix.title));
    expect(markup).toContain(esc(f.matrix.caption));
    expect(markup).toContain(esc(t.lostReasons.not_reachable));
    expect(markup).toMatch(/<tfoot>/);
    expect(markup.replace(/<[^>]*>/g, " ")).not.toMatch(/\d\s?%/); // text only (URLs carry %2F)
    // Visible button text sits inside the accessible names (WCAG 2.5.3).
    expect(f.keepLabel.replace("{name}", "X")).toContain(f.keep);
    expect(f.reopenLabel.replace("{name}", "X")).toContain(f.reopen.replace("…", ""));
  });

  it("says what to do when nothing waits for review", () => {
    const markup = html(locale, createElement(LostReviewView, { report: report({ items: [], matrix: { reasons: [], rows: [], total: 0 } }), staff: [], now: NOW, locale, t }));
    expect(markup).toContain(esc(f.empty.replace("{days}", "14")));
    expect(markup).toContain(esc(f.emptyHint));
    expect(markup).toContain(esc(f.matrix.empty));
    expect(markup).not.toContain("<table");
  });
});

describe("helpers", () => {
  it("keeps the list's own query for the way back, and checks picked times against 08:00–21:00", () => {
    expect(lostListPath({ days: 14, assignee: null })).toBe("/crm/lost");
    expect(lostListPath({ days: 7, assignee: "unassigned" })).toBe("/crm/lost?days=7&assignee=unassigned");
    expect(["08:00", "12:30", "21:00"].every(insideHardWindow)).toBe(true);
    expect(["07:59", "21:01", "", "9:00"].some(insideHardWindow)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The page, prerendered for real sessions.

async function renderPage(lang: Locale, page: () => Promise<unknown>): Promise<{ html: string; errors: unknown[] }> {
  return withTestLang(lang, async () => {
    const errors: unknown[] = [];
    const element = (await page()) as ReactNode;
    const { prelude } = await prerender(provider(lang, element), { onError: (error) => void errors.push(error) });
    return { html: await new Response(prelude).text(), errors };
  });
}

async function signInAs(role: "admin" | "staff", loginId: string, crmRole?: "manager" | "counsellor", centreSlugs: string[] = []) {
  const user = await createTestUser({ role, loginId, password: PASSWORD, displayName: `Name of ${loginId}` });
  if (crmRole) writeStaffMembership(getDb(), user.id, user.id, { crmRole, centreSlugs, active: true }, Date.now());
  cookieState.jar = new Map([["aspire_session", createSession(user.id).token]]);
  return user;
}

describe("/crm/lost", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_DB_PATH", ":memory:");
    vi.stubEnv("PORTAL_PREVIEW", "false");
    resetDatabaseForTests();
    cookieState.jar = new Map();
    for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetDatabaseForTests();
  });

  it("counsellors get 'not available'; area heads see their lost enquiries", async () => {
    const adminUser = await signInAs("admin", "owner.one");
    const admin = resolveCrmViewer({ userId: adminUser.id, role: "admin", displayName: "Owner" } as never);
    if (!admin) throw new Error("expected an admin viewer");
    const result = captureLead({ source: "admissions", studentName: "Synthetic Student", phone: "9680000001", centreSlug: "shimla", consent: { textVersion: "test-v1" } }, Date.now() - 3 * DAY);
    if (!result.ok) throw new Error("capture failed");
    expect(changeStage(admin, result.leadId, "lost", "fees", Date.now() - DAY).ok).toBe(true);

    await signInAs("staff", "exec.one", "counsellor");
    const counsellor = await renderPage("en", () => CrmLostReviewPage({ searchParams: Promise.resolve({}) }));
    expect(counsellor.errors).toEqual([]);
    expect(counsellor.html).toContain(esc(familyMessages("en").lost.notAllowedBody));
    expect(counsellor.html).not.toContain("crm-lost-table");

    const kulluOnly = await createTestUser({ role: "staff", loginId: "exec.kullu", password: PASSWORD, displayName: "Kullu Only Counsellor" });
    writeStaffMembership(getDb(), kulluOnly.id, kulluOnly.id, { crmRole: "counsellor", centreSlugs: ["kullu"], active: true }, Date.now());

    await signInAs("staff", "head.shimla", "manager", ["shimla"]);
    const head = await renderPage("hi", () => CrmLostReviewPage({ searchParams: Promise.resolve({ days: "30" }) }));
    expect(head.errors).toEqual([]);
    expect(head.html).toContain(familyMessages("hi").lost.title);
    expect(head.html).toContain("crm-lost-table");
    expect(head.html).toContain(`/hi/crm/leads/${result.leadId}?back=%2Fcrm%2Flost%3Fdays%3D30`);
    // The counsellor filter keeps to the area head's scope (a Kullu-only counsellor is not offered).
    expect(head.html).toContain("Name of exec.one");
    expect(head.html).not.toContain("Kullu Only Counsellor");
  });
});
