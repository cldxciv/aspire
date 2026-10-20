import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { ApiFailure } from "@/lib/auth/client-api";
import { AdminOverview, countAccounts } from "./AdminViews";
import { AUDIT_LIMITS, AuditLog, auditActionLabel, auditDetails, parseAuditLimit } from "./AuditLog";
import { DemoEnquiriesTable } from "./DemoEnquiriesTable";
import type { WeakTopic } from "@/lib/ask/weak-topics";
import type { AttemptsSummary, SavedAttemptSummary } from "@/lib/mocktest/types";
import { addDays } from "@/lib/planner/dates";
import type { PlannerSummary } from "@/lib/planner/server/summary";
import { format } from "@/i18n/format";
import {
  buildActivity,
  buildDoubtsView,
  buildMockTestsView,
  buildPlannerView,
  formatPercent,
  formatPortalDateKey,
  type LearnerTools,
  type ToolAudience,
} from "./learner-tools-view";
import { ParentOverview, ParentProgress, ParentUpdates } from "./ParentViews";
import { crmNavItems, isActivePortalItem, portalAreas, visibleStaffNavKeys } from "./areas";
import { PortalBreadcrumbLinks, PortalNavLinks } from "./PortalNav";
import { crmBreadcrumbMessages, navMessages, staffNavMessages } from "./PortalShell";
import { PortalUserMenu } from "./PortalUserMenu";
import { StudentOverview, StudentProgress, StudentSection } from "./StudentViews";
import { adminFailureMessage, filterUsers, UserManager, type AdminUserView } from "./UserManager";

function views(locale: Locale) {
  const portal = messagesFor(locale, "portal");
  const auth = messagesFor(locale, "auth");
  const common = messagesFor(locale, "common");
  return { portal, roles: auth.roles, photoLabel: common.labels.illustrativeStockPhoto };
}

function inLocale(locale: Locale, element: ReactElement): string {
  // `children` goes in as createElement's third argument (react/no-children-prop); the cast keeps tsc happy.
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

/** Every internal href in the markup (ignores #anchors). */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]);
}

function expectLocalisedLinks(html: string, locale: Locale) {
  const links = hrefs(html).filter((href) => href.startsWith("/") && !href.startsWith("/api/"));
  expect(links.length).toBeGreaterThan(0);
  for (const href of links) {
    if (locale === "hi") expect(href, href).toMatch(/^\/hi(\/|\?|$)/);
    else expect(href, href).not.toMatch(/^\/hi(\/|$)/);
  }
}

const userBase = { disabled: false, mustChangePassword: false, createdAt: "2026-10-20T00:48:27.000Z" };
const USERS: AdminUserView[] = [
  { ...userBase, id: "a1", role: "admin", displayName: "Office Admin", loginId: "office.admin" },
  { ...userBase, id: "p1", role: "parent", displayName: "Parent One", loginId: "parent.one", linkedStudentIds: ["s1"] },
  { ...userBase, id: "s1", role: "student", displayName: "Learner One", loginId: "learner.one", linkedParentIds: ["p1"] },
  { ...userBase, id: "s2", role: "student", displayName: "Learner Two", loginId: "learner.two", disabled: true, linkedParentIds: [] },
  { ...userBase, id: "s3", role: "student", displayName: "New Learner", loginId: "new.learner", mustChangePassword: true, linkedParentIds: [] },
];

// ---------------------------------------------------------------------------------------------
// Practice-tool fixtures (M6 phase 2), built with the same pure builders the server loader uses.

