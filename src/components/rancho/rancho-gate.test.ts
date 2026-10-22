import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { ASK_ENDPOINT } from "@/lib/ask/constants";
import { askRequestSchema } from "@/lib/ask/schema";

import { RanchoChatPanel } from "./RanchoChatPanel";
import { failureText } from "./RanchoTurn";
import { askRancho, buildAskBody } from "./rancho-chat";
import {
  heldQuestionInput,
  isGateFailure,
  RANCHO_GATE_IDLE,
  ranchoGateNotice,
  ranchoGatePreflight,
  ranchoGateReducer,
  ranchoGateUnlock,
  ranchoGateView,
  ranchoHoldAnnouncement,
  type RanchoGateState,
  type RanchoHeldQuestion,
} from "./rancho-gate";
import { elementHtml } from "./rancho-test-html";

/**
 * Rancho behind the lead gate (docs/lead-gate-plan.md §8.6 / §5.6): the gate 401 is recognised only
 * by its header; the held question is resent with its photo; it is resent automatically only once
 * and only after this chat's own form; a held question always has the form or "Send now" under it
 * (a model of the chat and the gate, through the pure transitions); the chat (Ask page, /rancho,
 * floating panel) wires them.
 */

const dir = join(process.cwd(), "src", "components", "rancho");
const read = (file: string) => readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n");

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const held = (patch: Partial<RanchoHeldQuestion> = {}): RanchoHeldQuestion => ({
  turnId: 3,
  question: "Find the maximum height.",
  subject: "physics",
  language: "en",
  photo: null,
  photoConsent: false,
  toolContext: null,
  spoken: false,
  autoResent: false,
  afterOwnPass: false,
  ...patch,
});

describe("the gate 401 from POST /api/ask", () => {
  it("is the failure kind 'gate' only with X-Lead-Gate: required (nothing else is shown for it)", async () => {
    const gate = vi.fn<typeof fetch>(async () =>
      jsonResponse(401, { ok: false, error: "unauthenticated", gate: "lead", message: "Share a contact number once." }, { "X-Lead-Gate": "required" }),
    );
    const answer = await askRancho({ question: "q", subject: "auto", language: "en" }, { signal: new AbortController().signal, fetchImpl: gate });
    expect(answer).toEqual({ text: "", stop: null, meta: null, failure: { kind: "gate" }, cards: [] });
    expect(isGateFailure(answer.failure)).toBe(true);
    // The chat holds the question and shows the form instead of an error line in Rancho's bubble.
    expect(failureText(answer.failure, messagesFor("en", "rancho").panel)).toBeNull();

    // Another 401 (no header, or another value) is not the gate.
    const otherHeaders: Record<string, string>[] = [{}, { "X-Lead-Gate": "optional" }];
    for (const headers of otherHeaders) {
      const other = await askRancho(
        { question: "q", subject: "auto", language: "en" },
        { signal: new AbortController().signal, fetchImpl: async () => jsonResponse(401, { ok: false, error: "unauthenticated", message: "x" }, headers) },
      );
      expect(other.failure).toEqual({ kind: "generic" });
      expect(isGateFailure(other.failure)).toBe(false);
    }
    expect(isGateFailure(null)).toBe(false);
    expect(isGateFailure({ kind: "limit" })).toBe(false);
  });
});

describe("a held question", () => {
  it("is sent again exactly as asked: text, subject, language, tool context, the photo and its consent", async () => {
    const photo = { mediaType: "image/jpeg" as const, base64: "AAAA", bytes: 3, previewUrl: "blob:x" };
    const question = held({ question: "", photo, photoConsent: true, language: "hi", toolContext: { tool: "predictor", summary: "JEE Main, score 180" } });
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(`${JSON.stringify({ t: "done", stop: "end_turn", meta: null })}\n`, { status: 200 }));
    await askRancho(heldQuestionInput(question), { signal: new AbortController().signal, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(ASK_ENDPOINT);
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      question: "",
      subject: "physics",
      language: "hi",
      image: { mediaType: "image/jpeg", data: "AAAA" },
      photoConsent: true,
      toolContext: { tool: "predictor", summary: "JEE Main, score 180" },
    });
    expect(askRequestSchema.safeParse(body).success).toBe(true);
    // Never the preview URL or the bookkeeping fields.
    expect(String(init?.body)).not.toMatch(/blob:|turnId|autoResent|afterOwnPass|spoken/);
  });

  it("without a photo sends no photo fields", () => {
    const body = buildAskBody(heldQuestionInput(held({ photoConsent: true })));
    expect(body).toEqual({ question: "Find the maximum height.", subject: "physics", language: "en" });
  });
});

