import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Client islands call useRouter(); outside the App Router a stub is enough for static markup.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/crm",
}));

import { ADD_ENQUIRY_HREF, ADD_ENQUIRY_PARAM } from "@/components/portal/areas";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { crmPermissions, type CrmViewer, type FunnelReport, type LeadActivity, type LeadDetail, type LeadPage } from "@/lib/crm/types";
import { AddLeadForm } from "./AddLeadForm";
import { crmRequests } from "./api";
import {
  ADD_LEAD_PARAM,
  bandLabel,
  consentHistory,
  EMPTY_FILTERS,
  needsParentConfirmation,
  parseBackParam,
  reportDayRange,
  toolLabel,
  toolUseSummary,
  withBack,
} from "./format";
import { LeadList } from "./InboxView";
import { activityHeading, activitySummary, LeadDetailView } from "./LeadDetailView";
import { detailValues, editDetailsRequest, EMPTY_MANUAL_LEAD, eraseRequest, manualLeadRequest } from "./lead-forms";
import { ReportsView } from "./ReportsView";

// WP9 (free-tool contact form in the CRM) + admin-console plan §8 Agent B (back, add, edit, erase).

const LOCALES: Locale[] = ["en", "hi"];
const NOW = Date.parse("2026-10-21T06:30:00.000Z"); // 12:00 IST
const GATE = "2026-10-21.gate.v1";

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

/** Every <select>, <textarea> and non-hidden <input> has a <label for> or sits inside a <label>. */
function expectLabelledControls(html: string) {
  for (const [, tag, attrs] of html.matchAll(/<(select|textarea|input)\b([^>]*)>/g)) {
    if (/type="(hidden|submit)"/.test(attrs)) continue;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (id && html.includes(`for="${id}"`)) continue;
    expect(/type="(radio|checkbox)"/.test(attrs), `${tag} ${attrs}`).toBe(true);
  }
}

const activity = (id: number, type: LeadActivity["type"], meta: LeadActivity["meta"], at = "2026-10-21T05:00:00.000Z"): LeadActivity => ({
  id,
  type,
  body: null,
  meta,
  actorId: null,
  actorName: null,
  at,
});

const GATE_SUBMISSION = activity(1, "submission", {
  source: "tool",
  tool: "predictor",
  toolExam: "jee-main",
  toolBand: "score-180-189",
  consentTextVersion: GATE,
  consentLocale: "en",
  consentText: "The gate consent sentence.",
  submittedBy: "student",
  filled: [],
});
const ENQUIRY = activity(2, "submission", { source: "admissions", consentTextVersion: "2026-10-20.v2", consentLocale: "hi", consentText: "पूछताछ की सहमति।", filled: [] }, "2026-10-18T05:00:00.000Z");
const STAFF_CREATED = activity(3, "created", { source: "walk_in", consentMethod: "in_person" }, "2026-10-19T05:00:00.000Z");
const TOOL_USE = activity(4, "tool_use", { tool: "predictor", key: "jee-main", exam: "jee-main", band: "score-180-189", uses: 3, lastAt: "2026-10-21T06:00:00.000Z" }, "2026-10-21T06:00:00.000Z");
const RANCHO = activity(5, "tool_use", { tool: "ask", key: "rancho", exam: "jee-main", band: "score-1-2", uses: 1 }, "2026-10-20T06:00:00.000Z");
const MOCK = activity(6, "tool_use", { tool: "mock-test", key: "jee-mock-1", testId: "jee-mock-1", exam: "jee-main", scoreBand: "pct-40-49", uses: 2 }, "2026-10-20T06:00:00.000Z");
const WITHDRAWN = activity(7, "consent_withdrawn", { via: "lead_gate", browsersForgotten: 2 }, "2026-10-21T06:10:00.000Z");

