import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchLeadGateStatus } from "@/components/lead-gate/lead-gate-client";
import { LeadGateStore, type LeadGateStoreDeps } from "@/components/lead-gate/lead-gate-store";
import { LocaleProvider } from "@/i18n/client";
import { messagesFor } from "@/i18n/messages";
import type { LeadGateStatusData } from "@/lib/lead-gate/contract";
import { PREDICTOR_BAND_PATTERN } from "@/lib/lead-gate/contract";
import { getPredictorData } from "@/lib/predictor/data";
import { scoreTableFor } from "@/lib/predictor/engine";
import {
  countdownGateStep,
  examCountdown,
  miniEstimate,
  miniGateStep,
  miniGateSummary,
  miniResultSlot,
  revealCountdown,
  revealMiniResult,
  toolGateLayout,
  type CountdownGateEffect,
  type ExamCountdown,
  type MiniEstimate,
  type MiniGateEffect,
} from "./home-tools";
import { getHomeToolsData } from "./home-tools-data";
import { HomeTools } from "./HomeTools";
import { HomeToolsBand } from "./HomeToolsPredictor";

/**
 * Homepage widget × lead gate (docs/lead-gate-plan.md §8.2–8.3, §13.1 "per-host pure gate
 * reducers incl. offline / 5xx / 429 fail-open"): the mini predictor and, since the owner update of
 * 22 Oct 2026, the exam countdown. The gate's store runs with fake transport, so nothing is sent
 * anywhere.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const status = (data: Partial<LeadGateStatusData>): LeadGateStatusData => ({
  mode: "required",
  unlocked: false,
  via: null,
  recordsUse: false,
  expiresAt: null,
  // The live demo site: results use sample data, and the gate asks anyway (owner decision, 21 Oct 2026).
  sample: true,
  ...data,
});
const LOCKED = status({});
const PASS = status({ unlocked: true, via: "pass", recordsUse: true, expiresAt: new Date(NOW + 180 * 864e5).toISOString() });

function storeWith(overrides: Partial<LeadGateStoreDeps> = {}) {
  const map = new Map<string, string>();
  const deps: LeadGateStoreDeps = {
    fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data: LOCKED })),
    submit: vi.fn(async () => ({ kind: "unlocked" as const, data: { unlocked: true as const, via: "pass" as const, recordsUse: true, expiresAt: PASS.expiresAt } })),
    forget: vi.fn(async () => ({ forgotten: true as const, withdrawn: false })),
    sendUsage: vi.fn(async () => ({ recorded: true })),
    storage: () => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key) }),
    now: () => NOW,
    online: () => true,
    listenStorage: () => () => undefined,
    ...overrides,
  };
  return { store: new LeadGateStore(deps), deps };
}

/** A status transport that goes through the real client parser with a canned HTTP answer. */
const httpStatus = (respond: () => Promise<Response>) => () => fetchLeadGateStatus((() => respond()) as unknown as typeof fetch);

function sampleData() {
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
  const data = getPredictorData();
  expect(data).not.toBeNull();
  return data;
}

function okEstimate(value = "187"): Extract<MiniEstimate, { status: "ok" }> {
  const estimate = miniEstimate("jee-main", "score", value, sampleData());
  expect(estimate.status).toBe("ok");
  return estimate as Extract<MiniEstimate, { status: "ok" }>;
}

describe("homepage predictor: what the gate keeps", () => {
  it("is the exam and the share card's score / percentile band, never the exact value", () => {
    const data = sampleData();
    const table = scoreTableFor("jee-main", data)!;
    expect(miniGateSummary(okEstimate("187").band, table)).toEqual({ exam: "jee-main", band: "score-180-189" });

    const percentile = miniEstimate("jee-main", "percentile", "98.7", data);
    expect(percentile.status).toBe("ok");
    if (percentile.status !== "ok") return;
    const summary = miniGateSummary(percentile.band, table);
    expect(summary).toEqual({ exam: "jee-main", band: "percentile-98-99" });
    expect(summary.band).toMatch(PREDICTOR_BAND_PATTERN);
    expect(JSON.stringify(summary)).not.toContain("98.7");
  });

  it("leaves the band out when it can't be expressed (negative marks)", () => {
    const table = scoreTableFor("jee-main", sampleData())!;
    expect(miniGateSummary(okEstimate("-20").band, table)).toEqual({ exam: "jee-main" });
  });
});

