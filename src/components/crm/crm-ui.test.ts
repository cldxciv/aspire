import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Client islands call useRouter().refresh(); outside the App Router a stub is enough for static markup.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/crm",
}));

import { PortalNavLinks } from "@/components/portal/PortalNav";
import { staffNavMessages } from "@/components/portal/PortalShell";
import { visibleStaffNavKeys } from "@/components/portal/areas";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { ApiFailure } from "@/lib/auth/client-api";
import {
  crmPermissions,
  type AssignmentRule,
  type CrmStaffMember,
  type CrmViewer,
  type FunnelReport,
  type LeadDetail,
  type LeadPage,
  type LeadSummary,
  type MyTask,
} from "@/lib/crm/types";
import { crmFailureMessage, crmRequests, exportHref } from "./api";
import { CrmPageHeader } from "./CrmBlocks";
import {
  dueStatus,
  EMPTY_FILTERS,
  inboxQuery,
  istDueAt,
  maskPhone,
  parseInboxFilters,
  phoneLast4,
  reportDayRange,
  telHref,
  toLeadCard,
  toolLabel,
  whatsAppHref,
} from "./format";
import { InboxFiltersForm, LeadList } from "./InboxView";
import { activitySummary, LeadDetailView } from "./LeadDetailView";
import { logContactRequest, needsLostReason, noteRequest, stageChangeRequest, taskRequest } from "./lead-forms";
import { PipelineBoard, withStage, type PipelineColumn } from "./PipelineBoard";
import { ReportsView } from "./ReportsView";
import { staffFieldIssue, validateRules, validateStaffForm } from "./StaffManager";
import { StaffPageBody } from "./StaffPageBody";
import { TodayView } from "./TodayView";

// ---------------------------------------------------------------------------------------------
// Helpers + fixtures

const LOCALES: Locale[] = ["en", "hi"];
const NOW = Date.parse("2026-10-20T06:30:00.000Z"); // 12:00 IST
const PHONE = "+916000012345"; // neutral fixture (never the mock-up number)

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

/** Text as renderToStaticMarkup escapes it. */
function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

/** Every <select>, <textarea> and non-hidden <input> has an id with a matching <label for>, or sits inside a <label>. */
function expectLabelledControls(html: string) {
  const controls = [...html.matchAll(/<(select|textarea|input)\b([^>]*)>/g)];
  for (const [, tag, attrs] of controls) {
    if (/type="(hidden|submit)"/.test(attrs)) continue;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (id && html.includes(`for="${id}"`)) continue;
    // Radios / checkboxes wrapped in their own <label>.
    expect(/type="(radio|checkbox)"/.test(attrs), `${tag} ${attrs}`).toBe(true);
  }
}

const viewer = (role: CrmViewer["role"]): CrmViewer => ({ userId: `u-${role}`, displayName: `The ${role}`, role, centreSlugs: [] });

const base: LeadSummary = {
  id: "lead-1",
  stage: "new",
  lostReason: null,
  displayName: "Riya Sharma",
  studentName: "Riya Sharma",
  guardianName: "Anil Sharma",
  phone: PHONE,
  centreSlug: "shimla",
  programInterest: "jee",
  currentClass: "class-11",
  source: "tool",
  tool: "predictor",
  assignee: { userId: "u-counsellor", displayName: "Counsellor One" },
  createdAt: "2026-10-18T05:00:00.000Z",
  updatedAt: "2026-10-19T05:00:00.000Z",
  lastActivityAt: "2026-10-19T05:00:00.000Z",
  nextTaskDueAt: "2026-10-19T04:30:00.000Z",
  overdue: true,
  submissionCount: 2,
  erased: false,
};

const PAGE: LeadPage = {
  items: [base, { ...base, id: "lead-2", displayName: "Kabir", studentName: "Kabir", phone: "+917000067890", tool: null, source: "hero", stage: "contacted", nextTaskDueAt: null, overdue: false, assignee: null }],
  total: 2,
  page: 1,
  pageSize: 25,
};