const DETAIL: LeadDetail = {
  id: "lead-9",
  stage: "new",
  lostReason: null,
  displayName: "Meera Gate",
  studentName: "Meera Gate",
  guardianName: null,
  phone: "+916000098765",
  centreSlug: null,
  programInterest: null,
  currentClass: "class-11",
  source: "tool",
  tool: "predictor",
  assignee: null,
  createdAt: "2026-10-21T05:00:00.000Z",
  updatedAt: "2026-10-21T05:00:00.000Z",
  lastActivityAt: "2026-10-21T05:00:00.000Z",
  nextTaskDueAt: null,
  overdue: false,
  submissionCount: 1,
  erased: false,
  contactName: null,
  email: null,
  message: null,
  page: "/tools/predictor",
  referrer: null,
  utm: { source: null, medium: null, campaign: null, term: null, content: null },
  consentTextVersion: GATE,
  consentAt: "2026-10-21T05:00:00.000Z",
  staffEditedFields: [],
  furthestStage: "new",
  erasedAt: null,
  activities: [TOOL_USE, GATE_SUBMISSION],
  tasks: [],
};

const viewer = (role: CrmViewer["role"]): CrmViewer => ({ userId: `u-${role}`, displayName: `The ${role}`, role, centreSlugs: [] });

// ---------------------------------------------------------------------------------------------

describe("Back returns where you came from (allow-listed)", () => {
  it("accepts only the CRM list pages and rebuilds their query", () => {
    expect(parseBackParam("/crm")).toEqual({ path: "/crm", kind: "inbox" });
    expect(parseBackParam("/crm?stage=new&page=2&junk=1")).toEqual({ path: "/crm?stage=new&page=2", kind: "inbox" });
    expect(parseBackParam("/crm?q=riya")).toEqual({ path: "/crm?q=riya", kind: "search" });
    expect(parseBackParam(["/crm/today", "/admin"])).toEqual({ path: "/crm/today", kind: "today" });
    expect(parseBackParam("/crm/today?x=1")).toEqual({ path: "/crm/today", kind: "today" });
    expect(parseBackParam("/crm/pipeline?centre=shimla&stage=lost&due=today")).toEqual({ path: "/crm/pipeline?centre=shimla", kind: "pipeline" });
    for (const bad of ["https://evil.example/crm", "//evil.example", "/crm/leads/x", "/crm/staff", "/admin", "/hi/crm", "crm", "", null, 42, "/crm/reports", `/crm?q=${"x".repeat(700)}`]) {
      expect(parseBackParam(bad), String(bad)).toBeNull();
    }
  });

  it("opens the add-enquiry drawer from the console top bar's link", () => {
    expect(ADD_LEAD_PARAM).toBe(ADD_ENQUIRY_PARAM);
    expect(new URLSearchParams(ADD_ENQUIRY_HREF.split("?")[1]).get(ADD_LEAD_PARAM)).toBe("1");
  });

  it("carries the list on lead links (not for the plain inbox)", () => {
    expect(withBack("/crm/leads/a", "/crm")).toBe("/crm/leads/a");
    expect(withBack("/crm/leads/a", null)).toBe("/crm/leads/a");
    expect(withBack("/hi/crm/leads/a", "/crm?stage=new&q=riya")).toBe("/hi/crm/leads/a?back=%2Fcrm%3Fstage%3Dnew%26q%3Driya");
    const back = new URLSearchParams(withBack("/crm/leads/a", "/crm/pipeline?centre=shimla").split("?")[1]).get("back");
    expect(parseBackParam(back)).toEqual({ path: "/crm/pipeline?centre=shimla", kind: "pipeline" });
  });
});