describe("homepage predictor: an explicit Predict", () => {
  it("validates first: an invalid value never asks for contact details", async () => {
    const { store, deps } = storeWith();
    const invalid = miniEstimate("jee-main", "score", "999", sampleData());
    expect(await revealMiniResult(invalid, () => store.ensure())).toBe("invalid");
    expect(await revealMiniResult({ status: "not-loaded" }, () => store.ensure())).toBe("invalid");
    expect(deps.fetchStatus).not.toHaveBeenCalled();
  });

  it("asks for contact details before a band from SAMPLE tables too (owner decision, 21 Oct 2026)", async () => {
    const estimate = okEstimate();
    expect(estimate.band.sample).toBe(true);
    const { store, deps } = storeWith();
    expect(await revealMiniResult(estimate, () => store.ensure())).toBe("gated");
    expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ status: "locked", mode: "required", sample: true });
  });

  it.each([
    ["a pass (details shared before)", PASS],
    ["a signed-in student or parent", status({ unlocked: true, via: "session" })],
    ["the gate switched off", status({ mode: "off", unlocked: true, via: "off" })],
  ])("shows the band at once for %s", async (_label, data) => {
    const { store } = storeWith({ fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data })) });
    expect(await revealMiniResult(okEstimate(), () => store.ensure())).toBe("shown");
  });

  it.each([
    ["a 5xx", () => Promise.resolve(new Response("{}", { status: 503 }))],
    ["a 429", () => Promise.resolve(new Response(JSON.stringify({ ok: false, error: "rate_limited", message: "x" }), { status: 429 }))],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a garbled answer", () => Promise.resolve(new Response("<html>", { status: 200 }))],
  ])("fails OPEN on %s (browser-only tool; nothing recorded)", async (_label, respond) => {
    const { store, deps } = storeWith({ fetchStatus: httpStatus(respond) });
    expect(await revealMiniResult(okEstimate(), () => store.ensure())).toBe("shown");
    expect(store.getSnapshot()).toMatchObject({ status: "open", via: "unavailable", recordsUse: false });
    store.recordUse({ tool: "predictor", exam: "jee-main", band: "score-180-189" });
    expect(deps.sendUsage).not.toHaveBeenCalled();
  });

  it("fails open offline without a request", async () => {
    const { store, deps } = storeWith({ online: () => false });
    expect(await revealMiniResult(okEstimate(), () => store.ensure())).toBe("shown");
    expect(deps.fetchStatus).not.toHaveBeenCalled();
  });

  it("unlocks after the form is sent; each Predict that ends in a band is noted once (exam and band only)", async () => {
    const { store, deps } = storeWith();
    const table = scoreTableFor("jee-main", sampleData())!;
    // The widget's wiring (HomeToolsPredictor `apply`), with the store's transport faked.
    const effects: MiniGateEffect[] = [];
    const apply = (effect: MiniGateEffect) => {
      effects.push(effect);
      if (effect.note) store.recordUse({ tool: "predictor", ...effect.note, page: "/" });
    };
    const predict = async (raw: string) => {
      const current = miniEstimate("jee-main", "score", raw, sampleData());
      apply(miniGateStep({ kind: "predict", decision: await revealMiniResult(current, () => store.ensure()) }, current, table));
    };
    // useLeadGate's onUnlocked (this widget was waiting on its own form).
    store.onUnlock(({ by }) => apply(miniGateStep({ kind: "unlocked", byThisHost: by === "home-predictor" }, okEstimate(), table)));

    await predict("187"); // gated: the form, nothing noted yet
    expect(effects.at(-1)).toEqual({ reveal: false, note: null, focus: null });
    expect(deps.sendUsage).not.toHaveBeenCalled();

    await store.submit({}, "home-predictor");
    expect(effects.at(-1)).toEqual({ reveal: true, note: { exam: "jee-main", band: "score-180-189" }, focus: "result" });
    expect(deps.sendUsage).toHaveBeenCalledTimes(1); // the Predict that opened the form

    await predict("187"); // no second ask
    await predict("999"); // invalid: never noted
    expect(effects.at(-1)).toEqual({ reveal: false, note: null, focus: "value" });
    expect(deps.fetchStatus).toHaveBeenCalledTimes(2); // the first ask + the pass confirmation
    expect(deps.sendUsage).toHaveBeenCalledTimes(2);
    for (const [input] of vi.mocked(deps.sendUsage).mock.calls) {
      expect(input).toEqual({ tool: "predictor", exam: "jee-main", band: "score-180-189", page: "/" });
    }
  });
});

