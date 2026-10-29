import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Client islands call useRouter().refresh(); outside the App Router a stub is enough for static markup.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/crm",
}));

import { CallReturnPrompt } from "@/components/crm/CallReturnPrompt";
import { CompleteTaskButton, ContactActions, type LeadIslandMessages } from "@/components/crm/LeadActions";
import { TodayView } from "@/components/crm/TodayView";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import consoleCallsEn from "@/i18n/messages/en/console-calls";
import consoleCallsHi from "@/i18n/messages/hi/console-calls";
import { DEFAULT_CALLING_HOURS } from "@/lib/crm/lead-ops-types";
import type { FollowUpContextView } from "@/lib/crm/console/followup/types";
import type { WaTemplate } from "@/lib/crm/console/types";
import type { MyTask } from "@/lib/crm/types";
import { callsRequests } from "./api";
import { CallOutcomeDialog, CallOutcomeForm } from "./CallOutcomeDialog";
import { callsMessages } from "./messages";
import { NextFollowUpPicker } from "./NextFollowUpPicker";
import {
  attemptText,
  buildCallOutcome,
  buildWhatsAppSent,
  pickerFromSuggestion,
  pickerIssue,
  pickerOutsideHours,
  pickerToNext,
  savedMessage,
  suggestionFor,
  whatsappDefaultPicker,
  whenLabel,
  type CallFormState,
} from "./outcome-form";
import { clearWaMark, markWaOpened, readWaMark, shouldPromptWaReturn, WA_RETURN_KEY } from "./wa-return";
import { WaReturnPrompt } from "./WaReturnPrompt";
import { ComposeStep, fillInText, SentStep, templatePurpose } from "./WhatsAppComposer";

// 1B-CALLS UI (docs/admin-phase-1b-plan.md §5.C, §5.D): markup in both languages, the pure form
// logic, the WhatsApp confirm-on-return mark and the honesty rule (the system never sends).

const LOCALES: Locale[] = ["en", "hi"];
const IST = (5 * 60 + 30) * 60_000;
const ist = (day: string, time: string) => Date.parse(`${day}T${time}:00.000Z`) - IST;
const NOW = ist("2026-10-21", "11:30"); // Wednesday
const iso = (ms: number) => new Date(ms).toISOString();

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
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (id && html.includes(`for="${id}"`)) continue;
    expect(/type="(radio|checkbox)"/.test(attrs), `${tag} ${attrs}`).toBe(true);
  }
}

function context(overrides: Partial<FollowUpContextView> = {}): FollowUpContextView {
  return {
    leadId: "lead-1",
    now: iso(NOW),
    presets: { later_today: iso(ist("2026-10-21", "13:30")), tomorrow: iso(ist("2026-10-22", "10:00")), in_3_days: iso(ist("2026-10-24", "10:00")) },
    suggested: { next: { kind: "preset", preset: "later_today" }, ruleKey: "retry" },
    attempts: { calls: 3, unansweredStreak: 2, suggestNotReachable: false },
    openTask: null,
    openTaskCount: 0,
    outsideCallingHoursNow: false,
    callingHoursLabel: "09:00–19:00",
    stage: "new",
    templateSlots: { parent_name: "Anil Sharma", student_first_name: "Riya", counsellor_name: "Counsellor One", centre: "Shimla BCS Head Campus" },
    defaultLang: "en",
    callingHours: DEFAULT_CALLING_HOURS,
    rhythm: { firstConnectedAt: null, visitedAt: null, contactsSinceVisit: 0, preferredTime: null },
    slotsByLang: {
      en: { parent_name: "Anil Sharma", student_first_name: "Riya", counsellor_name: "Counsellor One", centre: "Shimla BCS Head Campus" },
      hi: { parent_name: "Anil Sharma", student_first_name: "Riya", counsellor_name: "Counsellor One", centre: "शिमला BCS मुख्य परिसर" },
      hinglish: { parent_name: "Anil Sharma", student_first_name: "Riya", counsellor_name: "Counsellor One", centre: "Shimla BCS Head Campus" },
    },
    completingTask: null,
    ...overrides,
  };
}

const island = (locale: Locale): LeadIslandMessages => {
  const t = messagesFor(locale, "crm");
  return { common: t.common, errors: t.errors, stages: t.stages, lostReasons: t.lostReasons, lead: t.lead };
};