describe.each(LOCALES)("free-tool facts for staff (%s)", (locale) => {
  const t = messagesFor(locale, "crm");

  it("labels Rancho and reads bands without exposing anything raw", () => {
    expect(toolLabel(t, "ask")).toBe(t.tools.ask);
    expect(messagesFor("en", "crm").tools.ask).toBe("Rancho");
    expect(bandLabel(t, "score-180-189")).toBe(t.lead.toolUse.scoreBand.replace("{from}", "180").replace("{to}", "189"));
    expect(bandLabel(t, "percentile-90-95")).toBe(t.lead.toolUse.percentileBand.replace("{from}", "90").replace("{to}", "95"));
    expect(bandLabel(t, "pct-40-49")).toBe(t.lead.toolUse.percentBand.replace("{from}", "40").replace("{to}", "49"));
    expect(bandLabel(t, "pct-below-0")).toBe(t.lead.toolUse.belowZero);
    expect(bandLabel(t, "<script>")).toBeNull();
  });

  it("summarises each tool use in one line", () => {
    expect(toolUseSummary(t, TOOL_USE.meta, TOOL_USE.at, NOW)).toBe(
      [t.tools.predictor, t.exams["jee-main"], bandLabel(t, "score-180-189"), t.lead.toolUse.usesToday.replace("{count}", "3")].join(" · "),
    );
    // Rancho: only that it was used (never a subject, exam or band, even if one slipped in).
    expect(toolUseSummary(t, RANCHO.meta, RANCHO.at, NOW)).toBe(t.tools.ask);
    expect(toolUseSummary(t, MOCK.meta, MOCK.at, NOW)).toBe(
      [t.tools.mocktest, t.exams["jee-main"], t.lead.toolUse.test.replace("{id}", "jee-mock-1"), bandLabel(t, "pct-40-49"), t.lead.toolUse.usesThatDay.replace("{count}", "2")].join(" · "),
    );
    expect(toolUseSummary(t, { tool: "planner", key: "neet", exam: "neet", uses: 1 }, null, NOW)).toBe(`${t.tools.planner} · ${t.exams.neet}`);
    const ctx = { t, locale, viewer: viewer("counsellor"), staffNames: {}, tasks: [], now: NOW };
    expect(activityHeading(t, TOOL_USE)).toBe(t.lead.timeline.types.tool_use);
    expect(activityHeading(t, GATE_SUBMISSION)).toBe(t.lead.timeline.gateSubmission);
    expect(activityHeading(t, ENQUIRY)).toBe(t.lead.timeline.types.submission);
    expect(activityHeading(t, WITHDRAWN)).toBe(t.lead.timeline.types.consent_withdrawn);
    expect(activitySummary(WITHDRAWN, ctx)).toEqual([t.lead.timeline.browsersForgotten.replace("{count}", "2")]);
    expect(activitySummary(GATE_SUBMISSION, ctx)).toContain(`${t.lead.details.submittedBy}: ${t.lead.gate.submittedBy.student}`);
    expect(activitySummary(activity(8, "submission", { source: "tool", consentTextVersion: GATE, onLostLead: true }), ctx)).toContain(t.lead.gate.onLostLead);
    expect(activitySummary(STAFF_CREATED, ctx)).toContain(`${t.lead.details.consentMethod}: ${t.add.consentMethods.in_person}`);
    // A submission band in an unvetted shape is left out, never shown raw.
    expect(activitySummary(activity(12, "submission", { source: "tool", tool: "predictor", toolExam: "jee-main", toolBand: "90-95" }), ctx).join(" ")).not.toContain("90-95");
    expect(activitySummary(activity(9, "erase", { reason: "family_request" }), ctx)).toEqual([
      t.lead.timeline.reason.replace("{reason}", t.lead.erase.reasons.family_request),
    ]);
  });
});

describe("consent list and the parent flag", () => {
  it("lists every consent newest first with its kind", () => {
    const list = consentHistory([ENQUIRY, GATE_SUBMISSION, STAFF_CREATED, WITHDRAWN, TOOL_USE]);
    expect(list.map((entry) => entry.kind)).toEqual(["withdrawn", "gate", "staff", "enquiry"]);
    expect(list[1]).toMatchObject({ version: GATE, locale: "en", text: "The gate consent sentence.", submittedBy: "student" });
    expect(list[2]).toMatchObject({ method: "in_person", version: null });
    expect(list[3]).toMatchObject({ version: "2026-10-20.v2", locale: "hi" });
  });

  it("lists Meta lead-form and imported-list consents as their own kinds (lead routing §14.2)", () => {
    const list = consentHistory([
      activity(20, "submission", { source: "meta_lead_ad", consentTextVersion: "meta:1234567:cb", consentMethod: "meta_lead_form" }),
      activity(21, "submission", { source: "csv_import", consentTextVersion: "staff-recorded", consentMethod: "written" }),
      ENQUIRY,
    ]);
    expect(list.map((entry) => entry.kind).sort()).toEqual(["enquiry", "import", "meta"]);
    expect(list.find((entry) => entry.kind === "meta")).toMatchObject({ method: "meta_lead_form", version: "meta:1234567:cb" });
    expect(list.find((entry) => entry.kind === "import")).toMatchObject({ method: "written" });
    expect(list.find((entry) => entry.kind === "enquiry")?.method).toBeNull();
  });

  it("flags a lead whose free-tool form only a student filled in", () => {
    expect(needsParentConfirmation([GATE_SUBMISSION])).toBe(true);
    expect(needsParentConfirmation([GATE_SUBMISSION, activity(10, "submission", { submittedBy: "parent", consentTextVersion: GATE })])).toBe(false);
    expect(needsParentConfirmation([ENQUIRY, STAFF_CREATED])).toBe(false);
  });
});