const DETAIL: LeadDetail = {
  ...base,
  contactName: null,
  email: "family@example.com",
  message: "Please call after 6 pm.",
  page: "/tools/rank-predictor",
  referrer: "https://www.google.com/",
  utm: { source: "google", medium: "cpc", campaign: "jee-2027", term: null, content: null },
  consentTextVersion: "2026-10-20.v2",
  consentAt: "2026-10-18T05:00:00.000Z",
  staffEditedFields: [],
  furthestStage: "new",
  erasedAt: null,
  activities: [
    { id: 1, type: "submission", body: null, meta: { source: "tool", tool: "predictor", toolExam: "jee-main", toolBand: "90-95", locale: "hi", topic: "scholarship", page: "/tools/rank-predictor", reference: "ENQ-1" }, actorId: null, actorName: null, at: "2026-10-18T05:00:00.000Z" },
    { id: 2, type: "assignment", body: null, meta: { from: null, to: "u-counsellor", auto: true }, actorId: null, actorName: null, at: "2026-10-18T05:00:01.000Z" },
    { id: 3, type: "call", body: "Asked for fee details", meta: { outcome: "connected" }, actorId: "u-counsellor", actorName: "Counsellor One", at: "2026-10-19T05:00:00.000Z" },
    { id: 4, type: "stage_change", body: null, meta: { from: "new", to: "contacted" }, actorId: "u-counsellor", actorName: "Counsellor One", at: "2026-10-19T05:01:00.000Z" },
  ],
  tasks: [
    { id: "task-1", leadId: "lead-1", title: "Call back with fees", dueAt: "2026-10-19T04:30:00.000Z", doneAt: null, assignee: { userId: "u-counsellor", displayName: "Counsellor One" }, createdBy: "u-counsellor", createdAt: "2026-10-18T06:00:00.000Z", overdue: true },
    { id: "task-0", leadId: "lead-1", title: "First call", dueAt: "2026-10-18T06:00:00.000Z", doneAt: "2026-10-18T07:00:00.000Z", assignee: null, createdBy: null, createdAt: "2026-10-18T05:30:00.000Z", overdue: false },
  ],
};

const CENTRES = { shimla: "Shimla BCS Head Campus", hamirpur: "Hamirpur" };

// ---------------------------------------------------------------------------------------------

describe("phone masking and contact links (D-041)", () => {
  it("masks all but the last four digits", () => {
    expect(phoneLast4(PHONE)).toBe("2345");
    expect(maskPhone("2345")).toBe("+91 ••••• •2345");
    expect(maskPhone(null)).not.toMatch(/\d/);
    expect(phoneLast4("12")).toBeNull();
  });

  it("labels both spellings of the mock-test tool", () => {
    const t = messagesFor("en", "crm");
    expect(toolLabel(t, "mocktest")).toBe(t.tools.mocktest);
    expect(toolLabel(t, "mock-test")).toBe(t.tools.mocktest);
    expect(toolLabel(t, null)).toBeNull();
  });

  it("builds tel: and wa.me links only from E.164 numbers", () => {
    expect(telHref(PHONE)).toBe("tel:+916000012345");
    expect(whatsAppHref(PHONE)).toBe("https://wa.me/916000012345");
    expect(telHref("60000 12345")).toBeNull();
    expect(whatsAppHref("javascript:alert(1)")).toBeNull();
  });

  it.each(LOCALES)("never renders a full number in the inbox (%s)", (locale) => {
    const t = messagesFor(locale, "crm");
    const html = inLocale(locale, createElement(LeadList, { page: PAGE, filters: EMPTY_FILTERS, ctx: { centres: CENTRES, viewerId: "u-manager", now: NOW, locale, t } }));
    expect(html).not.toContain("6000012345");
    expect(html).not.toContain("60000");
    expect(html).not.toContain("tel:");
    expect(html).toContain("•2345");
    expect(html).toContain(t.common.phoneEnding.replace("{last4}", "2345"));
  });

  it("keeps only the last four digits on pipeline cards", () => {
    const t = messagesFor("en", "crm");
    const card = toLeadCard(base, { t, centres: CENTRES, viewerId: "u-counsellor" });
    expect(card).toMatchObject({ phoneLast4: "2345", assignee: t.common.you, centre: CENTRES.shimla, classProgram: "Class 11 · IIT JEE" });
    expect(JSON.stringify(card)).not.toContain("6000012345");
  });
});

