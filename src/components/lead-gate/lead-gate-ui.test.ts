import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { LEAD_GATE_CONSENT_VERSION, LEAD_GATE_ERRORS, type LeadGateStatusData } from "@/lib/lead-gate/contract";

import { fetchLeadGateStatus, forgetLeadGate, sendLeadGateUsage, submitLeadGate } from "./lead-gate-client";
import {
  buildLeadGatePayload,
  leadGateContextFrom,
  localizeLeadGateError,
  validateLeadGatePayload,
} from "./lead-gate-form-model";
import { HINT_KEY, HINT_MAX_AGE_MS, LeadGateStore, SKIP_KEY, type LeadGateState, type LeadGateStoreDeps } from "./lead-gate-store";
import { LeadGateForm } from "./LeadGateForm";
import { LeadGateIdentity } from "./LeadGateIdentity";
import { LeadGateNote } from "./LeadGateNote";
import { useLeadGate } from "./use-lead-gate";

const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const LOCKED: LeadGateStatusData = { mode: "required", unlocked: false, via: null, recordsUse: false, expiresAt: null };
const PASS: LeadGateStatusData = { mode: "required", unlocked: true, via: "pass", recordsUse: true, expiresAt: new Date(NOW + 180 * 864e5).toISOString() };

function fakeDeps(overrides: Partial<LeadGateStoreDeps> = {}) {
  const map = new Map<string, string>();
  let onKey: ((key: string | null) => void) | null = null;
  const deps: LeadGateStoreDeps = {
    fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data: LOCKED })),
    submit: vi.fn(async () => ({ kind: "unlocked" as const, data: { unlocked: true as const, via: "pass" as const, recordsUse: true, expiresAt: PASS.expiresAt } })),
    forget: vi.fn(async () => ({ forgotten: true as const, withdrawn: false })),
    sendUsage: vi.fn(async () => ({ recorded: true })),
    storage: () => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key) }),
    now: () => NOW,
    online: () => true,
    listenStorage: (callback) => {
      onKey = callback;
      return () => {
        onKey = null;
      };
    },
    ...overrides,
  };
  return { deps, map, fireStorage: (key: string | null) => onKey?.(key) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("LeadGateStore", () => {
  it("unknown → checking → locked with ONE request for concurrent callers", async () => {
    const { deps } = fakeDeps();
    const store = new LeadGateStore(deps);
    expect(store.getSnapshot().status).toBe("unknown");
    const both = Promise.all([store.ensure(), store.ensure()]);
    expect(store.getSnapshot().status).toBe("checking");
    expect(await both).toEqual([false, false]);
    expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ status: "locked", mode: "required", via: null });
    expect(await store.ensure()).toBe(false);
    expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("a confirmed pass opens and leaves a short-lived, data-free hint that the next page uses without a request", async () => {
    const { deps, map } = fakeDeps({ fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data: PASS })) });
    const store = new LeadGateStore(deps);
    expect(await store.ensure()).toBe(true);
    expect(store.getSnapshot()).toMatchObject({ status: "open", via: "pass", recordsUse: true, unlockSeq: 1 });
    const hint = JSON.parse(map.get(HINT_KEY) ?? "{}");
    expect(hint).toEqual({ until: NOW + HINT_MAX_AGE_MS, recordsUse: true, mode: "required" });

    const next = new LeadGateStore({ ...deps, fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data: LOCKED })) });
    expect(await next.ensure()).toBe(true);
    expect(next.getSnapshot().via).toBe("pass");
  });

  it("ignores an expired, corrupt or implausible hint, and survives storage that throws", async () => {
    for (const raw of [JSON.stringify({ until: NOW - 1, mode: "required" }), "{oops", JSON.stringify({ until: NOW + 10 * HINT_MAX_AGE_MS, mode: "required" }), JSON.stringify({ until: NOW + 1000, mode: "nope" })]) {
      const { deps, map } = fakeDeps();
      map.set(HINT_KEY, raw);
      expect(await new LeadGateStore(deps).ensure(), raw).toBe(false);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
    }
    const throwing = fakeDeps({
      storage: () => ({
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      }),
      fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data: PASS })),
    });
    expect(await new LeadGateStore(throwing.deps).ensure()).toBe(true);
  });

  it("fails OPEN for browser-only tools when the server cannot answer or the device is offline (records nothing)", async () => {
    const failed = new LeadGateStore(fakeDeps({ fetchStatus: vi.fn(async () => ({ kind: "failed" as const })) }).deps);
    expect(await failed.ensure()).toBe(true);
    expect(failed.getSnapshot()).toMatchObject({ status: "open", via: "unavailable", recordsUse: false });

    const offline = fakeDeps({ online: () => false });
    const store = new LeadGateStore(offline.deps);
    expect(await store.ensure()).toBe(true);
    expect(store.getSnapshot().via).toBe("unavailable");
    expect(offline.deps.fetchStatus).not.toHaveBeenCalled();
  });

  it("submit: opens at once, tells unlock listeners who did it, and writes the hint only once the server confirms the pass", async () => {
    const confirmed = fakeDeps();
    confirmed.deps.fetchStatus = vi.fn().mockResolvedValueOnce({ kind: "ok", data: LOCKED }).mockResolvedValueOnce({ kind: "ok", data: PASS });
    const store = new LeadGateStore(confirmed.deps);
    await store.ensure();
    const events: unknown[] = [];
    store.onUnlock((event) => events.push(event));
    const outcome = await store.submit({ any: "payload" }, "host-1");
    expect(outcome.kind).toBe("unlocked");
    expect(store.getSnapshot()).toMatchObject({ status: "open", via: "pass", unlockSeq: 1 });
    expect(events).toEqual([{ seq: 1, by: "host-1", via: "pass" }]);
    await flush();
    expect(confirmed.map.has(HINT_KEY)).toBe(true);

    // Honeypot / blocked cookie: the server does not confirm → no hint; this page stays open.
    const unconfirmed = fakeDeps();
    const other = new LeadGateStore(unconfirmed.deps);
    await other.ensure();
    await other.submit({}, null);
    await flush();
    expect(unconfirmed.map.has(HINT_KEY)).toBe(false);
    expect(other.getSnapshot().status).toBe("open");
  });

  it("a failed submit changes nothing", async () => {
    const { deps } = fakeDeps({ submit: vi.fn(async () => ({ kind: "server_error" as const })) });
    const store = new LeadGateStore(deps);
    await store.ensure();
    expect((await store.submit({}, "h")).kind).toBe("server_error");
    expect(store.getSnapshot().status).toBe("locked");
  });

  it("markRequired (the gate 401) drops a stale hint and locks", async () => {
    const { deps, map } = fakeDeps();
    map.set(HINT_KEY, JSON.stringify({ until: NOW + 1000, recordsUse: true, mode: "required" }));
    const store = new LeadGateStore(deps);
    expect(await store.ensure()).toBe(true);
    store.markRequired();
    expect(store.getSnapshot()).toMatchObject({ status: "locked", mode: "required" });
    expect(map.has(HINT_KEY)).toBe(false);
  });

  it("skip works only in optional mode and is remembered (no nagging)", async () => {
    const required = new LeadGateStore(fakeDeps().deps);
    await required.ensure();
    required.skip("h");
    expect(required.getSnapshot().status).toBe("locked");

    const optional = fakeDeps({ fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data: { ...LOCKED, mode: "optional" as const } })) });
    const store = new LeadGateStore(optional.deps);
    expect(await store.ensure()).toBe(false);
    store.skip("h");
    expect(store.getSnapshot()).toMatchObject({ status: "open", via: "skipped" });
    expect(optional.map.has(SKIP_KEY)).toBe(true);
    const nextPage = new LeadGateStore({ ...optional.deps, fetchStatus: vi.fn() });
    expect(await nextPage.ensure()).toBe(true);
    expect(nextPage.getSnapshot().via).toBe("skipped");
  });

  it("forget clears hint and skip, passes `withdraw`, and asks again next time", async () => {
    const { deps, map } = fakeDeps({ fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data: PASS })) });
    const store = new LeadGateStore(deps);
    await store.ensure();
    map.set(SKIP_KEY, "{}");
    expect(await store.forget({ withdraw: true })).toEqual({ forgotten: true, withdrawn: false });
    expect(deps.forget).toHaveBeenCalledWith(true);
    expect(map.has(HINT_KEY)).toBe(false);
    expect(map.has(SKIP_KEY)).toBe(false);
    expect(store.getSnapshot()).toMatchObject({ status: "unknown", via: null });
  });

  it("recordUse: only for a pass that records use; a `no_pass` answer forgets the stale hint", async () => {
    const quiet = fakeDeps();
    const locked = new LeadGateStore(quiet.deps);
    await locked.ensure();
    locked.recordUse({ tool: "predictor", exam: "jee-main" });
    expect(quiet.deps.sendUsage).not.toHaveBeenCalled();

    const { deps, map } = fakeDeps({ sendUsage: vi.fn(async () => ({ recorded: false, reason: "no_pass" as const })) });
    map.set(HINT_KEY, JSON.stringify({ until: NOW + 1000, recordsUse: true, mode: "required" }));
    const store = new LeadGateStore(deps);
    await store.ensure();
    store.recordUse({ tool: "predictor", exam: "jee-main", band: "score-180-189" });
    expect(deps.sendUsage).toHaveBeenCalledWith({ tool: "predictor", exam: "jee-main", band: "score-180-189" });
    await flush();
    expect(map.has(HINT_KEY)).toBe(false);
    expect(store.getSnapshot().status).toBe("unknown");
  });

  it("another tab's unlock opens this page (storage event)", async () => {
    const { deps, map, fireStorage } = fakeDeps();
    const store = new LeadGateStore(deps);
    const unsubscribe = store.subscribe(() => undefined);
    await store.ensure();
    map.set(HINT_KEY, JSON.stringify({ until: NOW + 1000, recordsUse: false, mode: "required" }));
    fireStorage(HINT_KEY);
    expect(store.getSnapshot()).toMatchObject({ status: "open", via: "pass" });
    unsubscribe();
  });
});