const NOW = Date.UTC(2026, 9, 20, 6, 0);
const DAY = 86_400_000;
const TESTS = new Map([
  ["jee-main-sample", { title: "JEE Main sample test", sample: true }],
  ["neet-sample", { title: "NEET sample test", sample: true }],
]);
const ATTEMPTS: SavedAttemptSummary[] = [
  { id: "11111111-1111-4111-8111-111111111111", testId: "jee-main-sample", windowId: null, score: 40, maxScore: 60, correct: 11, wrong: 1, unattempted: 3, timeTakenSec: 900, startedAt: NOW - DAY - 900_000, submittedAt: NOW - DAY },
  { id: "22222222-2222-4222-8222-222222222222", testId: "jee-main-sample", windowId: null, score: 32, maxScore: 60, correct: 9, wrong: 2, unattempted: 4, timeTakenSec: 900, startedAt: NOW - 2 * DAY - 900_000, submittedAt: NOW - 2 * DAY },
  // On a test that is not visible in this build: never listed.
  { id: "33333333-3333-4333-8333-333333333333", testId: "hidden-test", windowId: null, score: 5, maxScore: 60, correct: 2, wrong: 5, unattempted: 8, timeTakenSec: 900, startedAt: NOW - 3 * DAY - 900_000, submittedAt: NOW - 3 * DAY },
];
const SUMMARY: AttemptsSummary = {
  totalAttempts: 3,
  testsTaken: 2,
  lastAttemptAt: NOW - DAY,
  averageAccuracy: 22 / 30,
  bestByTest: [
    { testId: "jee-main-sample", bestScore: 40, maxScore: 60, attempts: 2 },
    { testId: "hidden-test", bestScore: 5, maxScore: 60, attempts: 1 },
  ],
  longestStreakDays: 3,
  badges: ["first-test", "streak-3", "top-10"],
};
const last30 = Array.from({ length: 30 }, (_, i) => ({ date: addDays("2026-09-21", i), active: i >= 27, xp: i >= 27 ? 40 : 0 }));
const PLANNER_SUMMARY: PlannerSummary = {
  hasPlan: true,
  exam: "neet",
  examDate: "2027-01-18",
  daysToExam: 90,
  streak: { current: 3, best: 5, todayDone: true },
  xp: { total: 480, thisWeek: 120 },
  last30Days: last30,
  activeDaysLast30: 3,
  blocksDoneLast30: 9,
  reviewsLast30: 15,
  lastActiveDate: "2026-10-20",
  lastSyncedAt: NOW,
};
const TOPICS: WeakTopic[] = [
  { subject: "physics", topic: "Projectile motion", count: 4, firstSeen: "2026-10-01T05:00:00.000Z", lastSeen: "2026-10-19T05:00:00.000Z" },
  { subject: "chemistry", topic: "Mole concept", count: 2, firstSeen: "2026-10-02T05:00:00.000Z", lastSeen: "2026-10-18T05:00:00.000Z" },
];

function toolsFor(audience: ToolAudience): LearnerTools {
  return {
    audience,
    mockTests: buildMockTestsView({ attempts: ATTEMPTS, summary: SUMMARY, tests: TESTS }),
    planner: buildPlannerView(PLANNER_SUMMARY, { audience, sample: true }),
    doubts: buildDoubtsView(TOPICS, true),
  };
}

function emptyTools(audience: ToolAudience): LearnerTools {
  return {
    audience,
    mockTests: buildMockTestsView({ attempts: [], summary: { ...SUMMARY, totalAttempts: 0, testsTaken: 0, lastAttemptAt: null, averageAccuracy: null, bestByTest: [], longestStreakDays: 0, badges: [] }, tests: TESTS }),
    planner: buildPlannerView({ ...PLANNER_SUMMARY, hasPlan: false, exam: null, examDate: null, daysToExam: null, streak: { current: 0, best: 0, todayDone: false }, xp: { total: 0, thisWeek: 0 }, activeDaysLast30: 0, blocksDoneLast30: 0, reviewsLast30: 0, lastActiveDate: null, lastSyncedAt: null }, { audience, sample: true }),
    doubts: buildDoubtsView([], true),
  };
}

/** Production with sample content hidden: no visible tests, planner closed, Ask Aspire without a key. */
function gatedTools(audience: ToolAudience): LearnerTools {
  return {
    audience,
    mockTests: buildMockTestsView({ attempts: ATTEMPTS, summary: SUMMARY, tests: new Map() }),
    planner: buildPlannerView(null, { audience, sample: false }),
    doubts: buildDoubtsView([], false),
  };
}

/** Heading levels never skip downwards (h2 → h4) and there is exactly one h1. */
function expectHeadingOrder(html: string) {
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  expect(levels.filter((l) => l === 1)).toHaveLength(1);
  for (let i = 1; i < levels.length; i += 1) expect(levels[i], `heading ${i}: ${levels.join(",")}`).toBeLessThanOrEqual(levels[i - 1] + 1);
}

/** Every aria-labelledby points at an element id on the page. */
function expectLabelledByTargets(html: string) {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, target] of html.matchAll(/aria-labelledby="([^"]+)"/g)) expect(ids.has(target), target).toBe(true);
  // ids are unique
  const all = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  expect(new Set(all).size).toBe(all.length);
}

const visibleText = (html: string) => html.replace(/<[^>]+>/g, " ");

/** A message as React escapes it in markup. */
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

