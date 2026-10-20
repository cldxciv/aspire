import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HINT_KEY, LeadGateStore, type LeadGateStoreDeps } from "@/components/lead-gate/lead-gate-store";
import { getSyllabusTopics, MOCK_MINUTES } from "@/content/planner/syllabus";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { LeadGateStatusData } from "@/lib/lead-gate/contract";
import { DEFAULT_REMINDER_MINUTES, type PlannerSettings } from "@/lib/planner/state";
import { EXAM_IDS, type ClientTopic, type ExamId } from "@/lib/planner/types";

import type { PlannerData } from "./model";
import { CounsellorCta, PlannerApp } from "./PlannerApp";
import { PlannerClient } from "./PlannerClient";
import { PlanForm } from "./PlanForm";
import { createPlannerGate, planAccess, planNeedsGate, type PlanGateContext } from "./planner-gate";

/**
 * Study planner × lead gate (docs/lead-gate-plan.md §8.5; owner decision 21 Oct 2026: on now,
 * mode "required", sample data does not skip the gate). The host logic is DOM-free
 * (planner-gate.ts); here it runs against the REAL lead-gate store with fake transport, wired the
 * way PlannerClient wires it through useLeadGate().
 */

const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
// `sample: true`: the live demo site runs on sample data, and that never skips the gate.
const LOCKED: LeadGateStatusData = { mode: "required", unlocked: false, via: null, recordsUse: false, expiresAt: null, sample: true };
const OPTIONAL: LeadGateStatusData = { ...LOCKED, mode: "optional" };
const PASS: LeadGateStatusData = {
  mode: "required",
  unlocked: true,
  via: "pass",
  recordsUse: true,
  expiresAt: new Date(NOW + 180 * 864e5).toISOString(),
  sample: true,
};
const PASS_NO_RECORD: LeadGateStatusData = { ...PASS, recordsUse: false };
const OFF: LeadGateStatusData = { mode: "off", unlocked: true, via: "off", recordsUse: false, expiresAt: null, sample: true };
const SESSION: LeadGateStatusData = { mode: "required", unlocked: true, via: "session", recordsUse: false, expiresAt: null, sample: true };

const ok = (data: LeadGateStatusData) => ({ kind: "ok" as const, data });

function fakeDeps(overrides: Partial<LeadGateStoreDeps> = {}): LeadGateStoreDeps {
  const map = new Map<string, string>();
  return {
    fetchStatus: vi.fn(async () => ok(LOCKED)),
    submit: vi.fn(async () => ({ kind: "unlocked" as const, data: { unlocked: true as const, via: "pass" as const, recordsUse: true, expiresAt: PASS.expiresAt } })),
    forget: vi.fn(async () => ({ forgotten: true as const, withdrawn: false })),
    sendUsage: vi.fn(async () => ({ recorded: true })),
    storage: () => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key) }),
    now: () => NOW,
    online: () => true,
    listenStorage: () => () => undefined,
    ...overrides,
  };
}

const settings = (exam: ExamId = "jee-main", examDate = "2027-04-03"): PlannerSettings => ({
  exam,
  batch: exam === "foundation" ? "10" : "12",
  startDate: "2026-10-21",
  examDate,
  dailyHours: 6,
  weakTopics: [],
  reminderMinutes: DEFAULT_REMINDER_MINUTES,
  notifications: false,
});

const GUEST_FIRST: PlanGateContext = { mode: "guest", hasPlan: false, online: true };

const HOST_ID = "planner-host";