describe("Add enquiry, Edit details and Erase requests", () => {
  const valid = { ...EMPTY_MANUAL_LEAD, studentName: "  Asha   Rao ", phone: "98765 43210", consentMethod: "phone", consent: true, centreSlug: "shimla", note: " Wants JEE " };

  it("checks the add form like the server and reports a duplicate first", () => {
    const empty = manualLeadRequest(EMPTY_MANUAL_LEAD);
    expect(empty).toEqual({ ok: false, issues: { name: "required", phone: "required", consentMethod: "required", consent: "required" } });
    expect(manualLeadRequest({ ...valid, phone: "12345" })).toMatchObject({ ok: false, issues: { phone: "invalid" } });
    expect(manualLeadRequest({ ...valid, guardianName: "A" })).toMatchObject({ ok: false, issues: { name: "invalid" } });
    expect(manualLeadRequest({ ...valid, email: "not-an-email" })).toMatchObject({ ok: false, issues: { email: "invalid" } });
    expect(manualLeadRequest({ ...valid, source: "hero" })).toMatchObject({ ok: false, issues: { source: "required" } });
    expect(manualLeadRequest(valid)).toEqual({
      ok: true,
      request: {
        path: "/api/crm/leads",
        method: "POST",
        body: { source: "walk_in", phone: "98765 43210", consent: true, consentMethod: "phone", onDuplicate: "report", studentName: "Asha Rao", centreSlug: "shimla", note: "Wants JEE" },
      },
    });
    const append = manualLeadRequest(valid, "append");
    expect(append.ok && (append.request.body as { onDuplicate: string }).onDuplicate).toBe("append");
  });

  it("sends only the details that changed, and clears emptied ones", () => {
    const initial = detailValues({ studentName: "Meera", guardianName: null, email: "a@b.co", centreSlug: "shimla" });
    expect(editDetailsRequest("l1", initial, initial)).toEqual({ ok: false, nothing: true });
    expect(editDetailsRequest("l1", initial, { ...initial, guardianName: "  Ravi  Kumar ", email: "", centreSlug: "hamirpur" })).toEqual({
      ok: true,
      changed: ["guardianName", "email", "centreSlug"],
      request: { path: "/api/crm/leads/l1", method: "PATCH", body: { fields: { guardianName: "Ravi Kumar", email: null, centreSlug: "hamirpur" } } },
    });
    expect(editDetailsRequest("l1", initial, { ...initial, email: "nope", studentName: "M" })).toEqual({ ok: false, issues: { studentName: "invalid", email: "invalid" } });
  });

  it("needs a reason and the exact word to erase", () => {
    expect(eraseRequest("l1", { typed: "ERASE", word: "ERASE", reason: "" })).toEqual({ ok: false, issue: "reasonRequired" });
    expect(eraseRequest("l1", { typed: "erase", word: "ERASE", reason: "family_request" })).toEqual({ ok: false, issue: "wordMismatch" });
    expect(eraseRequest("l1", { typed: " ERASE ", word: "ERASE", reason: "family_request" })).toEqual({
      ok: true,
      request: { path: "/api/crm/leads/l1/erase", method: "POST", body: { confirm: true, reason: "family_request" } },
    });
    expect(crmRequests.updateDetails("a/b", { email: null }).path).toBe("/api/crm/leads/a%2Fb");
  });
});