describe("practice-tool view builders", () => {
  it("leave out attempts on tests that are not visible and recompute totals from the visible ones", () => {
    const view = buildMockTestsView({ attempts: ATTEMPTS, summary: SUMMARY, tests: TESTS });
    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;
    expect(view.recent.map((a) => a.id)).toEqual([ATTEMPTS[0].id, ATTEMPTS[1].id]);
    expect(view.totalAttempts).toBe(2);
    expect(view.testsTaken).toBe(1);
    expect(view.averageAccuracy).toBeCloseTo(20 / 23);
    expect(view.best).toEqual([{ testId: "jee-main-sample", title: "JEE Main sample test", sample: true, bestScore: 40, maxScore: 60, attempts: 2 }]);
    // Leaderboard badges could come from the hidden test, so only activity badges are kept.
    expect(view.badges).toEqual(["first-test"]);
    expect(JSON.stringify(view)).not.toContain("hidden-test");
  });

  it("use the stored summary when every attempt is visible", () => {
    const view = buildMockTestsView({ attempts: ATTEMPTS.slice(0, 2), summary: { ...SUMMARY, totalAttempts: 2, testsTaken: 1, bestByTest: SUMMARY.bestByTest.slice(0, 1) }, tests: TESTS });
    expect(view).toMatchObject({ status: "ready", totalAttempts: 2, badges: ["first-test", "streak-3", "top-10"], longestStreakDays: 3 });
  });

  it("planner: parents get counts only; doubts: subjects totalled", () => {
    expect(buildPlannerView(PLANNER_SUMMARY, { audience: "parent", sample: true })).toMatchObject({ xp: null, exam: null, daysToExam: null, activeDaysLast30: 3 });
    expect(buildPlannerView(PLANNER_SUMMARY, { audience: "student", sample: true })).toMatchObject({ xp: { total: 480, thisWeek: 120 }, exam: "neet", daysToExam: 90 });
    expect(buildDoubtsView(TOPICS, false)).toMatchObject({ status: "ready", totalDoubts: 6, topicCount: 2, bySubject: [{ subject: "physics", count: 4 }, { subject: "chemistry", count: 2 }] });
  });

  it("activity feed is newest first across the tools", () => {
    const items = buildActivity(toolsFor("parent"));
    expect(items.map((i) => i.kind)).toEqual(["planner", "mockTest", "doubt", "mockTest", "doubt"]);
    expect(items.every((item, i) => i === 0 || items[i - 1].at >= item.at)).toBe(true);
  });
});