const noop = () => {};
const form = (overrides: Partial<CallFormState>): CallFormState => ({
  outcome: null,
  note: "",
  picker: { choice: null, date: "", time: "" },
  markWrongNumber: true,
  markNotReachable: false,
  ...overrides,
});

// ---------------------------------------------------------------------------------------------

function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key));
  return [];
}

describe("console-calls messages", () => {
  it("English and Hindi have the same keys and placeholders", () => {
    const en = strings(consoleCallsEn);
    const hi = new Map(strings(consoleCallsHi));
    expect([...hi.keys()].sort()).toEqual(en.map(([key]) => key).sort());
    for (const [key, text] of en) {
      const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(placeholders(hi.get(key) ?? ""), key).toEqual(placeholders(text));
    }
  });

  it("never says the system sent or delivered a message (D-041)", () => {
    for (const [key, text] of strings(consoleCallsEn)) {
      expect(text, key).not.toMatch(/deliver/i);
      expect(text, key).not.toMatch(/\b(aspire|the system|we)\s+(has\s+|have\s+)?sent\b/i);
      expect(text, key).not.toMatch(/sent (by|from) (aspire|the system)/i);
    }
    for (const [key, text] of strings(consoleCallsHi)) {
      expect(text, key).not.toMatch(/डिलीवर/);
      expect(text, key).not.toMatch(/सिस्टम ने/);
    }
    // The one place that names the system says it sends nothing.
    expect(consoleCallsEn.whatsapp.intro).toContain("Aspire's system sends nothing");
    expect(consoleCallsHi.whatsapp.intro).toContain("Aspire का सिस्टम कुछ नहीं भेजता");
  });
});

describe("requests (pure builders)", () => {
  it("builds the outcome and template requests", () => {
    expect(callsRequests.outcomeContext("lead-1")).toEqual({ path: "/api/crm/leads/lead-1/outcome", method: "GET" });
    expect(callsRequests.outcomeContext("lead-1", "task-9")).toEqual({ path: "/api/crm/leads/lead-1/outcome?taskId=task-9", method: "GET" });
    const input = { contact: null, taskId: "task-9", next: { kind: "preset", preset: "tomorrow" } } as const;
    expect(callsRequests.recordOutcome("lead-1", input)).toEqual({ path: "/api/crm/leads/lead-1/outcome", method: "POST", body: input });
    expect(callsRequests.approvedTemplates()).toEqual({ path: "/api/crm/templates?context=general", method: "GET" });
    expect(callsRequests.allTemplates()).toEqual({ path: "/api/crm/templates?all=1", method: "GET" });
    expect(callsRequests.editTemplate("missed_call", { lang: "hi", body: "x", expectedVersion: 3 })).toEqual({
      path: "/api/crm/templates/missed_call",
      method: "PUT",
      body: { lang: "hi", body: "x", expectedVersion: 3 },
    });
    expect(callsRequests.templateStatus("missed_call", { status: "approved", expectedVersion: 1 })).toEqual({
      path: "/api/crm/templates/missed_call/status",
      method: "POST",
      body: { status: "approved", expectedVersion: 1 },
    });
    expect(callsRequests.saveProspectusLink({ prospectusUrl: null, expectedVersion: 2 })).toEqual({ path: "/api/crm/templates/links", method: "PUT", body: { prospectusUrl: null, expectedVersion: 2 } });
  });
});

