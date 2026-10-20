import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HINT_KEY, LeadGateStore, type LeadGateStoreDeps } from "@/components/lead-gate/lead-gate-store";
import { predictorTables } from "@/content/predictor";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { leadGateUsageSchema, PREDICTOR_BAND_PATTERN, type LeadGateStatusData, type LeadGateUsageData } from "@/lib/lead-gate/contract";
import { hasSampleData, matchColleges, scoreTableFor, selectVisibleData } from "@/lib/predictor/engine";
import { PredictorApp, predictorEnquiryHref } from "./PredictorApp";
import {
  INITIAL_PREDICTOR_GATE,
  PredictorGateController,
  predictorGateStep,
  predictorSummary,
  type PredictorGateHost,
  type PredictorGateState,
  type PredictorSummary,
} from "./predictor-gate";

/** WP2 (docs/lead-gate-plan.md §8.1): the predictor asks for contact details before its result. */

const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const HOST_ID = "predictor-host";
const LOCKED: LeadGateStatusData = { mode: "required", unlocked: false, via: null, recordsUse: false, expiresAt: null, sample: true };
const PASS: LeadGateStatusData = {
  mode: "required",
  unlocked: true,
  via: "pass",
  recordsUse: true,
  expiresAt: new Date(NOW + 180 * 864e5).toISOString(),
  sample: true,
};

function fakeStore(overrides: Partial<LeadGateStoreDeps> = {}) {
  const map = new Map<string, string>();
  const storageListeners = new Set<(key: string | null) => void>();
  const deps: LeadGateStoreDeps = {
    fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data: LOCKED })),
    submit: vi.fn(async () => ({ kind: "unlocked" as const, data: { unlocked: true as const, via: "pass" as const, recordsUse: true, expiresAt: PASS.expiresAt } })),
    forget: vi.fn(async () => ({ forgotten: true as const, withdrawn: false })),
    sendUsage: vi.fn(async (): Promise<LeadGateUsageData> => ({ recorded: true })),
    storage: () => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key) }),
    now: () => NOW,
    online: () => true,
    listenStorage: (onKey) => {
      storageListeners.add(onKey);
      return () => void storageListeners.delete(onKey);
    },
    ...overrides,
  };
  /** Another tab of this site changed the local hint (the browser's `storage` event). */
  function otherTab(hint: Record<string, unknown> | null) {
    if (hint) map.set(HINT_KEY, JSON.stringify(hint));
    else map.delete(HINT_KEY);
    for (const listener of [...storageListeners]) listener(HINT_KEY);
  }
  return { store: new LeadGateStore(deps), deps, otherTab };
}

/** A sample-data prediction (the live demo site's tables). */
function samplePrediction(value = 187) {
  const data = selectVisibleData(predictorTables, true);
  const result = matchColleges({ exam: "jee-main", mode: "score", value, category: "SC", pwd: true, homeState: "HP", gender: "female" }, data);
  if (result.status !== "ok") throw new Error("expected a prediction");
  const table = scoreTableFor("jee-main", data);
  if (!table) throw new Error("expected a score table");
  return { data, result, table };
}

const summaryFor = (value: number): PredictorSummary => {
  const { result, table } = samplePrediction(value);
  return predictorSummary(result, table);
};

/**
 * PredictorApp's gate, driven through the SAME PredictorGateController the component uses. The host
 * stands in for React: `render` re-computes the live summary from the current input (as a render
 * does), `requestAccess` / the unlock listener follow useLeadGate (store.ensure; a refusal waits for
 * the next unlockSeq), and focus is recorded instead of moved.
 */