describe("dates and filters", () => {
  it("classifies follow-ups as overdue / today / upcoming in IST", () => {
    expect(dueStatus("2026-10-20T05:00:00.000Z", NOW)).toBe("overdue");
    expect(dueStatus("2026-10-20T15:00:00.000Z", NOW)).toBe("today"); // 20:30 IST
    expect(dueStatus("2026-10-20T19:00:00.000Z", NOW)).toBe("upcoming"); // 00:30 IST next day
    expect(dueStatus(null, NOW)).toBeNull();
  });

  it("turns a typed IST date + time into an ISO instant", () => {
    expect(istDueAt("2026-10-21", "09:30")).toBe("2026-10-21T04:00:00.000Z");
    expect(istDueAt("2026-10-21")).toBe("2026-10-21T04:30:00.000Z");
    expect(istDueAt("21/10/2026")).toBeNull();
  });

  it("round-trips the inbox filters through the URL and drops junk", () => {
    const filters = parseInboxFilters({ q: " riya ", stage: "lost", centre: "shimla", assignee: "unassigned", due: "overdue", page: "3", source: "<x>" });
    expect(filters).toMatchObject({ q: "riya", stage: "lost", centre: "shimla", assignee: "unassigned", due: "overdue", page: 3, source: "" });
    expect(inboxQuery(filters, { page: 1 })).toBe("?q=riya&stage=lost&centre=shimla&assignee=unassigned&due=overdue");
    expect(parseInboxFilters(new URLSearchParams("stage=nope&page=-2"))).toEqual(EMPTY_FILTERS);
    expect(withStage("?centre=shimla", "offer")).toBe("?centre=shimla&stage=offer");
  });

  it("defaults reports to the last 30 IST days and rejects an inverted range", () => {
    const range = reportDayRange(undefined, undefined, NOW);
    expect(range).toMatchObject({ fromDay: "2026-09-21", toDay: "2026-10-20", invalid: false });
    expect(range.toIso).toBe("2026-10-20T18:30:00.000Z");
    expect(reportDayRange("2026-10-10", "2026-10-01", NOW)).toMatchObject({ invalid: true, toDay: "2026-10-20" });
    expect(reportDayRange("2026-10-01", "2026-10-10", NOW)).toMatchObject({ fromIso: "2026-09-30T18:30:00.000Z", invalid: false });
  });
});