/** PlannerClient's wiring, with useLeadGate's waiting / onUnlocked({ byThisHost }) semantics reproduced. */
function host(overrides: Partial<LeadGateStoreDeps> = {}) {
  const deps = fakeDeps(overrides);
  const store = new LeadGateStore(deps);
  const applied: PlannerSettings[] = [];
  /** `explicit` per build: may focus move to the plan? */
  const explicit: boolean[] = [];
  const busy: boolean[] = [];
  /** The planner store's plan (PlannerClient: plannerStore.getSnapshot()?.state.settings). */
  let storedPlan: PlannerSettings | null = null;
  let waitingSince: number | null = null;
  const planGate = createPlannerGate({
    apply: (next, isExplicit) => {
      applied.push(next);
      explicit.push(isExplicit);
      storedPlan = next;
    },
    recordUse: (exam) => store.recordUse({ tool: "planner", exam, page: "/tools/planner" }),
    hasPlan: () => storedPlan !== null,
    onBusyChange: (value) => busy.push(value),
  });
  const requestAccess = async () => {
    const allowed = await store.ensure();
    if (!allowed) waitingSince = store.getSnapshot().unlockSeq;
    return allowed;
  };
  store.onUnlock((event) => {
    if (waitingSince === null || event.seq <= waitingSince) return;
    waitingSince = null;
    planGate.unlocked({ byThisHost: event.by === HOST_ID });
  });
  const submit = (next: PlannerSettings, context: Partial<PlanGateContext> = {}) =>
    planGate.submit(next, { ...GUEST_FIRST, ...context }, () => planAccess(store, requestAccess));
  /** Another tab saved a plan to localStorage and this tab's planner store picked it up. */
  const planFromOtherTab = (next: PlannerSettings) => {
    storedPlan = next;
  };
  return { deps, store, applied, explicit, busy, planGate, submit, planFromOtherTab, gateOpen: () => waitingSince !== null };
}

describe("planNeedsGate: only a guest's new plan, online", () => {
  it.each([
    [{ mode: "guest", hasPlan: false, online: true }, true],
    [{ mode: "guest", hasPlan: true, online: true }, false],
    [{ mode: "guest", hasPlan: false, online: false }, false],
    [{ mode: "account", hasPlan: false, online: true }, false],
    [{ mode: "account", hasPlan: true, online: true }, false],
  ] as const)("%j → %s", (context, expected) => {
    expect(planNeedsGate(context)).toBe(expected);
  });
});