describe("homepage predictor: gate steps", () => {
  const table = () => scoreTableFor("jee-main", sampleData())!;
  const invalid: MiniEstimate = { status: "invalid", min: -75, max: 300 };
  const note = { exam: "jee-main", band: "score-180-189" };

  it("Predict: invalid → back to the value field; gated → nothing yet (the form focuses itself); shown → the band and one note", () => {
    expect(miniGateStep({ kind: "predict", decision: "invalid" }, invalid, table())).toEqual({ reveal: false, note: null, focus: "value" });
    expect(miniGateStep({ kind: "predict", decision: "gated" }, okEstimate(), table())).toEqual({ reveal: false, note: null, focus: null });
    // A pass holder's Predict: focus stays on the button; the status region reads the band.
    expect(miniGateStep({ kind: "predict", decision: "shown" }, okEstimate(), table())).toEqual({ reveal: true, note, focus: null });
  });

  it("unlocked by this widget's own form: the band, one note, focus to the band", () => {
    expect(miniGateStep({ kind: "unlocked", byThisHost: true }, okEstimate(), table())).toEqual({ reveal: true, note, focus: "result" });
  });

  it("unlocked after the value was edited to an invalid one: no note, focus back to the value field", () => {
    expect(miniGateStep({ kind: "unlocked", byThisHost: true }, invalid, table())).toEqual({ reveal: true, note: null, focus: "value" });
  });

  it("unlocked elsewhere (another tool on the page, another tab): the band and the note; focus stays put", () => {
    expect(miniGateStep({ kind: "unlocked", byThisHost: false }, okEstimate(), table())).toEqual({ reveal: true, note, focus: null });
    expect(miniGateStep({ kind: "unlocked", byThisHost: false }, invalid, table())).toEqual({ reveal: true, note: null, focus: null });
  });

  it("negative marks: the note keeps the exam only", () => {
    expect(miniGateStep({ kind: "predict", decision: "shown" }, okEstimate("-20"), table()).note).toEqual({ exam: "jee-main" });
  });
});

describe("homepage tools: one gate layout for both hosts", () => {
  it("hides the up-front note while the form shows (its own lead says it) and keeps one gold action", () => {
    expect(toolGateLayout("gate").note).toBe(false);
    expect(toolGateLayout("gate").submitVariant).toBe("outline");
    for (const slot of ["empty", "invalid", "result"] as const) expect(toolGateLayout(slot).note, slot).toBe(true);
  });
});

describe("homepage predictor: the result slot", () => {
  const notLoaded: MiniEstimate = { status: "not-loaded" };
  it("shows the form while it is open, the band only once revealed with a valid value, else the placeholder", () => {
    const band = okEstimate();
    const invalid: MiniEstimate = { status: "invalid", min: -75, max: 300 };
    expect(miniResultSlot({ outcome: null, revealed: false, gateOpen: false })).toBe("empty");
    expect(miniResultSlot({ outcome: band, revealed: false, gateOpen: false })).toBe("empty");
    expect(miniResultSlot({ outcome: band, revealed: false, gateOpen: true })).toBe("gate");
    // Editing the score while the form shows keeps the form (and what was typed in it).
    expect(miniResultSlot({ outcome: invalid, revealed: false, gateOpen: true })).toBe("gate");
    expect(miniResultSlot({ outcome: band, revealed: true, gateOpen: true })).toBe("gate");
    expect(miniResultSlot({ outcome: band, revealed: true, gateOpen: false })).toBe("result");
    expect(miniResultSlot({ outcome: invalid, revealed: true, gateOpen: false })).toBe("empty");
    expect(miniResultSlot({ outcome: notLoaded, revealed: true, gateOpen: false })).toBe("empty");
  });
});

