import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LeadGateStatusOutcome, LeadGateSubmitOutcome } from "@/components/lead-gate/lead-gate-client";
import { LeadGateStore, type LeadGateStoreDeps, type LeadGateUnlockEvent } from "@/components/lead-gate/lead-gate-store";
import { apiJson, scoreOutcome, scoreRequestBody } from "@/components/mocktest/hooks";
import { LockedPrintNote, LockedResult, MocktestLeadGateMessages, OptionalContactStep } from "@/components/mocktest/lead-gate";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { asksBeforeFirstResult, gateRelaxed, startsAfterUnlock } from "@/lib/mocktest/lead-gate";
import type { LocalAttempt } from "@/lib/mocktest/local-store";

/**
 * Mock tests and the lead gate (docs/lead-gate-plan.md §8.4): the result page's request and how its
 * answer is read, the locked result and print views (static render, en + hi), and the runner's
 * ask-at-the-start rule. Interactive flows are on the manual checklist (plan §13.2).
 */

function inLocale(locale: Locale, child: React.ReactNode): string {
  return renderToStaticMarkup(createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child));
}

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const ATTEMPT: LocalAttempt = {
  id: "attempt-0123456789",
  testId: "neet-sample",
  answers: [0, null, 2],
  timeSpentSec: [10, 0, 30],
  startedAt: Date.parse("2026-10-21T04:30:00Z"),
  submittedAt: Date.parse("2026-10-21T05:10:00Z"),
  submitReason: "manual",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the result page's scoring request", () => {
  it("sends the browser's start; `record` only from the result page and only for the first scoring", () => {
    expect(scoreRequestBody("neet-sample", ATTEMPT, true)).toEqual({
      testId: "neet-sample",
      answers: [0, null, 2],
      timeSpentSec: [10, 0, 30],
      startedAt: ATTEMPT.startedAt,
      record: true,
    });
    // Already scored once on this device (re-opened result): no second note.
    expect(scoreRequestBody("neet-sample", { ...ATTEMPT, score: 35, maxScore: 160 }, true)).not.toHaveProperty("record");
    // Certificate / report for parents never note anything.
    expect(scoreRequestBody("neet-sample", ATTEMPT, false)).not.toHaveProperty("record");
  });

  it("a result already shown on this device (local score) says so (`seen`), so it is never gated again", () => {
    const seen = { ...ATTEMPT, score: 35, maxScore: 160 };
    for (const fromResult of [true, false]) {
      expect(scoreRequestBody("neet-sample", seen, fromResult)).toEqual({
        testId: "neet-sample",
        answers: [0, null, 2],
        timeSpentSec: [10, 0, 30],
        startedAt: ATTEMPT.startedAt,
        seen: true,
      });
      expect(scoreRequestBody("neet-sample", ATTEMPT, fromResult)).not.toHaveProperty("seen");
    }
    // A score of 0 (or below) is still a score that was shown.
    expect(scoreRequestBody("neet-sample", { ...ATTEMPT, score: 0, maxScore: 160 }, true)).toMatchObject({ seen: true });
    expect(scoreRequestBody("neet-sample", { ...ATTEMPT, score: -4, maxScore: 160 }, true)).not.toHaveProperty("record");
  });

  it("optional mode: the result page offers the form before the FIRST result only; required mode is the server's call", () => {
    const locked = { open: false, mode: "optional" as const };
    expect(asksBeforeFirstResult(ATTEMPT, true, locked)).toBe(true);
    // Shared already, skipped, signed in, gate off or the status failed (fail-open): no ask.
    expect(asksBeforeFirstResult(ATTEMPT, true, { open: true, mode: "optional" })).toBe(false);
    // Required: /score answers with the gate 401 (it knows the earlier attempts); unknown: never block.
    expect(asksBeforeFirstResult(ATTEMPT, true, { open: false, mode: "required" })).toBe(false);
    expect(asksBeforeFirstResult(ATTEMPT, true, { open: false, mode: null })).toBe(false);
    // A result already shown here, and the certificate / report, never ask.
    expect(asksBeforeFirstResult({ ...ATTEMPT, score: 35 }, true, locked)).toBe(false);
    expect(asksBeforeFirstResult(ATTEMPT, false, locked)).toBe(false);
  });

  it("reads the answer: the gate 401 → locked; any other 401 is not the gate", () => {
    expect(scoreOutcome({ ok: true, status: 200, data: {} })).toBe("ready");
    expect(scoreOutcome({ ok: false, status: 401, data: null, leadGate: true })).toBe("locked");
    expect(scoreOutcome({ ok: false, status: 401, data: null, leadGate: false })).toBe("error");
    expect(scoreOutcome({ ok: false, status: 404, data: null })).toBe("missing");
    expect(scoreOutcome({ ok: false, status: 0, data: null })).toBe("error");
    expect(scoreOutcome({ ok: false, status: 503, data: null })).toBe("error");
  });

  it("apiJson flags only the gate's 401 (X-Lead-Gate: required)", async () => {
    const reply = (status: number, headers: Record<string, string> = {}) =>
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "unauthenticated", message: "x" }), { status, headers }));
    vi.stubGlobal("fetch", reply(401, { "X-Lead-Gate": "required" }));
    expect(await apiJson("/api/mocktest/score", { body: {} })).toMatchObject({ ok: false, status: 401, leadGate: true });
    vi.stubGlobal("fetch", reply(401));
    expect(await apiJson("/api/mocktest/score", { body: {} })).toMatchObject({ status: 401, leadGate: false });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await apiJson("/api/mocktest/score", { body: {} })).toEqual({ ok: false, status: 0, data: null });
  });
});