describe("before a question is sent", () => {
  it.each([
    // The page's gate is locked: its form is already open.
    [false, "gate_required", null, "wait"],
    [false, "gate_optional", null, "wait"],
    [false, undefined, null, "wait"],
    // Open (off, signed in, details shared, a remembered skip): send; the server still decides.
    [true, "open", "pass", "send"],
    [true, "gate_required", "pass", "send"],
    [true, undefined, "session", "send"],
    [true, "gate_optional", "skipped", "send"],
    // The gate's status couldn't be read (fail-open) and /api/ask already said "required": hold, don't send.
    [true, "gate_required", "unavailable", "require"],
    // Fail-open with no or another answer from /api/ask: send (the server's 401 would still hold it).
    [true, undefined, "unavailable", "send"],
    [true, "gate_optional", "unavailable", "send"],
    [true, "open", "unavailable", "send"],
  ] as const)("allowed=%s, access=%s, via=%s → %s", (allowed, access, via, expected) => {
    expect(ranchoGatePreflight({ allowed, access, via })).toBe(expected);
  });
});

describe("after the gate opens while a question waits", () => {
  it("resends automatically once, only when this chat's own form opened it; otherwise offers Send now", () => {
    const own = { byThisHost: true, via: "pass" } as const;
    const elsewhere = { byThisHost: false, via: "pass" } as const;
    expect(ranchoGateUnlock(held(), own)).toEqual({ action: "resend", question: held({ autoResent: true, afterOwnPass: true }) });
    expect(ranchoGateUnlock(held(), elsewhere)).toEqual({ action: "offer", question: held() }); // another tab or tool
    // Refused again after the automatic resend: the next unlock by this form offers Send now (no loop).
    expect(ranchoGateUnlock(held({ autoResent: true }), own)).toEqual({ action: "offer", question: held({ autoResent: true, afterOwnPass: true }) });
    expect(ranchoGateUnlock(held({ autoResent: true, afterOwnPass: true }), elsewhere).question.afterOwnPass).toBe(false);
    // "Continue without sharing" (optional mode) is this chat's own unlock, but no pass: no "didn't keep it" later.
    expect(ranchoGateUnlock(held(), { byThisHost: true, via: "skipped" })).toEqual({ action: "resend", question: held({ autoResent: true }) });
  });
});