describe("student views", () => {
  it.each(["en", "hi"] as const)("signed-in dashboard (%s): own tool data, links to each attempt, remaining areas not connected", (locale) => {
    const m = views(locale);
    const tt = m.portal.tools;
    const html = inLocale(
      locale,
      createElement(StudentOverview, {
        locale,
        m,
        account: { displayName: "Learner One", loginId: "learner.one", linkedParents: 2 },
        tools: toolsFor("student"),
      }),
    );
    expectHeadingOrder(html);
    expectLabelledByTargets(html);
    expect(html).toContain("Learner One");
    expect(html).toContain(m.portal.blocks.toolDataBadge);
    expect(html).not.toContain(m.portal.blocks.previewBadge);
    expect(html).toContain(tt.mock.title);
    expect(html).toContain("JEE Main sample test");
    expect(html).toContain(tt.sampleTest);
    expect(html).toContain(esc(tt.sampleNote));
    const prefix = locale === "hi" ? "/hi" : "";
    for (const page of ["result", "certificate", "report"]) {
      expect(html).toContain(`href="${prefix}/tools/mock-tests/jee-main-sample/${page}?saved=11111111-1111-4111-8111-111111111111"`);
    }
    expect(html).toContain(`href="${prefix}/student/progress"`);
    expect(html).toContain(tt.mock.badges.firstTest);
    expect(html).not.toContain(tt.mock.badges.top10);
    expect(html).toContain(tt.planner.title);
    expect(html).toContain(tt.samplePlan);
    expect(html).toContain(format(tt.planner.stripActive, { date: formatPortalDateKey("2026-10-20", locale) }));
    expect(html).toContain('<p class="break-words font-bold text-navy" lang="en">Projectile motion</p>');
    expect(html).toContain(format(tt.doubts.count, { n: "4" }));
    // Timetable, classroom results, attendance and study material are still not connected.
    expect(html.split(m.portal.blocks.notConnected).length - 1).toBe(4);
    expectLocalisedLinks(html, locale);
    // Nothing from the hidden test.
    expect(html).not.toContain("hidden-test");
  });

  it("empty states link to the tools and show no numbers that look like results", () => {
    const m = views("en");
    const tt = m.portal.tools;
    const html = inLocale(
      "en",
      createElement(StudentOverview, {
        locale: "en",
        m,
        account: { displayName: "Learner One", loginId: "learner.one", linkedParents: 0 },
        tools: emptyTools("student"),
      }),
    );
    expect(html).toContain(tt.mock.emptyTitle);
    expect(html).toContain(tt.planner.emptyTitle);
    expect(html).toContain(tt.doubts.emptyTitle);
    expect(html).toContain('href="/tools/mock-tests"');
    expect(html).toContain('href="/tools/planner"');
    expect(html).toContain('href="/tools/ask"');
    expect(visibleText(html)).not.toMatch(/\d+\s*%|\bGrade\b|\bScore:/);
    expectHeadingOrder(html);
  });

  it("production (tools gated): 'coming soon' and 'not connected', no sample titles, no tool links", () => {
    const m = views("hi");
    const tt = m.portal.tools;
    const html = inLocale(
      "hi",
      createElement(StudentOverview, {
        locale: "hi",
        m,
        account: { displayName: "Learner One", loginId: "learner.one", linkedParents: 0 },
        tools: gatedTools("student"),
      }),
    );
    expect(html).toContain(tt.mock.comingSoonTitle);
    expect(html).toContain(tt.planner.comingSoonTitle);
    expect(html).toContain(tt.doubts.notConnectedTitle);
    expect(html).not.toContain("sample test");
    expect(html).not.toContain("/tools/");
    expectLocalisedLinks(html, "hi");
  });

  it("preview (signed out) shows no account or tool data and a sign-in link to the localised login", () => {
    const m = views("hi");
    const html = inLocale("hi", createElement(StudentOverview, { locale: "hi", m, account: null, tools: null }));
    expect(html).toContain(m.portal.blocks.previewBadge);
    expect(html).toContain(m.portal.account.previewBody);
    expect(html).toContain(m.portal.tools.previewBody);
    expect(html).toContain('href="/hi/login?next=%2Fstudent"');
    expect(html).not.toContain(m.portal.account.loginId);
    expect(html).not.toContain(m.portal.tools.mock.recentTitle);
  });

  it.each(["en", "hi"] as const)("progress page (%s): full detail, then classroom results / attendance not connected", (locale) => {
    const t = messagesFor(locale, "portal");
    const html = inLocale(locale, createElement(StudentProgress, { locale, t, tools: toolsFor("student") }));
    expectHeadingOrder(html);
    expectLabelledByTargets(html);
    expect(html).toContain(t.tools.mock.bestTitle);
    expect(html).toContain(format(t.tools.mock.breakdown, { correct: "11", wrong: "1", skipped: "3" }));
    expect(html).toContain(t.tools.doubts.bySubjectTitle);
    expect(html).toContain(t.tools.planner.totals.xpTotal);
    expect(html).toContain(format(t.tools.planner.exam, { exam: t.tools.planner.exams.neet }));
    expect(html).toContain(t.student.progress.emptyTitle);
    expectLocalisedLinks(html, locale);
    const preview = inLocale(locale, createElement(StudentProgress, { locale, t, tools: null }));
    expect(preview).toContain(t.blocks.previewBadge);
    expect(preview).not.toContain("JEE Main sample test");
  });

  it("section pages are honest empty states", () => {
    const t = messagesFor("en", "portal");
    const html = renderToStaticMarkup(createElement(StudentSection, { section: "resources", preview: false, locale: "en", t }));
    expect(html).toContain(t.student.resources.emptyTitle);
    expect(html).toContain(`${t.blocks.requires} <strong`);
    expect(html).toContain('href="/resources"');
  });
});