describe("transport", () => {
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }));

  it("parses the status defensively", async () => {
    expect(await fetchLeadGateStatus(json(200, { ok: true, data: PASS }))).toEqual({ kind: "ok", data: PASS });
    expect(await fetchLeadGateStatus(json(200, { ok: true, data: { mode: "loud" } }))).toEqual({ kind: "failed" });
    expect(await fetchLeadGateStatus(json(429, { ok: false, error: "rate_limited", message: "x" }))).toEqual({ kind: "failed" });
    expect(await fetchLeadGateStatus(vi.fn(async () => Promise.reject(new TypeError("offline"))))).toEqual({ kind: "failed" });
  });

  it("maps every submit outcome", async () => {
    const unlocked = { ok: true, data: { unlocked: true, via: "pass", recordsUse: true, expiresAt: PASS.expiresAt } };
    expect((await submitLeadGate({}, json(201, unlocked))).kind).toBe("unlocked");
    expect(await submitLeadGate({}, json(422, { ok: false, error: "validation", message: "x", fieldErrors: { phone: ["bad"] } }))).toEqual({
      kind: "validation",
      fieldErrors: { phone: ["bad"] },
    });
    expect(await submitLeadGate({}, json(429, { ok: false, error: "rate_limited", message: "x" }, { "X-Lead-Gate-Limit": "phone" }))).toEqual({
      kind: "rate_limited",
      phone: true,
    });
    expect(await submitLeadGate({}, json(429, {}))).toEqual({ kind: "rate_limited", phone: false });
    expect((await submitLeadGate({}, json(503, { ok: false, error: "not_configured", message: "x" }))).kind).toBe("paused");
    expect((await submitLeadGate({}, json(403, { ok: false, error: "forbidden", message: "x" }))).kind).toBe("rejected");
    expect((await submitLeadGate({}, json(500, { ok: false, error: "server_error", message: "x" }))).kind).toBe("server_error");
    expect((await submitLeadGate({}, json(201, { ok: true, data: {} }))).kind).toBe("server_error");
    expect((await submitLeadGate({}, vi.fn(async () => Promise.reject(new TypeError("offline"))))).kind).toBe("network");
  });

  it("forget and usage return null on any failure", async () => {
    const forgetFetch = json(200, { ok: true, data: { forgotten: true, withdrawn: true } });
    expect(await forgetLeadGate(true, forgetFetch)).toEqual({ forgotten: true, withdrawn: true });
    expect(forgetFetch).toHaveBeenCalledWith("/api/lead-gate?withdraw=1", expect.objectContaining({ method: "DELETE" }));
    expect(await forgetLeadGate(false, json(500, {}))).toBeNull();
    const usageFetch = json(200, { ok: true, data: { recorded: false, reason: "no_pass" } });
    expect(await sendLeadGateUsage({ tool: "planner", exam: "neet" }, usageFetch)).toEqual({ recorded: false, reason: "no_pass" });
    expect(usageFetch).toHaveBeenCalledWith("/api/lead-gate/usage", expect.objectContaining({ keepalive: true, method: "POST" }));
    expect(await sendLeadGateUsage({ tool: "planner", exam: "neet" }, vi.fn(async () => Promise.reject(new Error("x"))))).toBeNull();
  });
});