function predictorHost(store: LeadGateStore, page = "/tools/predictor") {
  const controller = new PredictorGateController();
  const focus: string[] = [];
  const view = { value: 187, submitted: false, live: null as PredictorSummary | null, focusInResult: false };
  let waitingSince: number | null = null;
  const host: PredictorGateHost = {
    requestAccess: async () => {
      const allowed = await store.ensure();
      if (!allowed) waitingSince = store.getSnapshot().unlockSeq;
      return allowed;
    },
    storeOpen: () => store.getSnapshot().status === "open",
    summary: () => view.live,
    recordUse: (usage) => store.recordUse({ tool: "predictor", ...usage, page }),
    focusInResult: () => view.focusInResult,
    focusResult: () => void focus.push("result-heading"),
    render: () => {
      view.live = view.submitted ? summaryFor(view.value) : null;
    },
  };
  controller.connect(host);
  store.subscribe(() => undefined); // useSyncExternalStore: also starts the cross-tab sync
  store.onUnlock((event) => {
    if (waitingSince === null || event.seq <= waitingSince) return;
    waitingSince = null;
    controller.unlocked(event.by === HOST_ID);
  });
  return {
    focus,
    view,
    get state(): PredictorGateState {
      return controller.state;
    },
    /** An explicit submit with an ok outcome (resolves once the gate has answered). */
    async submitOk() {
      view.submitted = true;
      controller.submitOk(summaryFor(view.value));
      await flush();
    },
    /** A live edit after the first submit (re-renders; never re-gates). */
    type(value: number) {
      view.value = value;
      host.render(controller.state);
    },
    forgotten: () => controller.forgotten(),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("predictor gate steps (pure)", () => {
  it("an invalid input never asks; an ok submit asks once, double submits are ignored", () => {
    expect(predictorGateStep(INITIAL_PREDICTOR_GATE, { type: "submit-invalid" })).toEqual({ state: INITIAL_PREDICTOR_GATE, effect: "none" });
    const asked = predictorGateStep(INITIAL_PREDICTOR_GATE, { type: "submit-ok", storeOpen: false });
    expect(asked).toEqual({ state: { phase: "checking", everShown: false }, effect: "request" });
    // An open store still goes through requestAccess() the first time (it answers true at once).
    expect(predictorGateStep(INITIAL_PREDICTOR_GATE, { type: "submit-ok", storeOpen: true }).effect).toBe("request");
    expect(predictorGateStep(asked.state, { type: "submit-ok", storeOpen: true }).effect).toBe("none");
    expect(predictorGateStep(asked.state, { type: "submit-invalid" }).state.phase).toBe("checking");
  });

  it("allowed → shown; refused → the form; an unlock (this form, a skip, another tab) → shown", () => {
    const checking: PredictorGateState = { phase: "checking", everShown: false };
    expect(predictorGateStep(checking, { type: "access", allowed: true })).toEqual({ state: { phase: "shown", everShown: true }, effect: "reveal" });
    const gated = predictorGateStep(checking, { type: "access", allowed: false });
    expect(gated).toEqual({ state: { phase: "gated", everShown: false }, effect: "none" });
    expect(predictorGateStep(gated.state, { type: "unlocked" })).toEqual({ state: { phase: "shown", everShown: true }, effect: "reveal" });
    // While the form shows, a corrected input keeps the form (what was typed stays); a new ok submit asks again.
    expect(predictorGateStep(gated.state, { type: "submit-invalid" }).state.phase).toBe("gated");
    expect(predictorGateStep(gated.state, { type: "submit-ok", storeOpen: false })).toEqual({ state: { phase: "checking", everShown: false }, effect: "request" });
  });

  it("once shown, later submits reveal (and note) again without asking while the store is open", () => {
    const shown: PredictorGateState = { phase: "shown", everShown: true };
    expect(predictorGateStep(shown, { type: "submit-ok", storeOpen: true })).toEqual({ state: shown, effect: "reveal" });
    expect(predictorGateStep(shown, { type: "submit-invalid" })).toEqual({ state: shown, effect: "none" });
    expect(predictorGateStep(shown, { type: "unlocked" }).effect).toBe("none");
    expect(predictorGateStep(shown, { type: "access", allowed: true }).effect).toBe("none");
  });

  it("once shown, a submit after the store closed elsewhere hides the result and asks again", () => {
    const shown: PredictorGateState = { phase: "shown", everShown: true };
    expect(predictorGateStep(shown, { type: "submit-ok", storeOpen: false })).toEqual({ state: { phase: "checking", everShown: true }, effect: "request" });
  });

  it('"Not you?" hides the result (focus moves) and the next submit asks again; stale answers are ignored', () => {
    const forgotten = predictorGateStep({ phase: "shown", everShown: true }, { type: "forgotten" });
    expect(forgotten).toEqual({ state: { phase: "idle", everShown: true }, effect: "hide" });
    expect(predictorGateStep(forgotten.state, { type: "submit-ok", storeOpen: false }).effect).toBe("request");
    expect(predictorGateStep(forgotten.state, { type: "access", allowed: true }).effect).toBe("none");
    expect(predictorGateStep(forgotten.state, { type: "unlocked" }).effect).toBe("none");
    expect(predictorGateStep(INITIAL_PREDICTOR_GATE, { type: "forgotten" })).toEqual({ state: INITIAL_PREDICTOR_GATE, effect: "hide" });
  });
});

describe("what the lead keeps about a result", () => {
  it("only the exam and the share card's score band: never the exact score or personal choices", () => {
    const { result, table } = samplePrediction(187);
    const summary = predictorSummary(result, table);
    expect(summary).toEqual({ exam: "jee-main", band: "score-180-189" });
    expect(summary.band).toMatch(PREDICTOR_BAND_PATTERN);
    expect(Object.keys(summary).sort()).toEqual(["band", "exam"]);
    expect(JSON.stringify(summary)).not.toContain("187");
    // The usage body the store sends is valid for POST /api/lead-gate/usage.
    expect(leadGateUsageSchema.parse({ tool: "predictor", ...summary, page: "/hi/tools/predictor" })).toEqual({
      tool: "predictor",
      exam: "jee-main",
      band: "score-180-189",
      page: "/hi/tools/predictor",
    });
    // Same band as the counsellor link.
    expect(predictorEnquiryHref(result, table, "en")).toBe("/admissions?from=predictor&exam=jee-main&band=score-180-189#enquiry");
    expect(predictorSummary(result, undefined)).toEqual({ exam: "jee-main" });
  });

  it("percentile input gives a whole-percentile band", () => {
    const data = selectVisibleData(predictorTables, true);
    const result = matchColleges({ exam: "jee-main", mode: "percentile", value: 98.42 }, data);
    if (result.status !== "ok") throw new Error("expected a prediction");
    expect(predictorSummary(result, scoreTableFor("jee-main", data))).toEqual({ exam: "jee-main", band: "percentile-98-99" });
  });
});

describe("predictor gate controller + lead-gate store", () => {
  it("SAMPLE data is gated too (owner decision 21 Oct 2026): locked → the form, nothing shown or noted", async () => {
    const { store, deps } = fakeStore();
    expect(hasSampleData(samplePrediction().data)).toBe(true);
    const host = predictorHost(store);
    await host.submitOk();
    expect(host.state.phase).toBe("gated");
    expect(host.focus).toEqual([]);
    expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
    expect(deps.sendUsage).not.toHaveBeenCalled();
  });

  it("the form unlocks → the result shows, focus moves to it and one use is noted with exam + band only", async () => {
    const { store, deps } = fakeStore();
    const host = predictorHost(store);
    await host.submitOk();
    await store.submit({}, HOST_ID);
    await flush();
    expect(host.state).toEqual({ phase: "shown", everShown: true });
    expect(host.focus).toEqual(["result-heading"]);
    expect(deps.sendUsage).toHaveBeenCalledTimes(1);
    expect(deps.sendUsage).toHaveBeenCalledWith({ tool: "predictor", exam: "jee-main", band: "score-180-189", page: "/tools/predictor" });
    // A second explicit submit: no second ask, one more note (merged per day on the server).
    await host.submitOk();
    expect(deps.fetchStatus).toHaveBeenCalledTimes(2); // 1 status check + 1 pass confirmation, none for the 2nd submit
    expect(deps.sendUsage).toHaveBeenCalledTimes(2);
  });

  it("an input edited while the contact form is open: the note carries the band of the result SHOWN", async () => {
    const { store, deps } = fakeStore();
    const host = predictorHost(store);
    await host.submitOk(); // 187 → the form
    expect(host.view.live).toEqual(summaryFor(187));
    host.type(250); // live edit, no Predict press
    await store.submit({}, HOST_ID);
    await flush();
    expect(host.state.phase).toBe("shown");
    const shown = summaryFor(250);
    expect(shown.band).not.toBe("score-180-189");
    expect(deps.sendUsage).toHaveBeenCalledTimes(1);
    expect(deps.sendUsage).toHaveBeenCalledWith({ tool: "predictor", ...shown, page: "/tools/predictor" });
  });

  it("the note falls back to the submitted band when the live outcome is not rendered yet", async () => {
    const recordUse = vi.fn();
    const controller = new PredictorGateController();
    controller.connect({
      requestAccess: async () => true,
      storeOpen: () => true,
      summary: () => null,
      recordUse,
      focusInResult: () => false,
      focusResult: () => undefined,
      render: () => undefined,
    });
    controller.submitOk(summaryFor(187));
    await flush();
    expect(controller.state.phase).toBe("shown");
    expect(recordUse).toHaveBeenCalledWith({ exam: "jee-main", band: "score-180-189" });
  });

  it("a browser that already shared details sees the result at once", async () => {
    const { store, deps } = fakeStore({ fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data: PASS })) });
    const host = predictorHost(store);
    await host.submitOk();
    expect(host.state.phase).toBe("shown");
    expect(host.focus).toEqual(["result-heading"]);
    expect(deps.sendUsage).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no answer / 429 / 5xx", { fetchStatus: vi.fn(async () => ({ kind: "failed" as const })) }],
    ["a thrown fetch", { fetchStatus: vi.fn(async () => Promise.reject(new Error("boom"))) }],
    ["offline", { online: () => false }],
  ] as const)("fails OPEN on %s: the result shows and nothing is noted", async (_label, overrides) => {
    const { store, deps } = fakeStore(overrides);
    const host = predictorHost(store);
    await host.submitOk();
    expect(host.state.phase).toBe("shown");
    expect(store.getSnapshot().via).toBe("unavailable");
    expect(deps.sendUsage).not.toHaveBeenCalled();
  });

  it("signed in or gate off: shown, nothing noted", async () => {
    for (const via of ["session", "off"] as const) {
      const data: LeadGateStatusData = { ...LOCKED, mode: via === "off" ? "off" : "required", unlocked: true, via };
      const { store, deps } = fakeStore({ fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data })) });
      const host = predictorHost(store);
      await host.submitOk();
      expect(host.state.phase).toBe("shown");
      expect(deps.sendUsage).not.toHaveBeenCalled();
    }
  });

  it('"Not you?" → the result hides, focus moves to its heading, the next submit asks again', async () => {
    const fetchStatus = vi.fn(async () => ({ kind: "ok" as const, data: PASS }));
    const { store } = fakeStore({ fetchStatus });
    const host = predictorHost(store);
    await host.submitOk();
    expect(host.state.phase).toBe("shown");
    const seqBefore = store.getSnapshot().unlockSeq;
    await store.forget();
    host.forgotten();
    expect(host.state).toEqual({ phase: "idle", everShown: true });
    expect(host.focus).toEqual(["result-heading", "result-heading"]);
    fetchStatus.mockImplementation(async () => ({ kind: "ok" as const, data: LOCKED })); // the cookie is gone
    await host.submitOk();
    expect(host.state.phase).toBe("gated");
    // Sharing again re-opens the store with a NEW unlockSeq: PredictorApp keys <LeadGateIdentity>
    // by it, so the old "no longer has your details" status never sits beside "shared".
    fetchStatus.mockImplementation(async () => ({ kind: "ok" as const, data: PASS }));
    await store.submit({}, HOST_ID);
    await flush();
    expect(host.state.phase).toBe("shown");
    expect(store.getSnapshot().unlockSeq).toBeGreaterThan(seqBefore);
  });

  it("forgotten in ANOTHER tab: the shown result stays until the next submit, which asks again", async () => {
    const fetchStatus = vi.fn(async () => ({ kind: "ok" as const, data: PASS }));
    const { store, deps, otherTab } = fakeStore({ fetchStatus });
    const host = predictorHost(store);
    await host.submitOk();
    expect(host.state.phase).toBe("shown");
    fetchStatus.mockImplementation(async () => ({ kind: "ok" as const, data: LOCKED }));
    otherTab(null); // "Not you?" there removes the hint
    expect(store.getSnapshot().status).toBe("unknown");
    expect(host.state.phase).toBe("shown"); // live edits are not interrupted
    await host.submitOk();
    expect(host.state.phase).toBe("gated");
    expect(deps.sendUsage).toHaveBeenCalledTimes(1); // only the first, recorded reveal
  });

  it("a stale pass (usage answered no_pass) → the next submit asks again", async () => {
    const fetchStatus = vi.fn(async () => ({ kind: "ok" as const, data: PASS }));
    const sendUsage = vi.fn(async (): Promise<LeadGateUsageData> => ({ recorded: false, reason: "no_pass" }));
    const { store } = fakeStore({ fetchStatus, sendUsage });
    const host = predictorHost(store);
    await host.submitOk();
    await flush();
    expect(store.getSnapshot().status).toBe("unknown");
    fetchStatus.mockImplementation(async () => ({ kind: "ok" as const, data: LOCKED }));
    await host.submitOk();
    expect(host.state.phase).toBe("gated");
  });

  it("unlocked in another tab while the form is open: focus moves only if it was in the contact form", async () => {
    const hint = { until: NOW + 3_600_000, recordsUse: true, mode: "required" };
    for (const inForm of [true, false]) {
      const { store, otherTab } = fakeStore();
      const host = predictorHost(store);
      await host.submitOk();
      expect(host.state.phase).toBe("gated");
      host.view.focusInResult = inForm;
      otherTab(hint);
      expect(host.state.phase).toBe("shown");
      expect(host.focus).toEqual(inForm ? ["result-heading"] : []);
    }
  });
});

describe("PredictorApp markup (server render)", () => {
  it.each(["en", "hi"] as const)("%s: no result and no contact form before an explicit submit", (locale: Locale) => {
    const { store } = fakeStore();
    const t = messagesFor(locale, "predictor");
    const tGate = messagesFor(locale, "leadGate");
    const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
    const html = renderToStaticMarkup(
      createElement(
        Provider,
        { locale },
        createElement(PredictorApp, {
          data: selectVisibleData(predictorTables, true),
          messages: { form: t.form, result: t.result, whatIf: t.whatIf, share: t.share },
          leadGate: tGate,
          pageUrl: "https://example.test/tools/predictor",
          gateStore: store,
        }),
      ),
    );
    expect(html).toContain(t.form.submit);
    expect(html).not.toContain(t.form.checking);
    expect(html).not.toContain("data-lead-gate");
    expect(html).not.toContain(tGate.heading);
    expect(html).not.toContain(tGate.identity.notYou);
    // One form only (the gate's own form appears after a submit, never nested in this one).
    expect(html.split("<form").length - 1).toBe(1);
  });
});