describe("parent views", () => {
  const learner = (id: string, displayName: string, tools = toolsFor("parent")) => ({ id, displayName, tools });

  it.each(["en", "hi"] as const)("dashboard (%s): only the linked learners passed in, a summary each, no attempt links", (locale) => {
    const m = views(locale);
    const f = m.portal.tools.facts;
    const html = inLocale(
      locale,
      createElement(ParentOverview, {
        locale,
        m,
        account: { displayName: "Parent One", loginId: "parent.one", learners: [learner("s1", "Learner One")] },
      }),
    );
    expectHeadingOrder(html);
    expect(html).toContain("Learner One");
    expect(html).not.toContain("Learner Two");
    expect(html).toContain(format(f.mockValue, { n: "2", accuracy: formatPercent(20 / 23, locale) }));
    expect(html).toContain(format(f.plannerValue, { streak: "3", active: "3" }));
    expect(html).toContain(format(f.doubtsValue, { n: "6", topics: "2" }));
    // Attendance is still not connected.
    expect(html.split(m.portal.blocks.notConnected).length - 1).toBe(1);
    expect(html).toContain(`href="${locale === "hi" ? "/hi" : ""}/parent/progress#parent-progress-learner-0"`);
    // The attempt pages read the student's own account: never linked for parents.
    expect(html).not.toContain("?saved=");
    expectLocalisedLinks(html, locale);
  });

  it("shows an empty state when no learner is linked (Hindi)", () => {
    const m = views("hi");
    const html = inLocale(
      "hi",
      createElement(ParentOverview, { locale: "hi", m, account: { displayName: "अभिभावक", loginId: "parent.one", learners: [] } }),
    );
    expect(html).toContain(m.portal.parent.noLearnersTitle);
    expect(html).toContain('href="/hi/contact"');
    expectLocalisedLinks(html, "hi");
  });

  it.each(["en", "hi"] as const)("progress page (%s): one panel per learner, counts only, the portal is the report", (locale) => {
    const t = messagesFor(locale, "portal");
    const html = inLocale(
      locale,
      createElement(ParentProgress, {
        locale,
        t,
        learners: [learner("s1", "Learner One"), learner("s9", "Learner Nine", emptyTools("parent"))],
      }),
    );
    expectHeadingOrder(html);
    expectLabelledByTargets(html);
    expect(html).toContain('id="parent-progress-learner-0"');
    expect(html).toContain('id="parent-progress-learner-1"');
    expect(html.split(t.parent.progressPage.classroomTitle).length - 1).toBe(2);
    expect(html).toContain(esc(t.parent.progressPage.reportBody));
    expect(html).toContain(t.tools.mock.bestTitle);
    expect(html).toContain(t.tools.mock.emptyBodyParent);
    // Counts only: no XP, exam or links into the student's own attempt pages.
    expect(html).not.toContain(t.tools.planner.totals.xpTotal);
    expect(html).not.toContain(t.tools.planner.totals.xpWeek);
    expect(html).not.toContain(format(t.tools.planner.exam, { exam: t.tools.planner.exams.neet }));
    expect(html).not.toContain("?saved=");
    expectLocalisedLinks(html, locale);
  });

  it("progress and updates previews show no learner", () => {
    const t = messagesFor("en", "portal");
    const progress = renderToStaticMarkup(createElement(ParentProgress, { locale: "en", t, learners: null }));
    expect(progress).toContain(t.blocks.previewBadge);
    expect(progress).not.toContain("Learner One");
    const updates = renderToStaticMarkup(createElement(ParentUpdates, { locale: "en", t, learners: null }));
    expect(updates).toContain(t.parent.updatesPage.emptyTitle);
    expect(updates).not.toContain('id="parent-activity"');
  });

  it.each(["en", "hi"] as const)("updates page (%s): recent activity per learner, no message channels, announcements not connected", (locale) => {
    const t = messagesFor(locale, "portal");
    const html = inLocale(
      locale,
      createElement(ParentUpdates, { locale, t, learners: [learner("s1", "Learner One"), learner("s9", "Learner Nine", emptyTools("parent"))] }),
    );
    expectHeadingOrder(html);
    expectLabelledByTargets(html);
    expect(html).toContain(t.tools.activity.mockTest);
    expect(html).toContain(t.tools.activity.planner);
    expect(html).toContain('<span lang="en">Projectile motion</span>');
    expect(html).toContain(t.parent.updatesPage.activityEmpty);
    expect(html).toContain(esc(t.parent.progressPage.reportBody));
    expect(html).toContain(t.parent.updatesPage.emptyTitle);
  });
});