describe("form model", () => {
  function formData(entries: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  }

  it("builds the exact request body (consent from the tick, honeypot forwarded)", () => {
    const body = buildLeadGatePayload(
      formData({ studentName: "Asha", phone: "9810012345", currentClass: "class-12", submittedBy: "student", consent: "on", consentVersion: LEAD_GATE_CONSENT_VERSION, website: "" }),
      "mock-test",
      { tool: "mock-test", page: "/tools/mock-tests" },
    );
    expect(body).toEqual({
      studentName: "Asha",
      phone: "9810012345",
      currentClass: "class-12",
      submittedBy: "student",
      consent: true,
      consentVersion: LEAD_GATE_CONSENT_VERSION,
      tool: "mock-test",
      website: "",
      context: { tool: "mock-test", page: "/tools/mock-tests" },
    });
    expect(buildLeadGatePayload(formData({}), "ask", undefined)).toMatchObject({ consent: false, studentName: "" });
  });

  it("validates with the contract and flags a stale consent version separately", () => {
    const empty = buildLeadGatePayload(formData({ consentVersion: LEAD_GATE_CONSENT_VERSION }), "ask", undefined);
    expect(validateLeadGatePayload(empty)).toEqual({
      ok: false,
      fieldErrors: {
        studentName: LEAD_GATE_ERRORS.studentName,
        phone: LEAD_GATE_ERRORS.phone,
        currentClass: LEAD_GATE_ERRORS.currentClass,
        submittedBy: LEAD_GATE_ERRORS.submittedBy,
        consent: LEAD_GATE_ERRORS.consent,
      },
    });
    const valid = { studentName: "Asha", phone: "9810012345", currentClass: "class-12", submittedBy: "parent", consent: true, consentVersion: LEAD_GATE_CONSENT_VERSION, tool: "ask" };
    expect(validateLeadGatePayload(valid)).toEqual({ ok: true });
    expect(validateLeadGatePayload({ ...valid, consentVersion: "old" })).toEqual({ ok: false, staleConsent: true });
  });

  it("localises errors by field (the implausible-number message keeps its own text)", () => {
    const hi = messagesFor("hi", "leadGate").errors;
    expect(localizeLeadGateError("phone", LEAD_GATE_ERRORS.phoneImplausible, hi)).toBe(hi.phoneImplausible);
    expect(localizeLeadGateError("phone", LEAD_GATE_ERRORS.phone, hi)).toBe(hi.phone);
    expect(localizeLeadGateError("studentName", LEAD_GATE_ERRORS.studentNameTooLong, hi)).toBe(hi.studentNameTooLong);
    expect(localizeLeadGateError("other", "x", hi)).toBe(hi.generic);
  });

  it("attribution: the gate's tool wins; exam + band only for the predictor, and only valid ones", () => {
    const base = { page: "/tools/ask", utm_source: "insta", tool: "predictor" as const, toolExam: "jee-main", toolBand: "score-1-2" };
    expect(leadGateContextFrom(base, "ask")).toEqual({ page: "/tools/ask", utm_source: "insta", tool: "ask" });
    expect(leadGateContextFrom(undefined, "predictor", { exam: "neet", band: "score-600-609" })).toEqual({ tool: "predictor", toolExam: "neet", toolBand: "score-600-609" });
    expect(leadGateContextFrom(undefined, "predictor", { exam: "neet", band: "612" })).toEqual({ tool: "predictor", toolExam: "neet" });
  });
});