describe("requests sent by the islands", () => {
  it("log-contact dialog creates the right request", () => {
    const built = logContactRequest("lead-1", { channel: "whatsapp", outcome: "message_sent", note: "  Sent brochure details  " });
    expect(built).toEqual({
      ok: true,
      request: { path: "/api/crm/leads/lead-1/contacts", method: "POST", body: { channel: "whatsapp", outcome: "message_sent", body: "Sent brochure details" } },
    });
    expect(logContactRequest("lead-1", { channel: "call", outcome: "no_answer" })).toEqual({
      ok: true,
      request: { path: "/api/crm/leads/lead-1/contacts", method: "POST", body: { channel: "call", outcome: "no_answer" } },
    });
    expect(logContactRequest("lead-1", { channel: "call", outcome: "" })).toEqual({ ok: false, issue: "outcomeRequired" });
    // An outcome that doesn't belong to the channel is refused.
    expect(logContactRequest("lead-1", { channel: "whatsapp", outcome: "switched_off" })).toEqual({ ok: false, issue: "outcomeRequired" });
    expect(logContactRequest("lead-1", { channel: "sms", outcome: "message_sent" })).toEqual({ ok: false, issue: "outcomeRequired" });
  });

  it("stage change to lost requires a reason", () => {
    expect(needsLostReason("contacted", "lost")).toBe(true);
    expect(needsLostReason("lost", "lost")).toBe(false);
    expect(stageChangeRequest("lead-1", "lost")).toEqual({ ok: false, issue: "reasonRequired" });
    expect(stageChangeRequest("lead-1", "lost", "made_up")).toEqual({ ok: false, issue: "reasonRequired" });
    expect(stageChangeRequest("lead-1", "lost", "fees")).toEqual({
      ok: true,
      request: { path: "/api/crm/leads/lead-1", method: "PATCH", body: { stage: "lost", lostReason: "fees" } },
    });
    expect(stageChangeRequest("lead-1", "offer")).toEqual({ ok: true, request: { path: "/api/crm/leads/lead-1", method: "PATCH", body: { stage: "offer" } } });
    expect(stageChangeRequest("lead-1", "won")).toEqual({ ok: false, issue: "invalidStage" });
    expect(() => crmRequests.changeStage("lead-1", "lost")).toThrow();
  });

  it("builds note, task, assignment, staff and rules requests", () => {
    expect(noteRequest("a b", "  hello ")).toEqual({ ok: true, request: { path: "/api/crm/leads/a%20b/notes", method: "POST", body: { body: "hello" } } });
    expect(noteRequest("x", "   ")).toEqual({ ok: false, issue: "required" });
    expect(noteRequest("x", "y".repeat(2001))).toEqual({ ok: false, issue: "tooLong" });
    expect(taskRequest("x", { title: "Call", date: "2026-10-21", time: "09:30" })).toEqual({
      ok: true,
      request: { path: "/api/crm/leads/x/tasks", method: "POST", body: { title: "Call", dueAt: "2026-10-21T04:00:00.000Z" } },
    });
    expect(taskRequest("x", { title: " ", date: "2026-10-21" })).toEqual({ ok: false, issue: "titleRequired" });
    expect(taskRequest("x", { title: "Call", date: "" })).toEqual({ ok: false, issue: "dueRequired" });
    expect(crmRequests.completeTask("t1")).toEqual({ path: "/api/crm/tasks/t1", method: "PATCH", body: { done: true } });
    expect(crmRequests.assign("x", null)).toEqual({ path: "/api/crm/leads/x", method: "PATCH", body: { assigneeId: null } });
    expect(crmRequests.createStaff({ displayName: " Meera  Rao ", loginId: " Meera.Rao ", crmRole: "manager", centreSlugs: ["shimla"] })).toEqual({
      path: "/api/admin/users",
      method: "POST",
      body: { role: "staff", displayName: "Meera Rao", loginId: "meera.rao", crm: { crmRole: "manager", centreSlugs: ["shimla"] } },
    });
    expect(crmRequests.updateStaff("u1", { crmRole: "counsellor", centreSlugs: [], active: false })).toEqual({
      path: "/api/crm/staff/u1",
      method: "PUT",
      body: { crmRole: "counsellor", centreSlugs: [], active: false },
    });
    expect(crmRequests.saveRules([{ centreSlug: null, programInterest: "neet", memberIds: ["u1"], active: true }])).toEqual({
      path: "/api/crm/rules",
      method: "PUT",
      body: { rules: [{ centreSlug: null, programInterest: "neet", memberIds: ["u1"], active: true }] },
    });
    expect(exportHref({ from: "2026-09-20T18:30:00.000Z", to: "2026-10-20T18:30:00.000Z" })).toBe(
      "/api/crm/export?createdFrom=2026-09-20T18%3A30%3A00.000Z&createdTo=2026-10-20T18%3A30%3A00.000Z",
    );
  });

  it("validates staff accounts and assignment rules before sending", () => {
    expect(validateStaffForm({ displayName: "", loginId: "" })).toEqual({ displayName: "nameRequired", loginId: "loginIdRequired" });
    expect(validateStaffForm({ displayName: "Meera", loginId: "Bad Id" })).toEqual({ loginId: "invalidLoginId" });
    expect(validateStaffForm({ displayName: "Meera", loginId: "meera.rao" })).toEqual({});
    const rule = { centreSlug: "shimla", programInterest: null, memberIds: ["u1"], active: true };
    expect(validateRules([rule])).toBeNull();
    expect(validateRules([{ ...rule, memberIds: [] }])).toBe("ruleNeedsCounsellor");
    expect(validateRules([{ ...rule, memberIds: [], active: false }])).toBeNull();
    expect(validateRules([rule, { ...rule, memberIds: ["u2"] }])).toBe("ruleDuplicate");
    expect(validateRules(Array.from({ length: 51 }, (_, i) => ({ ...rule, centreSlug: `c${i}` })))).toBe("rulesLimit");
  });
});