describe("admin views", () => {
  it("counts accounts from the database rows", () => {
    expect(countAccounts(USERS)).toEqual({ students: 3, parents: 1, admins: 1, disabled: 1, pending: 1 });
  });

  it("overview shows real counts when signed in and '—' in preview", () => {
    const m = views("en");
    const html = inLocale(
      "en",
      createElement(AdminOverview, {
        locale: "en",
        m,
        account: { displayName: "Office Admin", loginId: "office.admin", counts: countAccounts(USERS) },
      }),
    );
    expect(html).toContain(m.portal.admin.overview.statNote);
    expect(html).toContain('href="/admin/users"');
    expect(html).toContain('href="/admin/audit"');
    // The admissions CRM is one of the admin areas.
    expect(html).toContain('href="/crm"');
    expect(html).toContain(esc(m.portal.admin.overview.areas.crmTitle));
    const preview = inLocale("hi", createElement(AdminOverview, { locale: "hi", m: views("hi"), account: null }));
    expect(preview.split(messagesFor("hi", "portal").blocks.noValue).length - 1).toBe(5);
    expectLocalisedLinks(preview, "hi");
  });

  it("filters users by role, status and search", () => {
    expect(filterUsers(USERS, { role: "student", status: "all", query: "" }).map((u) => u.id)).toEqual(["s1", "s2", "s3"]);
    expect(filterUsers(USERS, { role: "all", status: "disabled", query: "" }).map((u) => u.id)).toEqual(["s2"]);
    expect(filterUsers(USERS, { role: "all", status: "active", query: "LEARNER" }).map((u) => u.id)).toEqual(["s1", "s3"]);
    expect(filterUsers(USERS, { role: "all", status: "all", query: "parent.one" }).map((u) => u.id)).toEqual(["p1"]);
  });

  it("localises admin API failures by code / known message", () => {
    const m = { users: messagesFor("hi", "portal").admin.users, errors: messagesFor("hi", "portal").errors, roles: messagesFor("hi", "auth").roles };
    const f = (partial: Partial<ApiFailure> & Pick<ApiFailure, "error">): ApiFailure => ({ ok: false, status: 0, known: null, fieldErrors: {}, ...partial });
    expect(adminFailureMessage(f({ error: "forbidden", known: "lastAdmin" }), m)).toBe(m.users.errors.lastAdmin);
    expect(adminFailureMessage(f({ error: "forbidden", known: "selfReset" }), m)).toBe(m.users.errors.selfReset);
    expect(adminFailureMessage(f({ error: "forbidden", known: "passwordChangeRequired" }), m)).toBe(m.errors.passwordChangeRequired);
    expect(adminFailureMessage(f({ error: "forbidden" }), m)).toBe(m.errors.forbidden);
    expect(adminFailureMessage(f({ error: "unauthenticated" }), m)).toBe(m.errors.sessionExpired);
    expect(adminFailureMessage(f({ error: "not_configured" }), m)).toBe(m.errors.notConfigured);
    expect(adminFailureMessage(f({ error: "network" }), m)).toBe(m.errors.network);
    expect(adminFailureMessage(f({ error: "rate_limited", retryAfterSeconds: 180 }), m)).toContain("3");
    expect(adminFailureMessage(f({ error: "server_error" }), m)).toBe(m.errors.server);
  });

  it("user manager renders accounts, links and per-account actions without any password", () => {
    const portal = messagesFor("en", "portal");
    const html = inLocale(
      "en",
      createElement(UserManager, {
        initialUsers: USERS,
        currentUserId: "a1",
        messages: { users: portal.admin.users, errors: portal.errors, roles: messagesFor("en", "auth").roles },
      }),
    );
    expect(html).toContain("Showing 5 of 5 accounts");
    // Self: no reset / disable controls (the server refuses them too).
    const adminCard = html.slice(html.indexOf("Office Admin"), html.indexOf("Parent One"));
    expect(adminCard).not.toContain("Reset password");
    expect(adminCard).not.toContain(">Disable<");
    expect(html).toContain('aria-label="Unlink Learner One from Parent One"');
    expect(html).toContain("Must change password");
    expect(html).toContain(">Enable<");
    expect(html).not.toMatch(/temporaryPassword|password_hash|scrypt\$/);
    expect(html).not.toContain("<dialog open");
  });

  it("audit log: localised actions, names instead of ids, secret-free details, localised limit links", () => {
    const t = messagesFor("hi", "portal").admin.audit;
    const roles = messagesFor("hi", "auth").roles;
    const users = new Map([
      ["a1", { displayName: "Office Admin", loginId: "office.admin" }],
      ["s1", { displayName: "Learner One", loginId: "learner.one" }],
    ]);
    expect(auditActionLabel("admin.user_create", t)).toBe(t.actions.adminUserCreate);
    expect(auditActionLabel("custom.thing", t)).toBe("custom.thing");
    expect(auditDetails({ role: "student", loginId: "learner.one", revokedSessions: 2, studentId: "s1", field: "displayName" }, users, t, roles)).toEqual([
      "खाते का प्रकार: विद्यार्थी",
      "लॉगिन ID: learner.one",
      "साइन आउट किए गए सत्र: 2",
      "विद्यार्थी: Learner One (learner.one)",
      t.details.displayNameChanged,
    ]);
    const html = renderToStaticMarkup(
      createElement(AuditLog, {
        entries: [
          { id: 2, actorId: "a1", action: "admin.password_reset", target: "s1", createdAt: Date.UTC(2026, 9, 20, 6, 0), details: { revokedSessions: 1 } },
          { id: 1, actorId: null, action: "seed.user_create", target: "zz", createdAt: Date.UTC(2026, 9, 20, 5, 0), details: {} },
        ],
        users,
        limit: 100,
        locale: "hi",
        t,
        roles,
      }),
    );
    expect(html).toContain(t.actions.adminPasswordReset);
    expect(html).toContain("Office Admin (office.admin)");
    expect(html).toContain(t.system);
    expect(html).toContain(t.unknownUser);
    expect(html).toContain('href="/hi/admin/audit?limit=200"');
    expect(html).toMatch(/aria-current="true"[^>]*>100</);
    expect(html).toContain('dateTime="2026-10-20T06:00:00.000Z"');
  });

  it("audit limit is one of the allowed sizes", () => {
    expect(AUDIT_LIMITS).toEqual([50, 100, 200]);
    expect(parseAuditLimit("200")).toBe(200);
    expect(parseAuditLimit(["100", "50"])).toBe(100);
    for (const raw of [undefined, "", "7", "1000", "abc", "-50"]) expect(parseAuditLimit(raw)).toBe(50);
  });

  it("demo enquiries table is localised and labelled as fictional", () => {
    const t = messagesFor("hi", "portal").demoTable;
    const html = renderToStaticMarkup(createElement(DemoEnquiriesTable, { t }));
    expect(html).toContain(t.badge);
    expect(html).toContain("नमूना आवेदक A");
    expect(html).not.toContain("Sample applicant");
  });
});