describe("call outcome form logic (§5.C)", () => {
  const ctx = context();

  it("needs an outcome and a next follow-up; 'no call needed' only from a task", () => {
    expect(buildCallOutcome(form({}), ctx, null)).toEqual({ ok: false, issue: "outcomeRequired" });
    expect(buildCallOutcome(form({ outcome: "no_call" }), ctx, null)).toEqual({ ok: false, issue: "outcomeRequired" });
    expect(buildCallOutcome(form({ outcome: "no_answer" }), ctx, null)).toEqual({ ok: false, issue: "nextRequired" });
    expect(buildCallOutcome(form({ outcome: "no_answer", note: "x".repeat(2001), picker: { choice: "tomorrow", date: "", time: "" } }), ctx, null)).toEqual({ ok: false, issue: "noteTooLong" });
    expect(buildCallOutcome(form({ outcome: "no_answer", note: "  Rang twice ", picker: { choice: "later_today", date: "", time: "" } }), ctx, null)).toEqual({
      ok: true,
      input: { contact: { channel: "call", outcome: "no_answer", note: "Rang twice" }, taskId: null, next: { kind: "preset", preset: "later_today" } },
    });
    expect(buildCallOutcome(form({ outcome: "no_call", picker: { choice: "tomorrow", date: "", time: "" } }), ctx, "task-9")).toEqual({
      ok: true,
      input: { contact: null, taskId: "task-9", next: { kind: "preset", preset: "tomorrow" } },
    });
  });

  it("wrong number hides the picker and marks lost; 5 unanswered offers not reachable", () => {
    expect(buildCallOutcome(form({ outcome: "wrong_number" }), ctx, null)).toEqual({
      ok: true,
      input: { contact: { channel: "call", outcome: "wrong_number", note: null }, taskId: null, next: { kind: "none", reason: "wrong_number" }, markLostWrongNumber: true },
    });
    const four = context({ attempts: { calls: 4, unansweredStreak: 4, suggestNotReachable: false } });
    expect(buildCallOutcome(form({ outcome: "busy", markNotReachable: true }), four, "task-9")).toEqual({
      ok: true,
      input: { contact: { channel: "call", outcome: "busy", note: null }, taskId: "task-9", next: { kind: "none", reason: "closing" }, markNotReachable: true },
    });
    // Not offered (streak 2 + 1 < 5): the tick is ignored and a follow-up is required.
    expect(buildCallOutcome(form({ outcome: "busy", markNotReachable: true }), ctx, null)).toEqual({ ok: false, issue: "nextRequired" });
  });

  it("picked times: 08:00–21:00 IST, not in the past; outside calling hours is only a warning; keep = has_other_task", () => {
    const pick = (date: string, time: string) => ({ choice: "pick" as const, date, time });
    expect(pickerIssue(pick("2026-10-22", "21:30"), ctx)).toBe("hardWindow");
    expect(pickerIssue(pick("2026-10-22", "07:30"), ctx)).toBe("hardWindow");
    expect(pickerIssue(pick("2026-10-20", "12:00"), ctx)).toBe("pastTime");
    expect(pickerIssue(pick("", ""), ctx)).toBe("pickRequired");
    expect(pickerIssue(pick("2026-10-22", "20:00"), ctx)).toBeNull();
    expect(pickerOutsideHours(pick("2026-10-22", "20:00"), ctx)).toBe(true);
    expect(pickerOutsideHours(pick("2026-10-22", "12:00"), ctx)).toBe(false);
    expect(pickerToNext(pick("2026-10-22", "20:00"), ctx)).toEqual({ ok: true, next: { kind: "at", at: iso(ist("2026-10-22", "20:00")) } });
    expect(pickerToNext({ choice: "keep", date: "", time: "" }, ctx)).toEqual({ ok: true, next: { kind: "none", reason: "has_other_task" } });
  });

  it("pre-selects the rhythm's suggestion for the chosen outcome", () => {
    expect(pickerFromSuggestion(suggestionFor(ctx, "no_answer"))).toEqual({ choice: "later_today", date: "", time: "" });
    expect(pickerFromSuggestion(suggestionFor(ctx, "switched_off"))).toEqual({ choice: "tomorrow", date: "", time: "" });
    expect(pickerFromSuggestion(suggestionFor(ctx, "call_back_requested"))).toEqual({ choice: "pick", date: "", time: "" });
    expect(pickerFromSuggestion(suggestionFor(ctx, "connected"))).toEqual({ choice: "pick", date: "2026-10-23", time: "10:00" }); // day 2
    expect(whatsappDefaultPicker(ctx).choice).toBe("tomorrow");
    expect(whatsappDefaultPicker(context({ openTask: { id: "t", dueAt: iso(ist("2026-10-23", "11:00")), title: "Call" } })).choice).toBe("keep");
  });

  it("labels times and attempts in both languages; the saved line says what was set", () => {
    const en = callsMessages("en").calls;
    const hi = callsMessages("hi").calls;
    expect(whenLabel(ist("2026-10-21", "16:10"), NOW, "en", en)).toMatch(/^Today 4:10/);
    expect(whenLabel(ist("2026-10-22", "10:00"), NOW, "en", en)).toMatch(/^Tomorrow 10:00/);
    expect(whenLabel(ist("2026-10-22", "10:00"), NOW, "hi", hi)).toMatch(/^कल /);
    expect(whenLabel(ist("2026-10-24", "10:00"), NOW, "en", en)).toMatch(/Sat/);
    expect(attemptText({ calls: 3, unansweredStreak: 3 }, en)).toBe("Attempt 4 · 3 unanswered in a row");
    expect(attemptText({ calls: 0, unansweredStreak: 0 }, en)).toBe("Attempt 1");
    expect(attemptText({ calls: 3, unansweredStreak: 3 }, hi)).toBe("कोशिश 4 · लगातार 3 बार जवाब नहीं");
    const input = { contact: { channel: "call" as const, outcome: "no_answer" as const }, next: { kind: "preset" as const, preset: "later_today" as const } };
    expect(savedMessage(input, { task: { dueAt: iso(ist("2026-10-21", "13:30")) } }, NOW, "en", en)).toMatch(/^Logged\. Next follow-up: Today 1:30/);
    expect(savedMessage({ ...input, markNotReachable: true }, { task: null }, NOW, "en", en)).toBe(en.savedLost);
    expect(savedMessage({ ...input, next: { kind: "none", reason: "has_other_task" } }, { task: null }, NOW, "en", en)).toBe(en.keptExisting);
  });
});

