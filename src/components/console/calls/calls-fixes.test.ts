import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompleteTaskButton, type LeadIslandMessages } from "@/components/crm/LeadActions";
import { TodayView } from "@/components/crm/TodayView";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { DEFAULT_CALLING_HOURS } from "@/lib/crm/lead-ops-types";
import type { FollowUpContextView } from "@/lib/crm/console/followup/types";
import type { MyTask } from "@/lib/crm/types";
import { callsMessages } from "./messages";
import { templateRefused } from "./outcome-form";
import { focusIfLost, OutcomeStatusRegion } from "./outcome-status";
import { SentStep, templatePurpose, WhatsAppComposer } from "./WhatsAppComposer";

// 1B-CALLS review fixes (docs/admin-phase-1b-plan.md §5.C step 6, §5.D step 2): the composer opened
// from "Back from WhatsApp?" → Yes starts at the follow-up; a template that stopped being approved
// can still be logged as the staff member's own message; Done's result line and focus target outlive
// the refresh that removes the completed task's row. Static markup only (no DOM, no network).

// The composer's body needs the router (useCrmAction) and the loaded context: both stubbed here.
const holder = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} }) }));
vi.mock("./use-follow-up-context", () => ({ useFollowUpContext: () => ({ status: "ready", ctx: holder.ctx }) }));

const LOCALES: Locale[] = ["en", "hi"];
const IST = (5 * 60 + 30) * 60_000;
const ist = (day: string, time: string) => Date.parse(`${day}T${time}:00.000Z`) - IST;
const NOW = ist("2026-10-21", "11:30");
const iso = (ms: number) => new Date(ms).toISOString();
const noop = () => {};

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function context(overrides: Partial<FollowUpContextView> = {}): FollowUpContextView {
  const slots = { parent_name: "Anil Sharma", student_first_name: "Riya", counsellor_name: "Counsellor One", centre: "Shimla" };
  return {
    leadId: "lead-1",
    now: iso(NOW),
    presets: { later_today: iso(ist("2026-10-21", "13:30")), tomorrow: iso(ist("2026-10-22", "10:00")), in_3_days: iso(ist("2026-10-24", "10:00")) },
    suggested: null,
    attempts: { calls: 1, unansweredStreak: 0, suggestNotReachable: false },
    openTask: null,
    openTaskCount: 0,
    outsideCallingHoursNow: false,
    callingHoursLabel: "09:00–19:00",
    stage: "contacted",
    templateSlots: slots,
    defaultLang: "en",
    callingHours: DEFAULT_CALLING_HOURS,
    rhythm: { firstConnectedAt: null, visitedAt: null, contactsSinceVisit: 0, preferredTime: null },
    slotsByLang: { en: slots, hi: slots, hinglish: slots },
    completingTask: null,
    ...overrides,
  };
}

const island = (locale: Locale): LeadIslandMessages => {
  const t = messagesFor(locale, "crm");
  return { common: t.common, errors: t.errors, stages: t.stages, lostReasons: t.lostReasons, lead: t.lead };
};

const mark = { leadId: "lead-1", templateKey: "missed_call", lang: "hi" as const, openedAt: NOW };