describe("the chat's lead-gate state (ranchoGateReducer, ranchoGateView, ranchoGateNotice)", () => {
  it("holds, offers Send now, and lets go on send or New chat", () => {
    const question = held();
    const holding = ranchoGateReducer(RANCHO_GATE_IDLE, { type: "hold", question, gateIsOpen: false });
    expect(holding).toEqual({ held: question, ready: false });
    expect(ranchoGateView(holding, true)).toBe("form");
    // The gate already opened again in that instant (another tab): Send now at once.
    const racing = ranchoGateReducer(RANCHO_GATE_IDLE, { type: "hold", question, gateIsOpen: true });
    expect(ranchoGateView(racing, false)).toBe("ready");
    const offered = ranchoGateReducer(holding, { type: "offer", question: { ...question, afterOwnPass: true } });
    expect(offered).toEqual({ held: { ...question, afterOwnPass: true }, ready: true });
    expect(ranchoGateView(offered, false)).toBe("ready");
    // An offer for another (dropped) question changes nothing.
    expect(ranchoGateReducer(holding, { type: "offer", question: held({ turnId: 9 }) })).toBe(holding);
    expect(ranchoGateReducer(RANCHO_GATE_IDLE, { type: "offer", question })).toBe(RANCHO_GATE_IDLE);
    expect(ranchoGateReducer(offered, { type: "send" })).toBe(RANCHO_GATE_IDLE);
    expect(ranchoGateReducer(holding, { type: "drop" })).toBe(RANCHO_GATE_IDLE);
    expect(ranchoGateView(RANCHO_GATE_IDLE, true)).toBeNull();
  });

  it("says the browser didn't keep the pass only above the form, after this chat's own pass", () => {
    const after = ranchoGateReducer(RANCHO_GATE_IDLE, { type: "hold", question: held({ autoResent: true, afterOwnPass: true }), gateIsOpen: false });
    expect(ranchoGateNotice(after, ranchoGateView(after, true))).toBe("notKept");
    expect(ranchoGateNotice(after, "ready")).toBeNull();
    const first = ranchoGateReducer(RANCHO_GATE_IDLE, { type: "hold", question: held(), gateIsOpen: false });
    expect(ranchoGateNotice(first, "form")).toBeNull(); // a first refusal (or a stale hint) is not that
  });

  it("announces the form for the gate's mode, 'didn't keep it' after a pass, or that it is ready", () => {
    expect(ranchoHoldAnnouncement(held(), { gateIsOpen: false, mode: "required" })).toBe("formShown");
    expect(ranchoHoldAnnouncement(held(), { gateIsOpen: false, mode: null })).toBe("formShown");
    // Optional mode (or required, degraded by the flood breaker): the form offers "Continue without sharing".
    expect(ranchoHoldAnnouncement(held(), { gateIsOpen: false, mode: "optional" })).toBe("formShownOptional");
    expect(ranchoHoldAnnouncement(held({ afterOwnPass: true }), { gateIsOpen: false, mode: "required" })).toBe("notKept");
    expect(ranchoHoldAnnouncement(held({ afterOwnPass: true }), { gateIsOpen: true, mode: "required" })).toBe("unlocked");
  });

  /**
   * A model of the chat and the page's gate (useLeadGate: `gateOpen` = this chat asked and the store
   * has not opened since), driven only through the pure transitions above. Every reachable state is
   * explored: a held question always has the form or "Send now" under it once the chat has handled
   * the event, and a question is resent automatically at most once.
   */
  it("never leaves a held question with nothing to press, and never resends automatically twice", () => {
    interface Model {
      chat: RanchoGateState;
      /** useLeadGate().gateOpen for this chat. */
      gateOpen: boolean;
      storeOpen: boolean;
      autoResends: number;
      nextTurn: number;
    }
    type Via = "pass" | "skipped";
    const start: Model = { chat: RANCHO_GATE_IDLE, gateOpen: false, storeOpen: false, autoResends: 0, nextTurn: 1 };
    const hold = (m: Model, question: RanchoHeldQuestion): Model => ({
      ...m,
      chat: ranchoGateReducer(m.chat, { type: "hold", question, gateIsOpen: false }),
      gateOpen: true,
      storeOpen: false,
    });
    /** A question goes to the gate and the server: answered when the store is open and `serverOk`, else held. */
    const send = (m: Model, question: RanchoHeldQuestion, serverOk: boolean): Model =>
      m.storeOpen && serverOk ? { ...m, chat: RANCHO_GATE_IDLE, gateOpen: false } : hold({ ...m, chat: RANCHO_GATE_IDLE }, question);
    const unlock = (m: Model, byThisHost: boolean, via: Via, serverOk: boolean): Model => {
      const opened: Model = { ...m, storeOpen: true, gateOpen: false };
      if (!m.gateOpen || !m.chat.held) return opened; // the chat wasn't waiting: no onUnlocked for it
      const next = ranchoGateUnlock(m.chat.held, { byThisHost, via });
      if (next.action === "offer") return { ...opened, chat: ranchoGateReducer(m.chat, { type: "offer", question: next.question }) };
      const sent = { ...opened, chat: ranchoGateReducer(m.chat, { type: "send" }), autoResends: m.autoResends + 1 };
      return send(sent, next.question, serverOk);
    };

    const steps = (m: Model): Model[] => {
      const view = ranchoGateView(m.chat, m.gateOpen);
      const out: Model[] = [];
      for (const serverOk of [true, false]) {
        if (!m.chat.held) {
          // A new question (the composer is enabled only without a held one).
          const question = held({ turnId: m.nextTurn });
          const asked = { ...m, nextTurn: m.nextTurn + 1, autoResends: 0 };
          out.push(m.storeOpen ? send(asked, question, serverOk) : hold(asked, question));
        }
        for (const via of ["pass", "skipped"] as const) {
          if (view === "form") out.push(unlock(m, true, via, serverOk)); // this chat's form
          if (!m.storeOpen) out.push(unlock(m, false, via, serverOk)); // another tab or tool
        }
        if (view === "ready" && m.chat.held) out.push(send({ ...m, chat: ranchoGateReducer(m.chat, { type: "send" }) }, m.chat.held, serverOk));
      }
      if (m.storeOpen) out.push({ ...m, storeOpen: false }); // "Not you?" elsewhere, or another tool's gate 401
      out.push({ ...m, chat: ranchoGateReducer(m.chat, { type: "drop" }), gateOpen: false }); // New chat
      return out;
    };

    const seen = new Set<string>();
    let frontier = [start];
    for (let depth = 0; depth < 8 && frontier.length > 0; depth += 1) {
      const next: Model[] = [];
      for (const model of frontier) {
        for (const after of steps(model)) {
          const view = ranchoGateView(after.chat, after.gateOpen);
          if (after.chat.held) expect(view, JSON.stringify(after)).not.toBeNull();
          expect(after.autoResends).toBeLessThanOrEqual(1);
          if (ranchoGateNotice(after.chat, view) === "notKept") expect(after.chat.held?.afterOwnPass).toBe(true);
          const key = JSON.stringify({ ...after, nextTurn: 0, chat: { ...after.chat, held: after.chat.held && { ...after.chat.held, turnId: 0 } } });
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(after);
        }
      }
      frontier = next;
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe("the chat's wiring (RanchoChat: Ask page, /rancho and the floating panel)", () => {
  const chat = read("RanchoChat.tsx");
  const between = (from: string, to: string) => chat.slice(chat.indexOf(from), chat.indexOf(to, chat.indexOf(from)));

  it("uses the page's gate for Rancho (enforced) through the pure transitions, asking it before every POST", () => {
    expect(chat).toMatch(/useLeadGate\(\{\n\s*tool: "ask",\n\s*enforced: true,/);
    for (const helper of ["ranchoGateUnlock(", "ranchoGateReducer(", "ranchoGateView(", "ranchoGateNotice(", "ranchoHoldAnnouncement(", "ranchoGatePreflight("]) {
      expect(chat, helper).toContain(helper);
    }
    const ask = between("async function ask(", "function stop()");
    expect(ask.indexOf("await gate.requestAccess()")).toBeGreaterThan(-1);
    expect(ask.indexOf("await gate.requestAccess()")).toBeLessThan(ask.indexOf("await askRancho("));
    // The gate 401 holds the question before any other failure is handled.
    expect(ask.indexOf("if (isGateFailure(failure))")).toBeLessThan(ask.indexOf('failure?.kind === "not_configured"'));
  });

  it("renders the compact, enforced form in the conversation (never inside the composer's form)", () => {
    const log = between("const log = (", "const blockedNotice");
    expect(log).toMatch(/<LeadGateForm\s+\{\.\.\.gate\.formProps\}\s+messages=\{tg\}\s+variant="compact"/);
    expect(log.indexOf("<LeadGateForm")).toBeGreaterThan(log.indexOf("</ol>"));
    expect(between("const composer = (", "const footer = (")).not.toContain("LeadGate");
  });

  it("passes the leadGate strings from the server to every Rancho chat", () => {
    expect(read("RanchoDock.tsx")).toContain('getMessages("leadGate")');
    expect(read("RanchoLauncher.tsx")).toContain("gateMessages={gateMessages}");
    const app = join(process.cwd(), "src", "app", "[lang]", "(site)");
    for (const page of [join(app, "tools", "ask", "page.tsx"), join(app, "rancho", "page.tsx")]) {
      const source = readFileSync(page, "utf8");
      expect(source, page).toContain('getMessages("leadGate")');
      expect(source, page).toMatch(/<AskAspire\s+messages=\{\w+\}\s+gateMessages=\{\w+\}/);
    }
  });
});

describe("the static chat (server render)", () => {
  it.each(["en", "hi"] as const)("has no contact form, note or 'Not you?' before the browser asks (%s)", (locale: Locale) => {
    const html = renderToStaticMarkup(
      createElement(
        LocaleProvider,
        { locale } as ComponentProps<typeof LocaleProvider>,
        createElement(RanchoChatPanel, {
          id: "rancho-panel",
          open: false,
          onClose: () => {},
          messages: messagesFor(locale, "rancho").panel,
          gateMessages: messagesFor(locale, "leadGate"),
          locale,
          links: { ask: "/tools/ask", enquiry: "/admissions#enquiry", privacy: "/privacy", signIn: "/login" },
        }),
      ),
    );
    const gate = messagesFor(locale, "leadGate");
    expect(html).not.toContain("data-rancho-gate");
    expect(html).not.toContain("data-lead-gate");
    expect(html).not.toContain(gate.note.required.replace(/'/g, "&#x27;"));
    expect(html).not.toContain(gate.identity.notYou);
    // The composer is enabled until a question is held.
    const form = elementHtml(html, /<form [^>]*data-rancho-composer=""/, "form");
    expect(form).not.toMatch(/\sdisabled=""/);
  });
});

describe("gate copy (rancho.panel.gate, en + hi)", () => {
  it("says the question waits and offers Send now, without promising an answer or naming OTP / verification", () => {
    for (const locale of ["en", "hi"] as const) {
      const t = messagesFor(locale, "rancho").panel.gate;
      for (const text of Object.values(t)) {
        expect(text.trim()).not.toBe("");
        expect(text).not.toMatch(/OTP|verif|सत्यापित/i);
      }
    }
    const en = messagesFor("en", "rancho").panel.gate;
    expect(en.sendNow).toBe("Send now");
    expect(en.formShown).toMatch(/contact number once/);
    // Optional mode doesn't say the number is needed; "didn't keep it" names the likely cause and a way out.
    expect(en.formShownOptional).toMatch(/or continue without it/);
    expect(en.notKept).toMatch(/cookies/i);
    // Signing in is no way out any more (owner decision 22 Oct 2026: accounts are asked too).
    expect(en.notKept).not.toMatch(/sign in/i);
    expect(messagesFor("hi", "rancho").panel.gate.notKept).not.toMatch(/साइन इन/);
    expect(messagesFor("hi", "rancho").panel.gate.notKept).toMatch(/कुकीज़/);
    // The Ask page uses the same strings (ask.chat = rancho.panel).
    expect(messagesFor("hi", "ask").chat.gate).toEqual(messagesFor("hi", "rancho").panel.gate);
  });

  it("keeps the static privacy notes true whatever the gate's mode (plan §11.4: 'may be asked')", () => {
    const en = messagesFor("en", "ask").honest.items.privacy;
    // Owner decision 22 Oct 2026: signed-in accounts are asked too (only one with a mobile on file skips; none has one yet).
    expect(en).toMatch(/may be asked once for a contact number \(even if you're signed in\)/);
    expect(en).toMatch(/never your questions, photos or answers/);
    expect(en).not.toMatch(/no sign-up|nothing is stored/i);
    const hi = messagesFor("hi", "ask").honest.items.privacy;
    expect(hi).toMatch(/संपर्क नंबर पूछा जा सकता है \(साइन इन होने पर भी\)/);
    // "Don't type names" is about the question (the contact form asks for a name on purpose).
    expect(messagesFor("en", "rancho").panel.privacy).toMatch(/^Don't type names or personal details in your question\./);
    expect(messagesFor("hi", "rancho").panel.privacy).toMatch(/^अपने सवाल में नाम/);
  });
});