describe.each(LOCALES)("console screens render (%s)", (locale) => {
  const t = messagesFor(locale, "crm");
  const prefix = locale === "hi" ? "/hi" : "";
  const options = { classes: [{ value: "class-11", label: t.classes["class-11"] }], programs: [{ value: "jee", label: t.programs.jee }], centres: [{ value: "shimla", label: "Shimla" }] };
  const props = {
    lead: { ...DETAIL, activities: [WITHDRAWN, TOOL_USE, STAFF_CREATED, GATE_SUBMISSION, ENQUIRY] },
    viewer: viewer("admin"),
    permissions: crmPermissions({ role: "admin" }),
    centres: { shimla: "Shimla" },
    assigneeOptions: [],
    staffNames: {},
    back: parseBackParam("/crm?q=meera") ?? undefined,
    detailOptions: options,
    now: NOW,
    locale,
    t,
  };

  it("lead page: back to the search, parent flag, consents, tool use, edit and (admin) erase", () => {
    const html = inLocale(locale, createElement(LeadDetailView, props));
    expect(count(html, /<h1\b/g)).toBe(1);
    expectLabelledControls(html);
    expect(html).toContain(`href="${prefix}/crm?q=meera"`);
    expect(html).toContain(esc(t.lead.backTo.search));
    expect(html).toContain(esc(t.lead.parentFlag.title));
    expect(html).toContain(esc(t.lead.details.consentHistory));
    for (const kind of ["gate", "enquiry", "staff", "withdrawn"] as const) expect(html).toContain(esc(t.lead.details.consentKinds[kind]));
    expect(html).toContain("The gate consent sentence.");
    expect(html).toContain(esc(t.add.consentMethods.in_person));
    expect(html).toContain(esc(t.lead.timeline.gateSubmission));
    expect(html).toContain(esc(toolUseSummary(t, TOOL_USE.meta, TOOL_USE.at, NOW)));
    expect(html).toContain(esc(t.lead.toolUse.note));
    expect(html).toContain(esc(t.lead.edit.button));
    expect(html).toContain(esc(t.lead.erase.title));
    expect(html).toContain(esc(t.lead.erase.button));
    expect(html).toContain(esc(t.sources.tool));
    expect(html).toContain(esc(t.exams["jee-main"]));

    const manager = inLocale(locale, createElement(LeadDetailView, { ...props, viewer: viewer("manager"), permissions: crmPermissions({ role: "manager" }), back: undefined }));
    expect(manager).not.toContain(esc(t.lead.erase.button));
    expect(manager).toContain(esc(t.lead.edit.button));
    expect(manager).toContain(esc(t.lead.backTo.inbox));
    expect(manager).toContain(`href="${prefix}/crm"`);

    const parentToo = inLocale(locale, createElement(LeadDetailView, { ...props, lead: { ...props.lead, activities: [...props.lead.activities, activity(11, "submission", { submittedBy: "parent", consentTextVersion: GATE })] } }));
    expect(parentToo).not.toContain(esc(t.lead.parentFlag.title));

    const erased = inLocale(locale, createElement(LeadDetailView, { ...props, lead: { ...props.lead, erased: true, erasedAt: "2026-10-21T07:00:00.000Z", displayName: null, phone: null } }));
    expect(erased).not.toContain(esc(t.lead.edit.button));
    expect(erased).not.toContain(esc(t.lead.erase.button));
    expect(erased).not.toContain(esc(t.lead.parentFlag.title));
    // The erased notice can take focus (it does once, right after this tab erased the lead).
    expect(erased).toMatch(/<div tabindex="-1"[^>]*><div role="note"/);

    const oddBand = inLocale(locale, createElement(LeadDetailView, { ...props, lead: { ...props.lead, activities: [activity(13, "submission", { source: "tool", tool: "predictor", toolBand: "90-95", consentTextVersion: GATE })] } }));
    expect(oddBand).not.toContain("90-95");
  });

  it("add-enquiry drawer: a button, and the full labelled form when opened by ?add=1", () => {
    const shared = { sources: (["walk_in", "phone_call", "referral", "other"] as const).map((value) => ({ value, label: t.sources[value] })), options, t: { add: t.add, common: t.common, errors: t.errors } };
    const closed = inLocale(locale, createElement(AddLeadForm, { ...shared, openSignal: null }));
    expect(closed).toContain(esc(t.add.button));
    expect(closed).not.toContain("<form");
    const open = inLocale(locale, createElement(AddLeadForm, { ...shared, openSignal: NOW }));
    expect(count(open, /<form\b/g)).toBe(1);
    expectLabelledControls(open);
    expect(count(open, /<fieldset\b/g)).toBe(2);
    expect(count(open, /type="radio"/g)).toBe(8);
    expect(open).toMatch(/type="checkbox"(?![^>]*checked)/);
    expect(open).toContain(esc(t.add.consent));
    expect(open).toContain('type="tel"');
    for (const method of ["in_person", "phone", "written", "message"] as const) expect(open).toContain(esc(t.add.consentMethods[method]));
    // Both name inputs point at the "at least one of the two names" hint.
    expect(count(open, /aria-describedby="[^"]*-name-hint"/g)).toBe(2);
  });

  it("inbox rows carry the list they were opened from", () => {
    const page: LeadPage = { items: [{ ...DETAIL, phone: "+91 ••••• •8765" }], total: 1, page: 1, pageSize: 25 };
    const html = inLocale(locale, createElement(LeadList, { page, filters: { ...EMPTY_FILTERS, stage: "new" }, ctx: { centres: {}, viewerId: "u", now: NOW, locale, t, back: "/crm?stage=new" } }));
    expect(html).toContain(`href="${prefix}/crm/leads/lead-9?back=%2Fcrm%3Fstage%3Dnew"`);
    expect(html).toContain(esc(t.sources.tool));
  });

  it("reports: free-tool contact forms per day with totals", () => {
    const report: FunnelReport = {
      from: "2026-09-21T18:30:00.000Z",
      to: "2026-10-21T18:30:00.000Z",
      total: 0,
      byStage: { new: 0, contacted: 0, counselling_booked: 0, visited_or_demo: 0, applied: 0, test_taken: 0, offer: 0, enrolled: 0, lost: 0 },
      reached: { new: 0, contacted: 0, counselling_booked: 0, visited_or_demo: 0, applied: 0, test_taken: 0, offer: 0, enrolled: 0 },
      bySource: [],
      byCentre: [],
      byProgram: [],
      byCounsellor: [],
      lostReasons: [],
      conversion: { contactedRate: 0, enrolledRate: 0 },
      gateDaily: [
        { day: "2026-10-21", newFamilies: 4, knownFamilies: 1 },
        { day: "2026-10-20", newFamilies: 2, knownFamilies: 0 },
      ],
    };
    const range = reportDayRange(undefined, undefined, NOW);
    const html = inLocale(locale, createElement(ReportsView, { report, range, permissions: crmPermissions({ role: "admin" }), centres: {}, locale, t }));
    expect(html).toContain(esc(t.reports.gateTitle));
    expect(count(html, /<table\b/g)).toBe(1);
    expect(html).toContain('dateTime="2026-10-21"');
    expect(html).toContain(esc(t.reports.gateTotal));
    expect(html).toMatch(/<tfoot[\s\S]*>7<[\s\S]*>6<[\s\S]*>1<[\s\S]*<\/tfoot>/);
    const none = inLocale(locale, createElement(ReportsView, { report: { ...report, gateDaily: [] }, range, permissions: crmPermissions({ role: "admin" }), centres: {}, locale, t }));
    expect(none).toContain(esc(t.reports.gateEmpty));
    expect(html).not.toContain(esc(t.reports.gateTruncated.split("{")[0]));
    const longRange = Array.from({ length: 95 }, (_, i) => ({ day: new Date(Date.UTC(2026, 9, 21) - i * 86_400_000).toISOString().slice(0, 10), newFamilies: 1, knownFamilies: 0 }));
    const long = inLocale(locale, createElement(ReportsView, { report: { ...report, gateDaily: longRange }, range, permissions: crmPermissions({ role: "admin" }), centres: {}, locale, t }));
    expect(count(long, /<th scope="row"/g)).toBe(92 + 1);
    expect(long).toMatch(/<tfoot[\s\S]*>95<[\s\S]*<\/tfoot>/);
    expect(long).toContain(esc(t.reports.gateTruncated.split("{")[0]));
  });
});