describe.each(LOCALES)("WhatsApp: back from WhatsApp, and a template withdrawn meanwhile (%s)", (locale) => {
  const c = callsMessages(locale);
  const t = island(locale);
  const composer = (resumeAnswered: boolean) =>
    inLocale(
      locale,
      createElement(WhatsAppComposer, {
        open: true,
        leadId: "lead-1",
        leadName: "Riya",
        phone: "+916000012345",
        pagePath: "/crm/leads/lead-1",
        t,
        c,
        resume: mark,
        resumeAnswered,
        onClose: noop,
        onDone: noop,
      }),
    );

  it("'Yes, I sent it' on the return prompt opens straight at the next follow-up: the question is not asked twice", () => {
    holder.ctx = context();
    const answered = composer(true);
    expect(answered).toContain(esc(c.whatsapp.didYouSend));
    expect(answered).toContain(esc(c.whatsapp.purposes.missed_call));
    expect(answered).not.toContain(esc(c.whatsapp.yesSent));
    expect(answered).toMatch(/checked="" value="tomorrow"/);
    expect(answered).toContain(esc(c.calls.save));
    // Re-opened without the prompt's answer, it still asks first.
    const asked = composer(false);
    expect(asked).toContain(esc(c.whatsapp.yesSent));
    expect(asked).not.toContain('type="radio"');
  });

  it("a template that is no longer approved: the reason is said and the save becomes 'Log as my own message'", () => {
    const reason = format(c.whatsapp.templateGone, { template: templatePurpose("missed_call", c.whatsapp) });
    const html = inLocale(
      locale,
      createElement(SentStep, { titleId: "s", ctx: context(), mark, leadName: "Riya", pending: false, error: reason, locale, c, onYes: async () => null, onNo: noop, initialYes: true, templateGone: true }),
    );
    expect(html).toMatch(new RegExp(`role="alert"[^>]*>${esc(reason)}`));
    expect(html).toContain(esc(c.whatsapp.logAsOwn));
    expect(html).toContain(esc(c.whatsapp.notSent));
    // Only a 422 on `contact.template` triggers it.
    expect(templateRefused({ error: "validation", fieldErrors: { "contact.template": null } })).toBe(true);
    expect(templateRefused({ error: "validation", fieldErrors: { next: null } })).toBe(false);
    expect(templateRefused({ error: "forbidden", fieldErrors: { "contact.template": null } })).toBe(false);
  });
});

describe.each(LOCALES)("Done: the result line and focus target outlive the task's row (%s)", (locale) => {
  const c = callsMessages(locale);
  const t = island(locale);
  const done = createElement(CompleteTaskButton, { taskId: "task-1", title: "Call back", leadId: "lead-1", leadName: "Riya", t, c, pagePath: "/crm/leads/lead-1" });

  it("inside a task list's region, the region holds the only status line (before the list); alone, Done keeps its own", () => {
    const Region = OutcomeStatusRegion as (props: { focusTargetId: string; children?: ReactNode }) => ReactNode;
    const inRegion = inLocale(locale, createElement(Region, { focusTargetId: "crm-lead-tasks" }, done));
    expect((inRegion.match(/role="status"/g) ?? []).length).toBe(1);
    expect(inRegion.indexOf('role="status"')).toBeLessThan(inRegion.indexOf('aria-haspopup="dialog"'));
    const alone = inLocale(locale, done);
    expect((alone.match(/role="status"/g) ?? []).length).toBe(1);
    expect(alone.indexOf('role="status"')).toBeGreaterThan(alone.indexOf('aria-haspopup="dialog"'));
  });

  it("Today's calls: each task panel has its region ahead of its Done buttons", () => {
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
    const overdue = html.slice(html.indexOf('id="crm-today-overdue"'), html.indexOf('id="crm-today-due"'));
    expect(overdue).toContain('<p role="status" class="sr-only"></p>');
    expect(overdue.indexOf('role="status"')).toBeLessThan(overdue.indexOf('aria-haspopup="dialog"'));
    const due = html.slice(html.indexOf('id="crm-today-due"'));
    expect(due).toContain('<p role="status" class="sr-only"></p>');
  });
});

describe("focusIfLost", () => {
  function fakeDocument(active: "body" | "connected" | "detached") {
    const body = { isConnected: true };
    const attributes = new Map<string, string>();
    const heading = {
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      focus: vi.fn(),
    };
    const activeElement = active === "body" ? body : { isConnected: active === "connected" };
    const doc = { body, activeElement, getElementById: (id: string) => (id === "crm-lead-tasks" ? heading : null) } as unknown as Document;
    return { doc, heading, attributes };
  }

  it("moves focus to the stable heading only when focus fell back to <body> or a removed element", () => {
    const lost = fakeDocument("body");
    expect(focusIfLost("crm-lead-tasks", lost.doc)).toBe(true);
    expect(lost.heading.focus).toHaveBeenCalledTimes(1);
    expect(lost.attributes.get("tabindex")).toBe("-1");
    const detached = fakeDocument("detached");
    expect(focusIfLost("crm-lead-tasks", detached.doc)).toBe(true);
    const kept = fakeDocument("connected");
    expect(focusIfLost("crm-lead-tasks", kept.doc)).toBe(false);
    expect(kept.heading.focus).not.toHaveBeenCalled();
    expect(focusIfLost("missing", fakeDocument("body").doc)).toBe(false);
    expect(focusIfLost(null, fakeDocument("body").doc)).toBe(false);
  });
});