describe("homepage widget markup with the gate", () => {
  const render = (locale: "en" | "hi") => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    return renderToStaticMarkup(
      createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, createElement(HomeTools, { tools: getHomeToolsData(), locale })),
    );
  };

  it("keeps the server HTML static: no form, note or identity line until the browser asks", () => {
    for (const locale of ["en", "hi"] as const) {
      const html = render(locale);
      const gate = messagesFor(locale, "leadGate");
      expect(html).not.toContain("data-lead-gate");
      expect(html).not.toContain(gate.heading);
      expect(html).not.toContain(gate.note.required);
      expect(html).not.toContain(gate.identity.notYou);
      expect(html).toContain(messagesFor(locale, "home").tools.predictor.empty);
      // The countdown's panel too: its prompt and button, no form or note until the browser asks.
      const planner = html.slice(html.indexOf('id="home-tools-panel-planner"'));
      expect(planner).toContain(messagesFor(locale, "home").tools.planner.prompt);
      expect(planner).toContain(messagesFor(locale, "home").tools.planner.submit);
      expect(planner).not.toContain("data-lead-gate");
      expect(planner).not.toContain(gate.note.required);
    }
  });

  it("no longer promises 'no sign-up' or that nothing typed leaves the browser (plan §11.4)", () => {
    for (const locale of ["en", "hi"] as const) {
      const points = messagesFor(locale, "home").tools.points;
      expect(points.free).not.toMatch(/sign-up|sign up|साइन-अप/i);
      expect(points.private).not.toMatch(/stays in your browser|ब्राउज़र में ही रहता है/);
    }
    expect(messagesFor("en", "home").tools.points.free).toMatch(/contact number/);
  });

  it("after the widget's own form unlocks, focus can land on the band's first line, with the global focus ring", () => {
    const tp = messagesFor("en", "predictor");
    const messages = {
      crl: tp.result.crl,
      range: tp.result.range,
      percentileBand: tp.result.percentileBand,
      percentileYours: tp.result.percentileYours,
      basedOn: tp.result.basedOn,
      basedOnSample: tp.result.basedOnSample,
      bandNote: tp.result.bandNote,
      exams: tp.form.exams,
    };
    const band = okEstimate().band;
    const withTarget = renderToStaticMarkup(createElement(HomeToolsBand, { band, locale: "en", messages, labelRef: createRef<HTMLParagraphElement>() }));
    expect(withTarget).toMatch(/<p tabindex="-1" class="[^"]*">[^<]*common rank list/i);
    expect(withTarget).not.toContain("outline-none");
    // Elsewhere (no ref) the band has no focus target.
    expect(renderToStaticMarkup(createElement(HomeToolsBand, { band, locale: "en", messages }))).not.toContain("tabindex");
  });

  it("gates the planner countdown (owner update, 22 Oct 2026)", () => {
    const planner = readFileSync(fileURLToPath(new URL("./HomeToolsPlanner.tsx", import.meta.url)), "utf8");
    expect(planner).toMatch(/useLeadGate\(\{\s*tool:\s*"planner",\s*usageKey:\s*"countdown"/);
    for (const name of ["LeadGateForm", "LeadGateNote", "LeadGateIdentity"]) {
      expect(planner).toMatch(new RegExp(`import \\{ ${name} \\} from "@/components/lead-gate/${name}"`));
    }
    // The note carries the exam only: never the date or the days.
    const calls = [...planner.matchAll(/recordUse\(([^)]*)\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) expect(args).not.toMatch(/examDate|days/);
  });
});

// ── The exam countdown (owner update, 22 Oct 2026): contact details before the days left ──

const TODAY = "2026-10-21";
const DAYS: ExamCountdown = examCountdown("2027-04-02", TODAY);

describe("homepage countdown: an explicit Show days left", () => {
  it("validates first: a missing, past or too-far date never asks for contact details", async () => {
    const { store, deps } = storeWith();
    for (const date of ["", "2026-10-20", "2030-01-01"]) {
      expect(await revealCountdown(examCountdown(date, TODAY), () => store.ensure()), date || "empty").toBe("invalid");
    }
    expect(deps.fetchStatus).not.toHaveBeenCalled();
  });

  it("asks for contact details before the countdown, sample site included", async () => {
    expect(DAYS.kind).toBe("days");
    const { store, deps } = storeWith();
    expect(await revealCountdown(DAYS, () => store.ensure())).toBe("gated");
    expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ status: "locked", mode: "required", sample: true });
    // Today and tomorrow are results too.
    const again = storeWith();
    expect(await revealCountdown({ kind: "today" }, () => again.store.ensure())).toBe("gated");
  });

  it.each([
    ["a pass (details shared before)", PASS],
    ["a signed-in account the server lets through", status({ unlocked: true, via: "session" })],
    ["the gate switched off", status({ mode: "off", unlocked: true, via: "off" })],
  ])("shows the countdown at once for %s", async (_label, data) => {
    const { store } = storeWith({ fetchStatus: vi.fn(async () => ({ kind: "ok" as const, data })) });
    expect(await revealCountdown(DAYS, () => store.ensure())).toBe("shown");
  });

  it.each([
    ["a 5xx", () => Promise.resolve(new Response("{}", { status: 503 }))],
    ["a 429", () => Promise.resolve(new Response(JSON.stringify({ ok: false, error: "rate_limited", message: "x" }), { status: 429 }))],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a garbled answer", () => Promise.resolve(new Response("<html>", { status: 200 }))],
  ])("fails OPEN on %s (browser-only tool; nothing recorded)", async (_label, respond) => {
    const { store, deps } = storeWith({ fetchStatus: httpStatus(respond) });
    expect(await revealCountdown(DAYS, () => store.ensure())).toBe("shown");
    expect(store.getSnapshot()).toMatchObject({ status: "open", via: "unavailable", recordsUse: false });
    store.recordUse({ tool: "planner", key: "countdown", exam: "jee-main" });
    expect(deps.sendUsage).not.toHaveBeenCalled();
  });

  it("fails open offline without a request", async () => {
    const { store, deps } = storeWith({ online: () => false });
    expect(await revealCountdown(DAYS, () => store.ensure())).toBe("shown");
    expect(deps.fetchStatus).not.toHaveBeenCalled();
  });
});