describe.each(["en", "hi"] as const)("%s: locked views", (locale) => {
  const t = messagesFor(locale, "mocktest");
  const tGate = messagesFor(locale, "leadGate");

  it("the result says the test is kept on this device and shows ONE enforced contact form", () => {
    const view = createElement(LockedResult, { t, onUnlocked: () => undefined });
    const html = inLocale(locale, createElement(MocktestLeadGateMessages, { messages: tGate }, view));
    expect(html).toContain(esc(t.gate.lockedTitle));
    expect(html).toContain(esc(t.gate.lockedBody));
    expect(html).toContain('data-lead-gate="mock-test"');
    expect(html.match(/<form[\s>]/g)).toHaveLength(1);
    expect(html).toContain(esc(tGate.submit["mock-test"]));
    expect(html).toContain(esc(tGate.heading));
    // Server-enforced tool: never "show my result without saving".
    expect(html).not.toContain(esc(tGate.continueWithoutSaving));
    // Never pre-ticked.
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
  });

  it("without provided messages the views fall back to the catalog of the page's language", () => {
    const html = inLocale(locale, createElement(LockedResult, { t, onUnlocked: () => undefined }));
    expect(html).toContain(esc(tGate.heading));
  });

  it("certificate / report: a note and a link to the result page (a 44 px target), no second form", () => {
    const html = inLocale(locale, createElement(LockedPrintNote, { t, resultHref: "/tools/mock-tests/neet-sample/result?attempt=a1" }));
    expect(html).toContain(esc(t.gate.printLocked));
    expect(html).toContain(`href="${locale === "hi" ? "/hi" : ""}/tools/mock-tests/neet-sample/result?attempt=a1"`);
    expect(html).toMatch(/<a[^>]*class="[^"]*min-h-11/);
    expect(html).not.toMatch(/min-h-9/);
    expect(html).not.toMatch(/<form[\s>]/);
  });

  it("optional mode: the result page says the test is kept and that sharing is a choice", () => {
    const view = createElement(OptionalContactStep, { t, onUnlocked: () => undefined });
    const html = inLocale(locale, createElement(MocktestLeadGateMessages, { messages: tGate }, view));
    expect(html).toContain(esc(t.gate.lockedTitle));
    expect(html).toContain(esc(t.gate.optionalBody));
    expect(html).not.toContain(esc(t.gate.lockedBody));
    // The form appears once the page-wide gate answers (never in the server render).
    expect(html).not.toMatch(/<form[\s>]/);
  });

  it("copy: the gate lines are translated, honest, and the list description is mode-agnostic", () => {
    for (const value of Object.values(t.gate)) {
      expect(value).not.toMatch(/verif|OTP sent|सत्यापित/i);
      if (locale === "hi") expect(value).toMatch(/[ऀ-ॿ]/);
    }
    expect(t.gate.startIntro).toContain("{n}");
    expect(t.list.description).toMatch(locale === "hi" ? /पूछा जा सकता है/ : /may be asked/);
  });
});