describe("localised API failures", () => {
  const failure = (status: number, error: ApiFailure["error"], extra: Partial<ApiFailure> = {}): ApiFailure => ({ ok: false, status, error, known: null, fieldErrors: {}, ...extra });

  it.each(LOCALES)("maps 401 / 403 / 404 / 409 / 422 / 429 (%s)", (locale) => {
    const t = messagesFor(locale, "crm");
    expect(crmFailureMessage(failure(401, "unauthenticated"), t)).toBe(t.errors.sessionExpired);
    expect(crmFailureMessage(failure(403, "forbidden"), t)).toBe(t.errors.forbidden);
    expect(crmFailureMessage(failure(403, "forbidden", { known: "passwordChangeRequired" }), t)).toBe(t.errors.passwordChangeRequired);
    expect(crmFailureMessage(failure(404, "not_found"), t)).toBe(t.errors.notFound);
    expect(crmFailureMessage(failure(409, "bad_request"), t)).toBe(t.errors.conflict);
    expect(crmFailureMessage(failure(422, "validation"), t)).toBe(t.errors.validation);
    expect(crmFailureMessage(failure(429, "rate_limited", { retryAfterSeconds: 120 }), t)).toBe(t.errors.rateLimited.replace("{minutes}", "2"));
    expect(crmFailureMessage(failure(0, "network"), t)).toBe(t.errors.network);
    expect(crmFailureMessage(failure(500, "server_error"), t)).toBe(t.errors.server);
  });

  it("recognises login-id field errors from the admin users API", () => {
    expect(staffFieldIssue(failure(422, "validation", { fieldErrors: { loginId: "loginIdTaken" } }))).toBe("loginIdTaken");
    expect(staffFieldIssue(failure(422, "validation", { known: "invalidLoginId" }))).toBe("invalidLoginId");
    expect(staffFieldIssue(failure(422, "validation"))).toBeNull();
  });
});

describe("staff area navigation", () => {
  it("hides Staff & rules from counsellors", () => {
    expect(visibleStaffNavKeys(false)).toEqual(["inbox", "today", "pipeline", "reports"]);
    expect(visibleStaffNavKeys(true)).toContain("staff");
    expect(crmPermissions({ role: "counsellor" })).toMatchObject({ canViewStaff: false, canExport: false, canAssign: false });
  });

  it.each(LOCALES)("renders localised links with the active item (%s)", (locale) => {
    const portal = messagesFor(locale, "portal");
    const crm = messagesFor(locale, "crm");
    const messages = staffNavMessages(portal, crm);
    const prefix = locale === "hi" ? "/hi" : "";
    const counsellor = inLocale(locale, createElement(PortalNavLinks, { area: "staff", locale, messages, visibleKeys: visibleStaffNavKeys(false), pathname: `${prefix}/crm/pipeline` }));
    expect(counsellor).toContain(`href="${prefix}/crm/today"`);
    expect(counsellor).not.toContain(`href="${prefix}/crm/staff"`);
    expect(counsellor).toMatch(new RegExp(`<a aria-current="page"[^>]*href="${prefix}/crm/pipeline"`));
    expect(count(counsellor, /aria-current="page"/g)).toBe(1);
    expect(counsellor).toContain(crm.area.sidebarTitle);
    const manager = inLocale(locale, createElement(PortalNavLinks, { area: "staff", locale, messages, visibleKeys: visibleStaffNavKeys(true), pathname: `${prefix}/crm` }));
    expect(manager).toContain(`href="${prefix}/crm/staff"`);
    expect(manager).toContain(esc(crm.nav.staff));
  });
});