describe("portal chrome", () => {
  it("nav links are localised and the active item ignores the locale prefix", () => {
    const t = messagesFor("hi", "portal");
    const html = renderToStaticMarkup(
      createElement(PortalNavLinks, { area: "admin", locale: "hi", messages: navMessages(t, "admin", messagesFor("hi", "crm")), pathname: "/hi/admin/users" }),
    );
    expect(html).toContain(`aria-label="${t.areas.admin.label} के भाग"`);
    expect(html).toContain('href="/hi/admin/audit"');
    const active = [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>/g)].map((m) => m[0]);
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('href="/hi/admin/users"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('data-surface="dark"');
  });

  it("user menu: signed in → name, role, change password and sign out; signed out → localised sign-in", () => {
    const portal = messagesFor("hi", "portal");
    const auth = messagesFor("hi", "auth");
    const t = { shell: portal.shell, roles: auth.roles, signOut: auth.signOut };
    const signedIn = renderToStaticMarkup(
      createElement(PortalUserMenu, {
        session: { userId: "s1", role: "student", displayName: "Learner One", loginId: "learner.one" },
        area: "student",
        locale: "hi",
        t,
      }),
    );
    expect(signedIn).toContain("Learner One");
    expect(signedIn).toContain(auth.roles.student);
    expect(signedIn).toContain('href="/hi/account/password"');
    expect(signedIn).toContain(auth.signOut.label);
    const signedOut = renderToStaticMarkup(createElement(PortalUserMenu, { session: null, area: "parent", locale: "hi", t }));
    expect(signedOut).toContain(portal.shell.notSignedIn);
    expect(signedOut).toContain('href="/hi/login?next=%2Fparent"');
    expect(signedOut).not.toContain(auth.signOut.label);
  });
});

// ---------------------------------------------------------------------------------------------
// Admin console navigation: the CRM is a "Leads & admissions" group of the admin nav, never a
// dead end. Staff (counsellors / managers) keep the flat CRM nav.

const CRM_PAGES = ["/crm", "/crm/today", "/crm/pipeline", "/crm/reports", "/crm/staff"] as const;
const ADMIN_PAGES = ["/admin", "/admin/enquiries", "/admin/content", "/admin/centres", "/admin/results", "/admin/users", "/admin/audit", "/admin/mcp"] as const;

function adminNav(locale: Locale, path: string): string {
  const portal = messagesFor(locale, "portal");
  const crm = messagesFor(locale, "crm");
  const prefix = locale === "hi" ? "/hi" : "";
  return renderToStaticMarkup(
    createElement(PortalNavLinks, { area: "admin", locale, messages: navMessages(portal, "admin", crm), pathname: `${prefix}${path}` }),
  );
}

/** hrefs of the links marked `aria-current="page"`. */
const currentHrefs = (html: string) => [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>/g)].map((m) => /href="([^"]+)"/.exec(m[0])?.[1]);

/** The CRM nav label of a CRM page path. */
function crmLabel(crm: ReturnType<typeof messagesFor<"crm">>, path: string): string {
  const item = crmNavItems.find((entry) => entry.href === path);
  if (!item) throw new Error(path);
  return crm.nav[item.key as keyof typeof crm.nav];
}