describe("components (static render)", () => {
  function render(locale: Locale, element: ReturnType<typeof createElement>): string {
    const Provider = LocaleProvider as FunctionComponent<{ locale: Locale; children?: ReactNode }>;
    return renderToStaticMarkup(createElement(Provider, { locale }, element));
  }

  /** A store whose server snapshot is `state` (what a static render sees). */
  function storeWith(state: Partial<LeadGateState>): LeadGateStore {
    const store = new LeadGateStore(fakeDeps().deps);
    const snapshot = { ...store.getServerSnapshot(), ...state };
    store.getServerSnapshot = () => snapshot;
    return store;
  }

  const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

  it.each(["en", "hi"] as const)("%s: LeadGateForm has visible labels, required state, an unticked consent with its version, a honeypot, one form", (locale) => {
    const t = messagesFor(locale, "leadGate");
    const html = render(locale, createElement(LeadGateForm, { tool: "predictor", messages: t, focusOnMount: false }));
    for (const label of [t.heading, t.fields.studentName, t.fields.phone, t.fields.currentClass, t.fields.submittedBy, t.fields.student, t.fields.parent, t.submit.predictor, t.signInLink]) {
      expect(html, label).toContain(esc(label));
    }
    expect(html.match(/<form\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h2 id="[^"]+" tabindex="-1"/);
    expect(html).toMatch(/<section aria-labelledby="[^"]+"/);
    expect(html.match(/aria-required="true"/g)?.length).toBeGreaterThanOrEqual(4); // name, phone, class, consent
    expect(html).toContain(`<input type="hidden" name="consentVersion" value="${LEAD_GATE_CONSENT_VERSION}"/>`);
    const consentTag = html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0] ?? "";
    expect(consentTag).toContain('name="consent"');
    expect(consentTag).not.toMatch(/checked/i);
    expect(html).toMatch(/name="website"[^>]*tabindex="-1"|tabindex="-1"[^>]*name="website"/i);
    expect(html).toMatch(/<fieldset role="radiogroup" aria-required="true"/);
    expect(html).toContain("<legend");
    expect(html.match(/<input type="radio"[^>]*name="submittedBy"/g)).toHaveLength(2);
    expect(html).not.toMatch(/checked=""/);
    expect(html).toContain(`href="${locale === "hi" ? "/hi/privacy" : "/privacy"}"`);
    expect(html).toContain(`href="${locale === "hi" ? "/hi/login" : "/login"}"`);
    expect(html).toContain('role="status"');
    expect(html).not.toContain(esc(t.skip)); // mode unknown: no skip
    expect(html).not.toContain(esc(t.continueWithoutSaving));
  });

  it("offers “Continue without sharing” only in optional mode", () => {
    const t = messagesFor("en", "leadGate");
    const html = render("en", createElement(LeadGateForm, { tool: "ask", messages: t, store: storeWith({ mode: "optional" }), headingLevel: 3, variant: "compact" }));
    expect(html).toContain(t.skip);
    expect(html).toContain(t.submit.ask);
    expect(html).toMatch(/<h3 id=/);
    const required = render("en", createElement(LeadGateForm, { tool: "ask", messages: t, store: storeWith({ mode: "required" }) }));
    expect(required).not.toContain(t.skip);
  });

  it("LeadGateNote follows the live mode and hides once satisfied", () => {
    const t = messagesFor("en", "leadGate");
    expect(render("en", createElement(LeadGateNote, { messages: t, store: storeWith({}) }))).toBe("");
    expect(render("en", createElement(LeadGateNote, { messages: t, store: storeWith({ mode: "required", status: "locked" }) }))).toContain(esc(t.note.required));
    expect(render("en", createElement(LeadGateNote, { messages: t, store: storeWith({ mode: "optional", status: "locked" }) }))).toContain(esc(t.note.optional));
    for (const via of ["pass", "session", "off"] as const) {
      expect(render("en", createElement(LeadGateNote, { messages: t, store: storeWith({ mode: "required", status: "open", via }) }))).toBe("");
    }
  });

  it("LeadGateIdentity shows no name, only for this browser's pass, with “Not you?” and stop-contact", () => {
    const t = messagesFor("hi", "leadGate");
    expect(render("hi", createElement(LeadGateIdentity, { messages: t, store: storeWith({ status: "open", via: "session" }) }))).toBe("");
    const html = render("hi", createElement(LeadGateIdentity, { messages: t, store: storeWith({ status: "open", via: "pass", recordsUse: true }) }));
    expect(html).toContain(t.identity.shared);
    expect(html).toContain(t.identity.recordsUse);
    expect(html).toContain(t.identity.notYou);
    expect(html).toContain(t.identity.stopContact);
  });

  it("useLeadGate starts closed and binds the form to its host", () => {
    let captured: ReturnType<typeof useLeadGate> | null = null;
    const store = storeWith({});
    function Host() {
      captured = useLeadGate({ tool: "planner", store });
      return null;
    }
    render("en", createElement(Host));
    expect(captured).toMatchObject({ status: "unknown", gateOpen: false, formProps: { tool: "planner", enforced: false, store } });
    expect(typeof (captured as unknown as ReturnType<typeof useLeadGate>).formProps.hostId).toBe("string");
  });
});