describe.each(LOCALES)("pages render (%s)", (locale) => {
  const t = messagesFor(locale, "crm");
  const header = (title: string) => createElement(CrmPageHeader, { eyebrow: t.area.label, title });

  it("inbox: one h1, labelled filters, table + cards, empty states", () => {
    const html = inLocale(
      locale,
      createElement("div", null, [
        createElement("div", { key: "h" }, header(t.inbox.title)),
        createElement(InboxFiltersForm, {
          key: "f",
          filters: EMPTY_FILTERS,
          options: { centres: [{ value: "shimla", label: CENTRES.shimla }], programs: [], sources: [], assignees: [{ value: "u2", label: "Asha" }] },
          permissions: crmPermissions({ role: "manager" }),
          locale,
          t,
        }),
        createElement(LeadList, { key: "l", page: PAGE, filters: EMPTY_FILTERS, ctx: { centres: CENTRES, viewerId: "u-manager", now: NOW, locale, t } }),
      ]),
    );
    expect(count(html, /<h1\b/g)).toBe(1);
    expectLabelledControls(html);
    expect(html).toContain('<caption class="sr-only">');
    expect(count(html, /<th scope="col"/g)).toBe(10);
    expect(html).toContain(t.common.overdue);
    expect(html).toContain(t.tools.predictor);
    expect(html).toContain(`href="${locale === "hi" ? "/hi" : ""}/crm/leads/lead-1"`);
    expect(html).toContain('name="assignee"');

    const counsellorFilters = inLocale(
      locale,
      createElement(InboxFiltersForm, { filters: EMPTY_FILTERS, options: { centres: [], programs: [], sources: [], assignees: [] }, permissions: crmPermissions({ role: "counsellor" }), locale, t }),
    );
    expect(counsellorFilters).not.toContain('name="assignee"');

    const empty = inLocale(locale, createElement(LeadList, { page: { ...PAGE, items: [], total: 0 }, filters: EMPTY_FILTERS, ctx: { centres: CENTRES, viewerId: "u", now: NOW, locale, t, counsellor: true } }));
    expect(empty).toContain(t.inbox.emptyTitle);
    expect(empty).toContain(esc(t.inbox.emptyCounsellorBody));
    const noMatch = inLocale(locale, createElement(LeadList, { page: { ...PAGE, items: [], total: 0 }, filters: { ...EMPTY_FILTERS, stage: "offer" }, ctx: { centres: CENTRES, viewerId: "u", now: NOW, locale, t } }));
    expect(noMatch).toContain(t.inbox.noMatchTitle);
  });

  it("lead detail: one h1, contact links, details, newest-first timeline, Phase 2 placeholder", () => {
    const props = {
      lead: DETAIL,
      viewer: viewer("manager"),
      permissions: crmPermissions({ role: "manager" }),
      centres: CENTRES,
      assigneeOptions: [{ value: "u-counsellor", label: "Counsellor One" }],
      staffNames: { "u-counsellor": "Counsellor One" },
      now: NOW,
      locale,
      t,
    };
    const html = inLocale(locale, createElement(LeadDetailView, props));
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Riya Sharma<\/h1>/);
    expectLabelledControls(html);
    expect(html).toContain('href="tel:+916000012345"');
    expect(html).toContain('href="https://wa.me/916000012345"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(esc(t.lead.contact.honest));
    // Every captured field, UTM / page context and consent.
    for (const text of [
      "family@example.com",
      "/tools/rank-predictor",
      "jee-2027",
      "2026-10-20.v2",
      "Please call after 6 pm.",
      CENTRES.shimla,
      // Latest enquiry attribution (CRM-CAPTURE context on the submission activity).
      t.lead.details.latestTitle,
      "jee-main",
      "90-95",
      "हिन्दी",
      t.lead.details.topics.scholarship,
      "ENQ-1",
    ]) {
      expect(html).toContain(text);
    }
    // Timeline newest first: the stage change (id 4) before the submission (id 1).
    expect(html.indexOf(t.lead.timeline.types.stage_change)).toBeLessThan(html.indexOf(t.lead.timeline.types.submission));
    expect(html).toContain(t.lead.timeline.autoAssigned.replace("{name}", "Counsellor One"));
    expect(html).toContain("Asked for fee details");
    // Convert-to-enrolment is a disabled placeholder with its explanation.
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*aria-describedby="crm-convert-note"/);
    expect(html).toContain(t.lead.convert.note);
    // Managers get the assignee selector; stage selector lists every stage.
    expect(html).toContain(t.lead.assignee.none);
    expect(count(html, /<option value="(new|contacted|counselling_booked|visited_or_demo|applied|test_taken|offer|enrolled|lost)"/g)).toBeGreaterThanOrEqual(9);

    const counsellor = inLocale(locale, createElement(LeadDetailView, { ...props, viewer: viewer("counsellor"), permissions: crmPermissions({ role: "counsellor" }), assigneeOptions: [] }));
    expect(counsellor).not.toContain(t.lead.assignee.none);
    expect(counsellor).toContain("Counsellor One");

    const erased = inLocale(locale, createElement(LeadDetailView, { ...props, lead: { ...DETAIL, erased: true, erasedAt: "2026-10-20T00:00:00.000Z", displayName: null, phone: null } }));
    expect(count(erased, /<h1\b/g)).toBe(1);
    expect(erased).toContain(t.common.erased);
    expect(erased).not.toContain("tel:");
    expect(erased).not.toContain(t.lead.notes.submit);
  });

  it("timeline summaries name tasks, stages and outcomes", () => {
    const ctx = { t, locale, viewer: viewer("counsellor"), staffNames: {}, tasks: DETAIL.tasks };
    expect(activitySummary({ id: 9, type: "task_created", body: null, meta: { taskId: "task-1" }, actorId: null, actorName: null, at: DETAIL.createdAt }, ctx)[0]).toBe("Call back with fees");
    expect(activitySummary({ id: 9, type: "stage_change", body: null, meta: { from: "offer", to: "lost", lostReason: "fees" }, actorId: null, actorName: null, at: DETAIL.createdAt }, ctx)).toEqual([
      `${t.stages.offer} → ${t.stages.lost}`,
      t.lead.timeline.lostBecause.replace("{reason}", t.lostReasons.fees),
    ]);
    expect(activitySummary({ id: 9, type: "assignment", body: null, meta: { from: "x", to: "u-counsellor" }, actorId: null, actorName: null, at: DETAIL.createdAt }, ctx)).toEqual([
      t.lead.timeline.assignedTo.replace("{name}", t.common.you),
    ]);
  });

  it("today: one h1, tiles, task lists with done buttons, empty states", () => {
    const task: MyTask = { ...DETAIL.tasks[0], leadDisplayName: "Riya Sharma", leadStage: "contacted", leadPhone: PHONE };
    const html = inLocale(
      locale,
      createElement("div", null, [
        createElement("div", { key: "h" }, header(t.today.title)),
        createElement(TodayView, { key: "v", data: { overdue: [task], dueToday: [], fresh: [base] }, centres: CENTRES, now: NOW, locale, t }),
      ]),
    );
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(html).toContain(t.today.overdueTitle);
    expect(html).toContain(t.today.dueEmpty);
    expect(html).toContain(t.lead.tasks.completeLabel.replace("{title}", "Call back with fees"));
    expect(html).not.toContain("6000012345");
    expect(html).toContain("#crm-lead-contact");

    const empty = inLocale(locale, createElement(TodayView, { data: { overdue: [], dueToday: [], fresh: [] }, centres: CENTRES, now: NOW, locale, t }));
    expect(empty).toContain(t.today.overdueEmpty);
    expect(empty).toContain(t.today.newEmpty);
  });

  it("pipeline: one column per stage with counts and a labelled move control per card", () => {
    const columns: PipelineColumn[] = (["new", "contacted", "lost"] as const).map((stage) => ({
      stage,
      total: stage === "new" ? 30 : 0,
      cards: stage === "new" ? [toLeadCard(base, { t, centres: CENTRES, viewerId: "x" })] : [],
    }));
    const html = inLocale(
      locale,
      createElement("div", null, [
        createElement("div", { key: "h" }, header(t.pipeline.title)),
        createElement(PipelineBoard, { key: "b", columns, inboxQuery: "?centre=shimla", t: { ...t, pipeline: t.pipeline } }),
      ]),
    );
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(count(html, /<h2\b/g)).toBe(3);
    expectLabelledControls(html);
    expect(html).toContain(t.pipeline.moveLabel.replace("{name}", "Riya Sharma"));
    expect(html).toContain(t.pipeline.columnEmpty);
    expect(html).toContain(`/crm?centre=shimla&amp;stage=new`);
    expect(html).not.toContain("6000012345");
  });

  const REPORT: FunnelReport = {
    from: "2026-09-20T18:30:00.000Z",
    to: "2026-10-20T18:30:00.000Z",
    total: 10,
    byStage: { new: 3, contacted: 2, counselling_booked: 1, visited_or_demo: 0, applied: 1, test_taken: 0, offer: 0, enrolled: 2, lost: 1 },
    reached: { new: 10, contacted: 7, counselling_booked: 4, visited_or_demo: 3, applied: 3, test_taken: 2, offer: 2, enrolled: 2 },
    bySource: [{ key: "hero", total: 6, contacted: 4, enrolled: 1, lost: 0 }, { key: "tool", total: 4, contacted: 3, enrolled: 1, lost: 1 }],
    byCentre: [{ key: "shimla", total: 8, contacted: 6, enrolled: 2, lost: 1 }, { key: "none", total: 2, contacted: 1, enrolled: 0, lost: 0 }],
    byProgram: [{ key: "jee", total: 10, contacted: 7, enrolled: 2, lost: 1 }],
    byCounsellor: [{ key: "u1", userId: "u1", displayName: "Asha", total: 7, contacted: 6, enrolled: 2, lost: 1 }, { key: "unassigned", userId: null, displayName: null, total: 3, contacted: 1, enrolled: 0, lost: 0 }],
    lostReasons: [{ key: "fees", count: 1 }],
    conversion: { contactedRate: 0.7, enrolledRate: 0.2 },
  };
  const range = reportDayRange(undefined, undefined, NOW);

  it("reports: one h1, table charts, export only for managers / admins", () => {
    const render = (role: CrmViewer["role"]) =>
      inLocale(
        locale,
        createElement("div", null, [
          createElement("div", { key: "h" }, header(t.reports.title)),
          createElement(ReportsView, { key: "r", report: REPORT, range, permissions: crmPermissions({ role }), centres: CENTRES, locale, t }),
        ]),
      );
    const manager = render("manager");
    expect(count(manager, /<h1\b/g)).toBe(1);
    // funnel, current stage, source, centre, program, counsellor, lost reasons (no per-tool data yet)
    expect(count(manager, /<table\b/g)).toBe(7);
    expect(manager).toContain(t.reports.noCentre);
    expect(manager).toContain(t.reports.unassigned);
    expect(manager).toContain("Asha");
    expect(manager).toContain('href="/api/crm/export?createdFrom=');
    expect(manager).toMatch(/<a[^>]*download/);
    const counsellor = render("counsellor");
    expect(counsellor).not.toContain("/api/crm/export");
    expect(counsellor).toContain(t.reports.exportNotAllowed);
    const empty = inLocale(locale, createElement(ReportsView, { report: { ...REPORT, total: 0 }, range, permissions: crmPermissions({ role: "admin" }), centres: CENTRES, locale, t }));
    expect(empty).toContain(t.reports.empty);
  });

  const STAFF: CrmStaffMember[] = [
    { userId: "u1", displayName: "Asha", loginId: "asha", crmRole: "counsellor", centreSlugs: ["shimla"], active: true, disabled: false, openLeads: 4, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" },
    { userId: "u2", displayName: "Vikram", crmRole: "manager", centreSlugs: [], active: false, disabled: true, openLeads: 0, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" },
  ];
  const RULES: AssignmentRule[] = [{ id: "r1", centreSlug: "shimla", programInterest: "jee", memberIds: ["u1"], active: true }];
  const staffPage = (role: CrmViewer["role"]) =>
    inLocale(
      locale,
      createElement(StaffPageBody, {
        permissions: crmPermissions({ role }),
        staff: role === "counsellor" ? [] : STAFF,
        rules: role === "counsellor" ? [] : RULES,
        centres: [{ value: "shimla", label: CENTRES.shimla }],
        programs: [{ value: "jee", label: t.programs.jee }],
        locale,
        t,
      }),
    );

  it("staff & rules: admin full, manager read-only, counsellor no page", () => {
    const admin = staffPage("admin");
    expect(count(admin, /<h1\b/g)).toBe(1);
    expectLabelledControls(admin);
    expect(admin).toContain(t.staff.createTitle);
    expect(admin).toContain(t.staff.saveRules);
    expect(admin).toContain(t.staff.editLabel.replace("{name}", "Asha"));
    expect(admin).toContain(t.staff.accountDisabled);
    expect(admin).toContain('lang="en"');

    const manager = staffPage("manager");
    expect(count(manager, /<h1\b/g)).toBe(1);
    expect(manager).toContain(t.common.readOnly);
    expect(manager).toContain(t.staff.rulesReadOnly);
    expect(manager).not.toContain(t.staff.createTitle);
    expect(manager).not.toContain(t.staff.saveRules);
    expect(manager).not.toContain("<select");
    expect(manager).toContain("Asha");

    const counsellor = staffPage("counsellor");
    expect(count(counsellor, /<h1\b/g)).toBe(1);
    expect(counsellor).toContain(t.common.notAllowedTitle);
    expect(counsellor).not.toContain(t.staff.listTitle);
    expect(counsellor).not.toContain("Asha");
  });
});

describe("crm messages", () => {
  it("has the same keys and placeholders in English and Hindi, with no empty Hindi strings", () => {
    const en = messagesFor("en", "crm");
    const hi = messagesFor("hi", "crm");
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === "string") {
        expect(typeof b, path).toBe("string");
        expect((b as string).trim().length, path).toBeGreaterThan(0);
        const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        expect(holes(b as string), path).toEqual(holes(a));
        return;
      }
      const ak = Object.keys(a as object).sort();
      expect(Object.keys(b as object).sort(), path).toEqual(ak);
      for (const key of ak) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    };
    walk(en, hi, "crm");
  });
});