describe("the runner asks long tests at the start", () => {
  const source = readFileSync(path.join(process.cwd(), "src/components/mocktest/MockTestRunner.tsx"), "utf8");

  it("asks before the start request and the timer, and only for long tests", () => {
    const ask = source.indexOf("asksAtStart && !(await gate.requestAccess())");
    const startRequest = source.indexOf("await requestStartToken(test.id)");
    expect(ask).toBeGreaterThan(-1);
    expect(startRequest).toBeGreaterThan(ask);
    expect(source).toContain("gateAtStart(test.durationMinutes)");
    // Resuming an unfinished attempt never asks.
    expect(source).toMatch(/onClick=\{\(\) => start\(saved\)\}/);
  });

  it("auto-starts only after its own form; discloses the step up front from the live mode", () => {
    expect(source).toContain("if (startsAfterUnlock(pending, byThisHost)) void begin();");
    expect(source).toContain("<LeadGateNote messages={noteMessages} />");
    expect(startsAfterUnlock(true, true)).toBe(true);
    expect(startsAfterUnlock(true, false)).toBe(false);
    expect(startsAfterUnlock(false, true)).toBe(false);
  });

  it("fails open (plan §1.5): not enforced, and the escape after a failed send starts the test", () => {
    expect(source).toMatch(/useLeadGate\(\{\s*tool: "mock-test",\s*onUnlocked/);
    expect(source).not.toMatch(/enforced:\s*true/);
    expect(source).toContain("continueWithoutSaving: t.gate.startWithoutSaving");
    expect(source).toContain("messages={startFormMessages}");
  });

  it("focus goes to the reason for asking now, which comes right before the form", () => {
    expect(source).toContain("if (gate.gateOpen) introRef.current?.focus();");
    expect(source).toMatch(/<p ref=\{introRef\} tabIndex=\{-1\}/);
    expect(source).toMatch(/submitLabel=\{t\.gate\.startSubmit\}\s*focusOnMount=\{false\}/);
  });
});

describe("when sharing fails (school lab behind one IP, server trouble, paused) or the gate relaxes", () => {
  const HOST = "runner-host";

  function gateStore(submit: LeadGateSubmitOutcome, answer: { mode: "off" | "optional" | "required"; unlocked: boolean } = { mode: "required", unlocked: false }) {
    const deps: LeadGateStoreDeps = {
      fetchStatus: async () => {
        const status: LeadGateStatusOutcome = {
          kind: "ok",
          data: {
            mode: answer.mode,
            unlocked: answer.unlocked,
            via: answer.unlocked ? (answer.mode === "off" ? "off" : "pass") : null,
            recordsUse: false,
            expiresAt: null,
            sample: true,
          },
        };
        return status;
      },
      submit: async () => submit,
      forget: async () => null,
      sendUsage: async () => null,
      storage: () => null,
      now: () => Date.parse("2026-10-21T05:00:00Z"),
      online: () => true,
      listenStorage: () => () => undefined,
      schedule: () => undefined,
    };
    return new LeadGateStore(deps);
  }

  const FAILURES: LeadGateSubmitOutcome[] = [{ kind: "rate_limited", phone: false }, { kind: "server_error" }, { kind: "paused" }, { kind: "network" }];

  it.each(FAILURES)("$kind: nothing unlocks, and the start-anyway escape starts THIS test", async (outcome) => {
    const gate = gateStore(outcome);
    const events: LeadGateUnlockEvent[] = [];
    gate.onUnlock((event) => events.push(event));
    expect(await gate.ensure()).toBe(false);
    expect((await gate.submit({}, HOST)).kind).toBe(outcome.kind);
    expect(gate.getSnapshot().status).toBe("locked");
    expect(events).toEqual([]);
    // What the non-enforced form's escape button does (LeadGateForm `failedOpen`).
    gate.continueWithoutSaving(HOST);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ by: HOST, via: "unavailable" });
    expect(startsAfterUnlock(true, events[0].by === HOST)).toBe(true);
    // Nothing is recorded for this browser: the result page asks again.
    expect(gate.getSnapshot().recordsUse).toBe(false);
  });

  it("the locked result asks /score again once a status answer shows the gate relaxed (breaker → optional, or off)", async () => {
    for (const mode of ["optional", "off"] as const) {
      const gate = gateStore({ kind: "paused" }, { mode, unlocked: mode === "off" });
      gate.markRequired();
      expect(gateRelaxed(gate.getSnapshot())).toBe(false);
      await gate.refresh();
      // Optional: still locked here, but /score now answers. Off: the store opens (onUnlocked reloads).
      expect(gate.getSnapshot().status).toBe(mode === "off" ? "open" : "locked");
      expect(gateRelaxed(gate.getSnapshot())).toBe(mode === "optional");
    }
    // Still required: stay on the form.
    const required = gateStore({ kind: "paused" });
    required.markRequired();
    await required.refresh();
    expect(gateRelaxed(required.getSnapshot())).toBe(false);
  });
});