describe("planner lead gate (host logic against the real store)", () => {
  it("signed-in students, plan edits and offline use are never gated: built at once, no status request, nothing noted", async () => {
    for (const context of [{ mode: "account" as const }, { hasPlan: true }, { online: false }]) {
      const h = host();
      expect(await h.submit(settings("neet"), context), JSON.stringify(context)).toBe("applied");
      expect(h.applied).toEqual([settings("neet")]);
      expect(h.deps.fetchStatus).not.toHaveBeenCalled();
      expect(h.deps.sendUsage).not.toHaveBeenCalled();
      expect(h.gateOpen()).toBe(false);
    }
  });

  it("gate off or a signed-in session: a guest's first plan is built at once and nothing is noted", async () => {
    for (const status of [OFF, SESSION]) {
      const h = host({ fetchStatus: vi.fn(async () => ok(status)) });
      expect(await h.submit(settings())).toBe("applied");
      expect(h.applied).toHaveLength(1);
      expect(h.deps.sendUsage).not.toHaveBeenCalled();
    }
  });

  it("this browser already shared details: built at once and ONLY the exam is noted (tool, exam, page)", async () => {
    const h = host({ fetchStatus: vi.fn(async () => ok(PASS)) });
    expect(await h.submit(settings("neet"))).toBe("applied");
    expect(h.applied).toEqual([settings("neet")]);
    expect(h.deps.sendUsage).toHaveBeenCalledTimes(1);
    expect(h.deps.sendUsage).toHaveBeenCalledWith({ tool: "planner", exam: "neet", page: "/tools/planner" });

    const quiet = host({ fetchStatus: vi.fn(async () => ok(PASS_NO_RECORD)) });
    expect(await quiet.submit(settings())).toBe("applied");
    expect(quiet.deps.sendUsage).not.toHaveBeenCalled();
  });

  it("locked (mode required, sample data or not): the plan waits, the latest submit is held, and the contact step builds it once", async () => {
    const h = host();
    expect(await h.submit(settings("jee-main", "2027-01-24"))).toBe("gated");
    expect(h.gateOpen()).toBe(true);
    expect(h.applied).toEqual([]);
    // The student changes the form and presses "Build my plan" again while the contact step shows.
    expect(await h.submit(settings("neet", "2027-05-02"))).toBe("gated");
    expect(h.planGate.pending).toEqual(settings("neet", "2027-05-02"));
    expect(h.deps.fetchStatus).toHaveBeenCalledTimes(1);
    expect(h.deps.sendUsage).not.toHaveBeenCalled();

    const outcome = await h.store.submit({ any: "payload" }, "planner-host");
    expect(outcome.kind).toBe("unlocked");
    expect(h.applied).toEqual([settings("neet", "2027-05-02")]);
    expect(h.deps.sendUsage).toHaveBeenCalledTimes(1);
    expect(h.deps.sendUsage).toHaveBeenCalledWith({ tool: "planner", exam: "neet", page: "/tools/planner" });
    expect(h.planGate.pending).toBeNull();
    expect(h.gateOpen()).toBe(false);
    expect(h.planGate.unlocked()).toBe(false); // nothing held any more
    expect(h.applied).toHaveLength(1);
  });

  it("focus may move to the plan only after the planner's own action, never after another host's unlock (e.g. the Rancho panel)", async () => {
    const own = host();
    expect(await own.submit(settings())).toBe("gated");
    await own.store.submit({ any: "payload" }, HOST_ID);
    expect(own.explicit).toEqual([true]);

    // Rancho's own contact form (another host on the page) opens the store while the planner waits.
    const other = host();
    expect(await other.submit(settings())).toBe("gated");
    await other.store.submit({ any: "payload" }, "rancho-panel");
    expect(other.applied).toEqual([settings()]);
    expect(other.explicit).toEqual([false]);

    // Built straight from the plan form (this browser already shared details).
    const direct = host({ fetchStatus: vi.fn(async () => ok(PASS)) });
    expect(await direct.submit(settings())).toBe("applied");
    expect(direct.explicit).toEqual([true]);
  });

  it("a plan made in another tab while this one waited is kept: the held plan is dropped, not built over it, and nothing is noted", async () => {
    const shared = new Map<string, string>();
    let otherTabWrote: (key: string | null) => void = () => undefined;
    const h = host({
      storage: () => ({ getItem: (key) => shared.get(key) ?? null, setItem: (key, value) => void shared.set(key, value), removeItem: (key) => void shared.delete(key) }),
      listenStorage: (listener) => {
        otherTabWrote = listener;
        return () => undefined;
      },
    });
    h.store.subscribe(() => undefined); // useLeadGate subscribes, which listens to other tabs
    expect(await h.submit(settings("jee-main"))).toBe("gated");
    // Tab A shared details and built its plan: A's plan reaches this tab first (planner-store's
    // storage event), then A's confirmed pass hint opens this tab's lead-gate store.
    h.planFromOtherTab(settings("neet"));
    shared.set(HINT_KEY, JSON.stringify({ until: NOW + 864e5, recordsUse: true, mode: "required" }));
    otherTabWrote(HINT_KEY);
    expect(h.store.getSnapshot().status).toBe("open");
    expect(h.gateOpen()).toBe(false);
    expect(h.applied).toEqual([]);
    expect(h.planGate.pending).toBeNull();
    expect(h.deps.sendUsage).not.toHaveBeenCalled();
  });

  it("fails OPEN when the status check fails (5xx, 429, timeout, network): built, nothing noted", async () => {
    for (const fetchStatus of [vi.fn(async () => ({ kind: "failed" as const })), vi.fn(async () => Promise.reject(new Error("offline")))]) {
      const h = host({ fetchStatus });
      expect(await h.submit(settings())).toBe("applied");
      expect(h.applied).toHaveLength(1);
      expect(h.deps.sendUsage).not.toHaveBeenCalled();
      expect(h.store.getSnapshot().via).toBe("unavailable");
    }
  });

  it("the form's own fail-open paths build the held plan without noting it: 'Show my result without saving' and the optional-mode skip", async () => {
    const failed = host();
    expect(await failed.submit(settings())).toBe("gated");
    failed.store.continueWithoutSaving("planner-host");
    expect(failed.applied).toHaveLength(1);
    expect(failed.deps.sendUsage).not.toHaveBeenCalled();

    // Optional mode exists only while the flood breaker is tripped (launch mode is "required").
    const optional = host({ fetchStatus: vi.fn(async () => ok(OPTIONAL)) });
    expect(await optional.submit(settings())).toBe("gated");
    optional.store.skip("planner-host");
    expect(optional.applied).toHaveLength(1);
    expect(optional.deps.sendUsage).not.toHaveBeenCalled();
  });

  it("a page that loaded offline asks the server again once the device is back online (and still fails open if it cannot answer)", async () => {
    let online = false;
    const h = host({ online: () => online });
    expect(await h.store.ensure()).toBe(true); // <LeadGateNote> on mount, offline
    expect(h.store.getSnapshot().via).toBe("unavailable");
    online = true;
    expect(await h.submit(settings())).toBe("gated");
    expect(h.deps.fetchStatus).toHaveBeenCalledTimes(1);
    expect(h.applied).toEqual([]);

    let online2 = false;
    const flaky = host({ online: () => online2, fetchStatus: vi.fn(async () => ({ kind: "failed" as const })) });
    await flaky.store.ensure();
    online2 = true;
    expect(await flaky.submit(settings())).toBe("applied");
    expect(flaky.deps.fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("one check at a time: a second submit while asking is held and the plan is built once, with the latest settings", async () => {
    let answer: (value: ReturnType<typeof ok>) => void = () => undefined;
    const h = host({ fetchStatus: vi.fn(() => new Promise<ReturnType<typeof ok>>((resolve) => (answer = resolve))) });
    const first = h.submit(settings("jee-main"));
    expect(h.planGate.busy).toBe(true);
    expect(await h.submit(settings("boh"))).toBe("waiting");
    answer(ok(PASS));
    expect(await first).toBe("applied");
    expect(h.applied).toEqual([settings("boh")]);
    expect(h.deps.fetchStatus).toHaveBeenCalledTimes(1);
    expect(h.deps.sendUsage).toHaveBeenCalledTimes(1);
    expect(h.busy).toEqual([true, false]);
    expect(h.planGate.busy).toBe(false);
  });

  it("a stored plan stays after 'Not you?' (data the family already has is never gated)", async () => {
    const h = host({ fetchStatus: vi.fn(async () => ok(PASS)) });
    await h.submit(settings());
    await h.store.forget();
    expect(h.store.getSnapshot().status).toBe("unknown");
    // Editing that plan later is not a new plan: no check, no form.
    expect(await h.submit(settings("neet"), { hasPlan: true })).toBe("applied");
    expect(h.deps.fetchStatus).toHaveBeenCalledTimes(1);
    expect(h.gateOpen()).toBe(false);
  });
});

function plannerData(locale: Locale): PlannerData {
  const topics: Record<string, ClientTopic> = {};
  const examTopics = {} as Record<ExamId, string[]>;
  for (const exam of EXAM_IDS) {
    const list = getSyllabusTopics(exam);
    examTopics[exam] = list.map((topic) => topic.id);
    for (const topic of list) topics[topic.id] = { id: topic.id, subject: topic.subject, level: topic.level, name: topic.name[locale] };
  }
  return { topics, examTopics, cards: [], mockMinutes: { ...MOCK_MINUTES } };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("planner page wiring", () => {
  it.each(["en", "hi"] as const)("%s: the PlannerApp server wrapper hands the leadGate strings of the page's locale to the client", (locale) => {
    const props = {
      t: messagesFor(locale, "planner"),
      locale,
      data: plannerData(locale),
      sample: true,
      links: { signIn: "/login", mockTests: "/tools/mock-tests", self: "/tools/planner" },
    };
    const element = PlannerApp(props);
    expect(isValidElement(element)).toBe(true);
    expect(element.type).toBe(PlannerClient);
    expect(element.props).toEqual({ ...props, gateMessages: messagesFor(locale, "leadGate") });
    expect(typeof CounsellorCta).toBe("function");
  });

  it.each(["en", "hi"] as const)("%s: PlanForm shows a pending label while the gate is checked", (locale) => {
    const t = messagesFor(locale, "planner");
    const render = (busy: boolean) =>
      renderToStaticMarkup(createElement(PlanForm, { t, data: plannerData(locale), today: "2026-10-21", settings: null, busy, onSubmit: () => undefined }));
    const busy = render(true);
    expect(busy).toContain(esc(t.form.checking));
    expect(busy).toMatch(/<button[^>]*type="submit"[^>]*aria-disabled="true"/);
    const idle = render(false);
    expect(idle).toContain(esc(t.form.submit));
    expect(idle).not.toContain('aria-disabled="');
  });

  it("only the empty-state form goes through the gate; edits, sample data and the status row as planned", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/planner/PlannerClient.tsx"), "utf8");
    expect(source).toMatch(/useLeadGate\(\{ tool: "planner"/);
    expect(source.match(/onSubmit=\{onCreate\}/g)).toHaveLength(1);
    expect(source).toMatch(/<PlanForm t=\{t\} data=\{data\} today=\{today\} settings=\{null\} busy=\{checkingAccess\} onSubmit=\{onCreate\} \/>/);
    expect(source).toMatch(/<SettingsView[\s\S]*?onSettings=\{onSettings\}/);
    // The form sits under PlanForm in the same card; the note shows only while the form does not.
    expect(source).toMatch(/onSubmit=\{onCreate\} \/>\s*\{gate\.gateOpen \? \(\s*<LeadGateForm \{\.\.\.gate\.formProps\} messages=\{gateMessages\}/);
    expect(source).toContain("<LeadGateNote messages={gateMessages}");
    expect(source).toContain("{guest && <LeadGateIdentity messages={gateMessages} />}");
    // Sample data never skips the gate (owner decision): the create path does not look at `sample`.
    const onCreate = source.slice(source.indexOf("const onCreate"), source.indexOf("function selectTab"));
    expect(onCreate).toContain("planGate");
    expect(onCreate).not.toMatch(/sample/i);
  });
});

describe("planner copy (mode-agnostic, honest; en + hi)", () => {
  it.each(["en", "hi"] as const)("%s: intro, 'Good to know' and Settings privacy mention the one-time contact step", (locale) => {
    const t = messagesFor(locale, "planner");
    const contact = locale === "en" ? /contact (number|details)/ : /संपर्क/;
    for (const text of [t.form.intro, t.how.honest.privacy, t.settings.privacy]) {
      expect(text).toMatch(contact);
      expect(text).not.toMatch(/no sign-?up|verify|OTP|सत्यापित/i);
    }
    expect(t.form.checking.trim().length).toBeGreaterThan(0);
    // The hero says it up front too (TG-7; mode-agnostic, plan §11.4). "Free" in the meta text waits for counsel.
    expect(t.hero.lead).toMatch(contact);
    if (locale === "en") {
      // Mode-agnostic: true whether the gate is required, optional or off.
      expect(t.form.intro).toContain("may be asked once");
      expect(t.hero.lead).toContain("You may be asked for a contact number once before your first plan");
      // Narrow to the planner's data: the contact form itself stores name, class, role, consent and attribution.
      expect(t.how.honest.privacy).toContain("the exam from your plan may be noted with it; your dates and progress stay in this browser");
      expect(t.how.honest.privacy).not.toMatch(/only the exam/);
    } else {
      expect(t.how.honest.privacy).not.toMatch(/केवल परीक्षा/);
      // One spelling of तारीख across the namespace (no nukta form).
      expect(JSON.stringify(t)).not.toContain("तारीख़");
    }
  });
});