describe.each(LOCALES)("call outcome markup (%s)", (locale) => {
  const c = callsMessages(locale);
  const t = island(locale);

  it("dialog form: heading with the family, attempt line, outcome tiles in the page language, labelled controls", () => {
    const html = inLocale(
      locale,
      createElement(CallOutcomeForm, { titleId: "x-title", ctx: context(), leadName: "Riya Sharma", taskId: null, pending: false, error: null, locale, c, onSubmit: noop, onCancel: noop }),
    );
    expect(html).toContain('id="x-title"');
    expect(html).toContain("Riya Sharma");
    expect(html).toContain(esc(attemptText({ calls: 3, unansweredStreak: 2 }, c.calls)));
    for (const label of Object.values(c.calls.outcomes)) expect(html).toContain(esc(label));
    expect(html).not.toContain(esc(c.calls.noCallNeeded));
    expect(count(html, /type="radio"/g)).toBe(6);
    expect(html).toContain(`<legend class="text-sm font-bold text-navy">${esc(c.calls.whatHappened)}</legend>`);
    expectLabelledControls(html);
    expect(html).not.toContain("wa.me");

    const fromTask = inLocale(
      locale,
      createElement(CallOutcomeForm, { titleId: "y", ctx: context(), leadName: "Riya Sharma", taskId: "task-9", taskTitle: "Call after exams", pending: false, error: null, locale, c, onSubmit: noop, onCancel: noop }),
    );
    expect(fromTask).toContain(esc(c.calls.noCallNeeded));
    expect(fromTask).toContain(esc(c.calls.titleTask));
    expect(fromTask).toContain("Call after exams");
    expect(count(fromTask, /type="radio"/g)).toBe(7);
  });

  it("next follow-up picker: resolved times, the suggestion's reason, keep-existing, warnings and refusals", () => {
    const ctx = context({ openTask: { id: "t2", dueAt: iso(ist("2026-10-23", "11:00")), title: "Visit reminder" } });
    const html = inLocale(
      locale,
      createElement(NextFollowUpPicker, {
        idBase: "p",
        ctx,
        state: { choice: "later_today", date: "", time: "" },
        onChange: noop,
        suggestion: suggestionFor(ctx, "no_answer"),
        showIssue: false,
        locale,
        c: c.calls,
      }),
    );
    for (const label of [c.calls.laterToday, c.calls.tomorrow, c.calls.in3Days, c.calls.pick]) expect(html).toContain(esc(label));
    expect(html).toContain(esc(c.calls.rules.retry));
    expect(html).toContain("Visit reminder");
    expect(html).toMatch(/checked="" value="later_today"/);
    expectLabelledControls(html);

    const outside = inLocale(locale, createElement(NextFollowUpPicker, { idBase: "q", ctx, state: { choice: "pick", date: "2026-10-22", time: "20:00" }, onChange: noop, suggestion: null, showIssue: true, locale, c: c.calls }));
    expect(outside).toContain(esc(c.calls.outsideHours.replace("{hours}", "09:00–19:00")));
    expect(outside).toContain('for="q-date"');
    expect(outside).toContain('for="q-time"');
    const refused = inLocale(locale, createElement(NextFollowUpPicker, { idBase: "r", ctx, state: { choice: "pick", date: "2026-10-22", time: "21:30" }, onChange: noop, suggestion: null, showIssue: false, locale, c: c.calls }));
    expect(refused).toMatch(new RegExp(`role="alert"[^>]*>${esc(c.calls.hardWindow)}`));
    expect(refused).toContain('aria-invalid="true"');
    expect(refused).not.toContain(esc(c.calls.outsideHours.replace("{hours}", "09:00–19:00")));

    // The warning names the CHOSEN day's hours: Sunday 15:00 → Sunday's 10:00–13:00, not today's 09:00–19:00.
    const sunday = inLocale(locale, createElement(NextFollowUpPicker, { idBase: "s", ctx, state: { choice: "pick", date: "2026-10-25", time: "15:00" }, onChange: noop, suggestion: null, showIssue: false, locale, c: c.calls }));
    expect(sunday).toContain(esc(c.calls.outsideHours.replace("{hours}", "10:00–13:00")));
    expect(sunday).not.toContain("09:00–19:00");
    // A closed date says so instead of naming another day's hours.
    const closedCtx = context({ callingHours: { ...DEFAULT_CALLING_HOURS, closedDates: ["2026-10-26"] } });
    const closed = inLocale(locale, createElement(NextFollowUpPicker, { idBase: "x", ctx: closedCtx, state: { choice: "pick", date: "2026-10-26", time: "11:00" }, onChange: noop, suggestion: null, showIssue: false, locale, c: c.calls }));
    expect(closed).toContain(esc(c.calls.outsideHoursClosed));
    expect(closed).not.toContain("09:00–19:00");
    // Inside calling hours: no warning text.
    const inside = inLocale(locale, createElement(NextFollowUpPicker, { idBase: "i", ctx, state: { choice: "pick", date: "2026-10-25", time: "11:00" }, onChange: noop, suggestion: null, showIssue: false, locale, c: c.calls }));
    expect(inside).not.toContain(esc(c.calls.outsideHours.split("(")[0]));
  });

  it("the dialog is a CrmDialog sheet labelled by its heading; Done buttons and the call-return prompt open it; a tel: tap does not", () => {
    const dialog = inLocale(locale, createElement(CallOutcomeDialog, { open: false, leadId: "lead-1", leadName: "Riya", pagePath: "/crm/leads/lead-1", t, c, onClose: noop, onDone: noop }));
    expect(dialog).toMatch(/<dialog aria-labelledby="[^"]+-title"/);
    expect(dialog).toContain("h-dvh"); // full-height sheet on phones

    const done = inLocale(locale, createElement(CompleteTaskButton, { taskId: "task-1", title: "Call back", leadId: "lead-1", leadName: "Riya", t, c, pagePath: "/crm/today" }));
    expect(done).toContain(`aria-label="${esc(t.lead.tasks.completeLabel.replace("{title}", "Call back"))}"`);
    expect(done).toContain('aria-haspopup="dialog"');
    expect(count(done, /<dialog\b/g)).toBe(1);
    expect(done).toContain("min-h-11");

    const prompt = inLocale(locale, createElement(CallReturnPrompt, { leadId: "lead-1", leadName: "Riya", t, c, pagePath: "/crm/leads/lead-1" }));
    expect(count(prompt, /<dialog\b/g)).toBe(1);

    const contact = inLocale(
      locale,
      createElement(ContactActions, {
        leadId: "lead-1",
        name: "Riya",
        telHref: "tel:+916000012345",
        phone: "+916000012345",
        phoneDisplay: "+91 60000 12345",
        email: null,
        t,
        c,
        pagePath: "/crm/leads/lead-1",
      }),
    );
    expect(contact).toMatch(/<a href="tel:\+916000012345" class="[^"]*" aria-label="[^"]+">/); // a plain link: no dialog on the tap
    expect(contact).not.toMatch(/href="tel:[^"]*"[^>]*aria-haspopup/);
    expect(contact).toContain(esc(c.calls.logCall));
    expect(contact).toContain(`aria-label="${esc(c.whatsapp.openLabel.replace("{name}", "Riya"))}"`);
    expect(contact).not.toContain("wa.me");
    expect(count(contact, /<dialog\b/g)).toBe(2); // call outcome + WhatsApp composer, both closed
    expect(contact).toContain(esc(t.lead.contact.honest));
  });

  it("Today's calls: every Done opens the outcome dialog for its task", () => {
    const crm = messagesFor(locale, "crm");
    const task: MyTask = {
      id: "task-1",
      leadId: "lead-1",
      title: "Call back with fees",
      dueAt: iso(ist("2026-10-21", "10:00")),
      doneAt: null,
      assignee: null,
      createdBy: null,
      createdAt: iso(NOW),
      overdue: true,
      leadDisplayName: "Riya Sharma",
      leadStage: "contacted",
      leadPhone: "+91 ••••• •2345",
    };
    const html = inLocale(locale, createElement(TodayView, { data: { overdue: [task], dueToday: [], fresh: [] }, centres: {}, now: NOW, locale, t: crm }));
    expect(html).toContain(crm.lead.tasks.completeLabel.replace("{title}", "Call back with fees"));
    expect(count(html, /<dialog\b/g)).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// WhatsApp composer

const approved = (key: string): WaTemplate => ({
  key,
  context: "general",
  position: 0,
  status: "approved",
  bodies: { en: "Namaste {parent_name} ji, the next test is on {test_date}. – {counsellor_name}, Aspire", hi: "नमस्ते {parent_name} जी।", hinglish: "Namaste {parent_name} ji." },
  version: 2,
  seeded: true,
  approvedAt: iso(NOW),
  approvedBy: "Owner",
  updatedAt: iso(NOW),
});

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

describe("WhatsApp confirm-on-return mark (wa-return.ts, O16)", () => {
  it("opening WhatsApp only stores { leadId, templateKey, lang, openedAt } — no text, no number — for two hours", () => {
    const storage = memoryStorage();
    expect(readWaMark(storage)).toBeNull();
    markWaOpened(storage, { leadId: "lead-1", templateKey: "missed_call", lang: "hi", openedAt: NOW });
    expect(JSON.parse(storage.store.get(WA_RETURN_KEY) ?? "{}")).toEqual({ leadId: "lead-1", templateKey: "missed_call", lang: "hi", openedAt: NOW });
    const mark = readWaMark(storage);
    expect(shouldPromptWaReturn(mark, "lead-1", NOW + 60_000)).toBe(true);
    expect(shouldPromptWaReturn(mark, "lead-2", NOW + 60_000)).toBe(false);
    expect(shouldPromptWaReturn(mark, "lead-1", NOW + 3 * 60 * 60_000)).toBe(false);
    clearWaMark(storage);
    expect(readWaMark(storage)).toBeNull();
    markWaOpened(storage, { leadId: "bad id!", templateKey: null, lang: "en", openedAt: NOW });
    markWaOpened(storage, { leadId: "lead-1", templateKey: "Bad Key", lang: "en", openedAt: NOW });
    expect(readWaMark(storage)).toBeNull();
    storage.setItem(WA_RETURN_KEY, "{not json");
    expect(readWaMark(storage)).toBeNull();
    const blocked = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => markWaOpened(blocked, { leadId: "lead-1", templateKey: null, lang: "en", openedAt: NOW })).not.toThrow();
    expect(readWaMark(blocked)).toBeNull();
  });

  it("only 'Yes, I sent it' builds a request: message_sent with the template; opening and 'No' send nothing", () => {
    const ctx = context();
    const yes = buildWhatsAppSent({ choice: "tomorrow", date: "", time: "" }, ctx, { key: "missed_call", lang: "hi" });
    expect(yes).toEqual({ ok: true, input: { contact: { channel: "whatsapp", outcome: "message_sent", template: { key: "missed_call", lang: "hi" } }, next: { kind: "preset", preset: "tomorrow" } } });
    if (yes.ok) expect(callsRequests.recordOutcome("lead-1", yes.input)).toMatchObject({ method: "POST", body: { contact: { outcome: "message_sent" } } });
    expect(buildWhatsAppSent({ choice: "keep", date: "", time: "" }, ctx, null)).toMatchObject({ ok: true, input: { contact: { template: null }, next: { kind: "none", reason: "has_other_task" } } });
    // Opening WhatsApp and "No" only touch this browser's storage.
    const storage = memoryStorage();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    markWaOpened(storage, { leadId: "lead-1", templateKey: null, lang: "en", openedAt: NOW });
    clearWaMark(storage);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe.each(LOCALES)("WhatsApp composer markup (%s)", (locale) => {
  const c = callsMessages(locale);
  const base = {
    titleId: "w-title",
    templates: { status: "ready" as const, items: [approved("test_date"), approved("missed_call")] },
    lang: "en" as const,
    phone: "+916000012345",
    leadName: "Riya Sharma",
    c,
    onChoose: noop,
    onLang: noop,
    onText: noop,
    onOpened: noop,
    onCancel: noop,
  };

  it("lists approved templates by purpose plus 'Write my own message', three languages, labelled controls", () => {
    const html = inLocale(locale, createElement(ComposeStep, { ...base, choice: null, text: "" }));
    expect(html).toContain(esc(templatePurpose("test_date", c.whatsapp)));
    expect(html).toContain(esc(c.whatsapp.purposes.missed_call));
    expect(html).toContain(esc(c.whatsapp.own));
    for (const label of Object.values(c.whatsapp.langs)) expect(html).toContain(label);
    expectLabelledControls(html);
    const none = inLocale(locale, createElement(ComposeStep, { ...base, templates: { status: "ready", items: [] }, choice: "own", text: "" }));
    expect(none).toContain(esc(c.whatsapp.noApproved));
  });

  it("leftover {slots} keep an aria-disabled button that says what to fill in; ready text becomes a wa.me link (new tab)", () => {
    const leftover = "Namaste Anil ji, the next test is on {test_date}. – Counsellor One, Aspire";
    const blocked = inLocale(locale, createElement(ComposeStep, { ...base, choice: "test_date", text: leftover }));
    expect(blocked).toMatch(/<button type="button" aria-disabled="true" aria-describedby="[^"]+-reasons"/);
    expect(blocked).toContain(esc(fillInText(["test_date"], c.whatsapp)));
    expect(blocked).not.toContain("wa.me");
    const tooLong = inLocale(locale, createElement(ComposeStep, { ...base, choice: "own", text: "a".repeat(1001) }));
    expect(tooLong).toContain('aria-disabled="true"');

    const ready = "नमस्ते अनिल जी, कल 10 बजे आइए।";
    const html = inLocale(locale, createElement(ComposeStep, { ...base, choice: "own", text: ready }));
    const href = /href="(https:\/\/wa\.me\/[^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, "&");
    expect(href?.startsWith("https://wa.me/916000012345?text=")).toBe(true);
    expect(new URL(href ?? "").searchParams.get("text")).toBe(ready);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('aria-disabled="true"');
  });

  it("step 2 asks 'Did you send it?'; Yes reveals the follow-up (keep the open task, else tomorrow)", () => {
    const mark = { leadId: "lead-1", templateKey: "missed_call", lang: "hi" as const, openedAt: NOW };
    const ask = inLocale(locale, createElement(SentStep, { titleId: "s", ctx: context(), mark, leadName: "Riya", pending: false, error: null, locale, c, onYes: async () => null, onNo: noop }));
    expect(ask).toContain(esc(c.whatsapp.didYouSend));
    expect(ask).toContain(esc(c.whatsapp.yesSent));
    expect(ask).toContain(esc(c.whatsapp.notSent));
    expect(ask).toContain(esc(c.whatsapp.purposes.missed_call));
    expect(ask).not.toContain('type="radio"');
    const yes = inLocale(
      locale,
      createElement(SentStep, {
        titleId: "s",
        ctx: context({ openTask: { id: "t2", dueAt: iso(ist("2026-10-23", "11:00")), title: "Visit reminder" } }),
        mark,
        leadName: "Riya",
        pending: false,
        error: null,
        locale,
        c,
        onYes: async () => null,
        onNo: noop,
        initialYes: true,
      }),
    );
    expect(yes).toMatch(/checked="" value="keep"/);
    const yesNoTask = inLocale(locale, createElement(SentStep, { titleId: "s", ctx: context(), mark, leadName: "Riya", pending: false, error: null, locale, c, onYes: async () => null, onNo: noop, initialYes: true }));
    expect(yesNoTask).toMatch(/checked="" value="tomorrow"/);
    expectLabelledControls(yesNoTask);
  });

  it("the return prompt shows nothing until a mark is found on focus (static render)", () => {
    const html = inLocale(locale, createElement(WaReturnPrompt, { leadId: "lead-1", leadName: "Riya", suppressed: false, c: c.whatsapp, onYes: noop, onNo: noop }));
    expect(html).toBe('<p role="status" class="sr-only"></p>');
  });
});