describe("homepage countdown: gate steps", () => {
  const note = { exam: "jee-main" };

  it("Show days left: invalid → back to the date field; gated → nothing yet; shown → the countdown and one note (exam only)", () => {
    expect(countdownGateStep({ kind: "submit", decision: "invalid" }, { kind: "past" }, "jee-main")).toEqual({ reveal: false, note: null, focus: "date" });
    expect(countdownGateStep({ kind: "submit", decision: "gated" }, DAYS, "jee-main")).toEqual({ reveal: false, note: null, focus: null });
    expect(countdownGateStep({ kind: "submit", decision: "shown" }, DAYS, "jee-main")).toEqual({ reveal: true, note, focus: null });
  });

  it("unlocked by this host's own form: the countdown, one note, focus to the countdown (or the date field without days)", () => {
    expect(countdownGateStep({ kind: "unlocked", byThisHost: true }, DAYS, "jee-main")).toEqual({ reveal: true, note, focus: "result" });
    expect(countdownGateStep({ kind: "unlocked", byThisHost: true }, { kind: "tomorrow" }, "jee-main")).toEqual({ reveal: true, note, focus: "result" });
    expect(countdownGateStep({ kind: "unlocked", byThisHost: true }, { kind: "past" }, "jee-main")).toEqual({ reveal: true, note: null, focus: "date" });
  });

  it("unlocked elsewhere (the predictor on this page, another tab): the countdown and the note; focus stays put", () => {
    expect(countdownGateStep({ kind: "unlocked", byThisHost: false }, DAYS, "neet")).toEqual({ reveal: true, note: { exam: "neet" }, focus: null });
    expect(countdownGateStep({ kind: "unlocked", byThisHost: false }, { kind: "empty" }, "neet")).toEqual({ reveal: true, note: null, focus: null });
  });

  it("unlocks after the form is sent; each press that ends in days is noted once, with the exam and the 'countdown' key only", async () => {
    const { store, deps } = storeWith();
    // The host's wiring (HomeToolsPlanner `apply`), with useLeadGate's recordUse mapping for
    // { tool: "planner", usageKey: "countdown" } (it adds the tool and the key).
    const effects: CountdownGateEffect[] = [];
    const apply = (effect: CountdownGateEffect) => {
      effects.push(effect);
      if (effect.note) store.recordUse({ ...effect.note, tool: "planner", key: "countdown" });
    };
    const press = async (date: string) => {
      const current = examCountdown(date, TODAY);
      apply(countdownGateStep({ kind: "submit", decision: await revealCountdown(current, () => store.ensure()) }, current, "jee-main"));
    };
    store.onUnlock(({ by }) => apply(countdownGateStep({ kind: "unlocked", byThisHost: by === "home-planner" }, DAYS, "jee-main")));

    await press("2027-04-02"); // gated: the form, nothing noted yet
    expect(effects.at(-1)).toEqual({ reveal: false, note: null, focus: null });
    expect(deps.sendUsage).not.toHaveBeenCalled();

    await store.submit({}, "home-planner");
    expect(effects.at(-1)).toEqual({ reveal: true, note: { exam: "jee-main" }, focus: "result" });
    expect(deps.sendUsage).toHaveBeenCalledTimes(1); // the press that opened the form

    await press("2027-04-02"); // no second ask
    await press("2026-10-01"); // past: never noted
    expect(effects.at(-1)).toEqual({ reveal: false, note: null, focus: "date" });
    expect(deps.sendUsage).toHaveBeenCalledTimes(2);
    for (const [input] of vi.mocked(deps.sendUsage).mock.calls) {
      expect(input).toEqual({ tool: "planner", key: "countdown", exam: "jee-main" });
      expect(JSON.stringify(input)).not.toMatch(/2027|days|\d{3}/);
    }
  });
});