describe.each(["en", "hi"] as const)("admin console navigation (%s)", (locale) => {
  const portal = messagesFor(locale, "portal");
  const crm = messagesFor(locale, "crm");
  const prefix = locale === "hi" ? "/hi" : "";

  function expectBothGroups(html: string) {
    for (const path of [...ADMIN_PAGES, ...CRM_PAGES]) expect(html, path).toContain(`href="${prefix}${path}"`);
    for (const label of Object.values(portal.navGroups)) expect(html).toContain(esc(label));
    for (const label of Object.values(crm.nav)) expect(html).toContain(esc(label));
    expect(html).toContain(esc(portal.areas.admin.sidebarTitle));
    // Group headings label their lists; every aria-labelledby / aria-controls target exists.
    expect(html.match(/<ul aria-labelledby="/g)).toHaveLength(Object.keys(portal.navGroups).length);
    expectLabelledByTargets(html);
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(controls && html.includes(`id="${controls}"`)).toBe(true);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(esc(portal.shell.menu));
  }

  it.each(ADMIN_PAGES)("on %s: admin sections and the Leads & admissions group, one current page", (path) => {
    const html = adminNav(locale, path);
    expectBothGroups(html);
    expect(currentHrefs(html)).toEqual([`${prefix}${path}`]);
  });

  it.each(CRM_PAGES)("on %s: the same admin nav, the CRM page is current and Overview leads back", (path) => {
    const html = adminNav(locale, path);
    expectBothGroups(html);
    expect(currentHrefs(html)).toEqual([`${prefix}${path}`]);
    expect(html).toContain(`href="${prefix}/admin"`);
    // The collapsed mobile menu button names the current page.
    const button = /<button[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1] ?? "";
    expect(button).toContain(esc(crmLabel(crm, path)));
  });

  it("a lead's own page highlights nothing (Inbox matches /crm only)", () => {
    expect(currentHrefs(adminNav(locale, "/crm/leads/abc123"))).toEqual([]);
  });

  it.each([...CRM_PAGES, "/crm/leads/abc123"])("breadcrumb on %s: back to the admin console, then Leads & admissions", (path) => {
    const messages = crmBreadcrumbMessages(portal, crm);
    const html = renderToStaticMarkup(createElement(PortalBreadcrumbLinks, { locale, messages, pathname: `${prefix}${path}` }));
    expect(html).toContain(`aria-label="${esc(portal.shell.breadcrumbLabel)}"`);
    expect(html).toMatch(new RegExp(`<a [^>]*href="${prefix}/admin"[^>]*>.*?${esc(portal.areas.admin.label)}</a>`));
    expect(html).toMatch(new RegExp(`<a [^>]*href="${prefix}/crm"[^>]*>.*?${esc(portal.navGroups.leads)}</a>`));
    const current = path.startsWith("/crm/leads/") ? crm.lead.metaTitle : crmLabel(crm, path);
    expect(html).toMatch(new RegExp(`<span aria-current="page"[^>]*>${esc(current)}</span>`));
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expectLocalisedLinks(html, locale);
  });

  it("staff (counsellor / manager) nav is unchanged: CRM pages only, no admin sections, no groups", () => {
    for (const canManage of [false, true]) {
      const html = renderToStaticMarkup(
        createElement(PortalNavLinks, {
          area: "staff",
          locale,
          messages: staffNavMessages(portal, crm),
          visibleKeys: visibleStaffNavKeys(canManage),
          pathname: `${prefix}/crm/today`,
        }),
      );
      expect(html).not.toContain(`href="${prefix}/admin`);
      expect(html).not.toContain("aria-expanded");
      expect(html).not.toContain("aria-labelledby");
      expect(html).toContain(esc(crm.area.sidebarTitle));
      expect(currentHrefs(html)).toEqual([`${prefix}/crm/today`]);
      expect(html.includes(`href="${prefix}/crm/staff"`)).toBe(canManage);
    }
  });

  it("student and parent navs stay flat strips", () => {
    for (const area of ["student", "parent"] as const) {
      const html = renderToStaticMarkup(
        createElement(PortalNavLinks, { area, locale, messages: navMessages(portal, area, crm), pathname: `${prefix}/${area}` }),
      );
      expect(html).not.toContain("aria-expanded");
      expect(html).not.toContain("/crm");
      expect(currentHrefs(html)).toEqual([`${prefix}/${area}`]);
    }
  });
});

describe("portal nav config", () => {
  it("admin groups cover every admin item once; the CRM items are shared with the staff area", () => {
    const admin = portalAreas.admin;
    expect(admin.groups?.flatMap((group) => group.items)).toEqual(admin.nav);
    expect(new Set(admin.nav.map((item) => item.href)).size).toBe(admin.nav.length);
    expect(admin.groups?.find((group) => group.key === "leads")?.items.slice(0, crmNavItems.length)).toEqual(crmNavItems);
    expect(portalAreas.staff.nav).toBe(crmNavItems);
    expect(portalAreas.staff.groups).toBeUndefined();
  });

  it("exact items match only their own path", () => {
    expect(isActivePortalItem("/crm/today", "/crm", "/admin", true)).toBe(false);
    expect(isActivePortalItem("/crm", "/crm", "/admin", true)).toBe(true);
    expect(isActivePortalItem("/crm/today", "/crm/today", "/admin")).toBe(true);
    expect(isActivePortalItem("/admin/users", "/admin", "/admin")).toBe(false);
  });
});
