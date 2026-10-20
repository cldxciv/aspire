import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/[lang]/(site)/page";
import { formatRankRange } from "@/components/predictor/format";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { getAllMockTestIds } from "@/lib/mocktest/catalog";
import { getPredictorData } from "@/lib/predictor/data";
import { predictRankBand, type RankBandPrediction } from "@/lib/predictor/engine";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import {
  examCountdown,
  HOME_TOOL_KEYS,
  homeToolPanelId,
  homeToolTabId,
  miniEstimate,
  msUntilNextIstMidnight,
  parseScoreInput,
  splitTemplate,
  tabTargetIndex,
} from "./home-tools";
import { getHomeToolsData, HOME_MOCK_TEST_LIMIT } from "./home-tools-data";
import { HomeTools } from "./HomeTools";
import { CountdownView } from "./HomeToolsPlanner";
import { HomeToolsBand } from "./HomeToolsPredictor";

// The homepage order test renders whole pages: allow for a loaded full run.
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

/** Same escaping React applies to text and attribute values. */
const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const SITE_ROUTES = fileURLToPath(new URL("../../app/[lang]/(site)", import.meta.url));

function renderTools(locale: Locale, placeholders: boolean): string {
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders ? "true" : "false");
  return renderToStaticMarkup(createElement(HomeTools, { tools: getHomeToolsData(), locale }));
}

/** Markup of one panel (up to the next panel or the end of the card). */
function panel(html: string, key: (typeof HOME_TOOL_KEYS)[number]): string {
  const start = html.indexOf(`id="${homeToolPanelId(key)}"`);
  expect(start, `panel ${key}`).toBeGreaterThan(-1);
  const next = html.indexOf('role="tabpanel"', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

const hrefsOf = (html: string) => [...html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Every internal link must resolve to a real page route (mock-test ids to the [testId] route). */
function expectRealRoute(href: string) {
  const path = href.replace(/^\/hi(?=\/|$)/, "") || "/";
  expect(path, href).not.toMatch(/[?#]/);
  const test = path.match(/^\/tools\/mock-tests\/([^/]+)$/);
  if (test && test[1] !== "leaderboard") {
    expect(getAllMockTestIds()).toContain(test[1]);
    expect(existsSync(`${SITE_ROUTES}/tools/mock-tests/[testId]/page.tsx`)).toBe(true);
    return;
  }
  expect(existsSync(`${SITE_ROUTES}${path}/page.tsx`), `route for ${href}`).toBe(true);
}

describe("home tools helpers", () => {
  it("moves between tabs with arrows (both pairs, wrapping), Home and End", () => {
    expect(tabTargetIndex("ArrowRight", 0, 4)).toBe(1);
    expect(tabTargetIndex("ArrowDown", 3, 4)).toBe(0);
    expect(tabTargetIndex("ArrowLeft", 0, 4)).toBe(3);
    expect(tabTargetIndex("ArrowUp", 2, 4)).toBe(1);
    expect(tabTargetIndex("Home", 2, 4)).toBe(0);
    expect(tabTargetIndex("End", 0, 4)).toBe(3);
    for (const key of ["Enter", " ", "Tab", "a"]) expect(tabTargetIndex(key, 1, 4)).toBeNull();
    expect(tabTargetIndex("ArrowRight", 0, 0)).toBeNull();
  });

  it("leaves Alt, Ctrl and Meta shortcuts to the browser (Alt+Left is Back, Ctrl+Home, Cmd+Arrow)", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) {
      expect(tabTargetIndex(key, 1, 4, { altKey: true }), `Alt+${key}`).toBeNull();
      expect(tabTargetIndex(key, 1, 4, { ctrlKey: true }), `Ctrl+${key}`).toBeNull();
      expect(tabTargetIndex(key, 1, 4, { metaKey: true }), `Meta+${key}`).toBeNull();
      expect(tabTargetIndex(key, 1, 4, { altKey: false, ctrlKey: false, metaKey: false }), key).not.toBeNull();
    }
  });

  it("parses scores like the full predictor", () => {
    expect(parseScoreInput(" 182 ")).toBe(182);
    expect(parseScoreInput("99,5")).toBe(99.5);
    expect(parseScoreInput("")).toBeNaN();
    expect(parseScoreInput("abc")).toBeNaN();
  });

  it("estimates a rank band for a valid sample score and rejects out-of-range or empty input", () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const data = getPredictorData();
    expect(data).not.toBeNull();

    const ok = miniEstimate("jee-main", "score", "180", data);
    expect(ok.status).toBe("ok");
    if (ok.status !== "ok") return;
    // Same band as the engine (and so the full predictor) for this input.
    const engine = predictRankBand({ exam: "jee-main", mode: "score", value: 180 }, data);
    expect(engine.status === "ok" && engine.crl).toEqual(ok.band.crl);
    expect(ok.band.crl.low).toBeLessThan(ok.band.crl.high);
    expect(ok.band.sample).toBe(true);

    expect(miniEstimate("jee-main", "score", "999", data)).toEqual({ status: "invalid", min: -75, max: 300 });
    expect(miniEstimate("jee-main", "percentile", "101", data)).toEqual({ status: "invalid", min: 0, max: 100 });
    expect(miniEstimate("neet-ug", "score", "", data)).toEqual({ status: "invalid", min: -180, max: 720 });
    // BOH has no percentiles: the value is read as marks.
    expect(miniEstimate("boh", "percentile", "70", data).status).toBe("ok");
    expect(miniEstimate("jee-main", "score", "180", null)).toEqual({ status: "not-loaded" });
  });

  it("counts days to the exam and handles empty, past, today, tomorrow and too-far dates", () => {
    const today = "2026-10-20";
    expect(examCountdown("", today)).toEqual({ kind: "empty" });
    expect(examCountdown("2027-02-30", today)).toEqual({ kind: "empty" });
    expect(examCountdown("2027-04-02", null)).toEqual({ kind: "empty" });
    expect(examCountdown("2026-10-19", today)).toEqual({ kind: "past" });
    expect(examCountdown("2026-10-20", today)).toEqual({ kind: "today" });
    expect(examCountdown("2026-10-21", today)).toEqual({ kind: "tomorrow" });
    expect(examCountdown("2027-04-02", today)).toEqual({ kind: "days", days: 164 });
    expect(examCountdown("2030-01-01", today)).toEqual({ kind: "tooFar" });
  });

  it("times the countdown's rollover to the next midnight in India time", () => {
    // 23:59 IST on 20 Oct is 18:29 UTC: one minute to go.
    expect(msUntilNextIstMidnight(Date.UTC(2026, 9, 20, 18, 29))).toBe(60_000);
    // Exactly midnight IST: the next rollover is a full day away (never 0, so no busy loop).
    expect(msUntilNextIstMidnight(Date.UTC(2026, 9, 20, 18, 30))).toBe(24 * 60 * 60 * 1000);
    // Midday UTC is 17:30 IST: six and a half hours left.
    expect(msUntilNextIstMidnight(Date.UTC(2026, 9, 20, 12, 0))).toBe(6.5 * 60 * 60 * 1000);
  });

  it("splits a template around one placeholder", () => {
    expect(splitTemplate("{days} days to {exam}", "days")).toEqual(["", " days to {exam}"]);
    expect(splitTemplate("{exam} में {days} दिन बाकी", "days")).toEqual(["{exam} में ", " दिन बाकी"]);
    expect(splitTemplate("no token", "days")).toEqual(["no token", ""]);
  });
});

describe("home tools data", () => {
  it("passes only score tables and visible tests with placeholder content on", () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const data = getHomeToolsData();
    expect(data.predictor?.data.scoreTables.length).toBeGreaterThan(0);
    expect(data.predictor?.data.cutoffTables).toEqual([]);
    expect(data.predictor?.sample).toBe(true);
    expect(data.tests.length).toBeGreaterThan(0);
    expect(data.tests.length).toBeLessThanOrEqual(HOME_MOCK_TEST_LIMIT);
    for (const test of data.tests) expect(getAllMockTestIds()).toContain(test.id);
    expect(data.planner).toEqual({ available: true, sample: true });
  });

  it("sends no sample tables or tests in production", () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const data = getHomeToolsData();
    expect(data.predictor).toBeNull();
    expect(data.tests).toEqual([]);
    expect(data.leaderboard).toBe(false);
    expect(data.planner.available).toBe(false);
  });
});

describe("HomeTools section", () => {
  it("renders a WAI-ARIA tabs widget with the predictor selected in the server HTML", () => {
    const html = renderTools("en", true);
    const t = messagesFor("en", "home").tools;
    expect(html).toContain('aria-labelledby="home-tools-title"');
    expect(html).toContain(`id="home-tools-title"`);
    expect(html).toContain(esc(t.title));

    const tablist = html.match(/<div[^>]*role="tablist"[^>]*>/)?.[0] ?? "";
    expect(attr(tablist, "aria-label")).toBe(messagesFor("en", "tools").meta.title);
    expect(attr(tablist, "aria-orientation")).toBe("horizontal");

    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
    expect(tabs).toHaveLength(HOME_TOOL_KEYS.length);
    HOME_TOOL_KEYS.forEach((key, index) => {
      const tab = tabs[index];
      expect(attr(tab, "id")).toBe(homeToolTabId(key));
      expect(attr(tab, "aria-controls")).toBe(homeToolPanelId(key));
      expect(attr(tab, "aria-selected")).toBe(index === 0 ? "true" : "false");
      expect(attr(tab, "tabindex")).toBe(index === 0 ? "0" : "-1");
      expect(attr(tab, "type")).toBe("button");
      expect(html).toContain(`>${esc(t.tabs[key])}</span>`);
    });

    const panels = [...html.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map((m) => m[0]);
    expect(panels).toHaveLength(HOME_TOOL_KEYS.length);
    HOME_TOOL_KEYS.forEach((key, index) => {
      expect(attr(panels[index], "id")).toBe(homeToolPanelId(key));
      expect(attr(panels[index], "aria-labelledby")).toBe(homeToolTabId(key));
      expect(attr(panels[index], "data-state")).toBe(index === 0 ? "active" : "inactive");
    });
  });

  it("has unique ids and every aria reference points at an element in the section", () => {
    const html = renderTools("en", true);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const refs = [...html.matchAll(/\s(?:aria-controls|aria-labelledby|aria-describedby|for)="([^"]+)"/g)].flatMap((m) => m[1].split(" "));
    expect(refs.length).toBeGreaterThan(8);
    for (const ref of refs) expect(ids, `reference ${ref}`).toContain(ref);
  });

  it("shows the mini predictor with labelled inputs, the sample label and no field names", () => {
    const html = renderTools("en", true);
    const p = panel(html, "predictor");
    const tp = messagesFor("en", "predictor");
    const tools = messagesFor("en", "tools");
    expect(p).toContain(esc(tools.items.predictor.title));
    expect(p).toContain(`>${esc(tools.status.sample)}<`);
    expect(p).toContain(esc(tp.form.submit));
    expect(p).toContain(esc(format(tp.form.scoreHint, { min: "-75", max: "300" })));
    expect(p).toContain(esc(messagesFor("en", "home").tools.predictor.empty));
    // One short sr-only status, empty until "Predict"; the visible placeholder and band are not live.
    expect(p).toMatch(/<p role="status" aria-live="polite" aria-atomic="true" class="sr-only"><\/p>/);
    expect(p.match(/aria-live=/g)).toHaveLength(1);
    // Only exams with a loaded table are offered.
    for (const exam of ["jee-main", "neet-ug", "boh"]) expect(p).toContain(`value="${exam}"`);
    // Every input / select is labelled and has no `name` (nothing typed can reach a URL).
    for (const control of p.match(/<(?:input|select)\b[^>]*>/g) ?? []) {
      expect(control).not.toMatch(/\sname=/);
      expect(p).toContain(`for="${attr(control, "id")}"`);
    }
    expect(hrefsOf(p)).toEqual(["/tools/predictor"]);
  });

  it("lists up to three mock tests, each starting a real test route, plus the leaderboard", () => {
    const html = renderTools("en", true);
    const p = panel(html, "mockTests");
    const tm = messagesFor("en", "mocktest");
    const tests = getHomeToolsData().tests;
    for (const test of tests) {
      expect(p).toContain(esc(test.title.en));
      expect(p).toContain(`>${esc(test.kind === "weekly" ? tm.list.weekly : tm.list.practice)}<`);
      expect(p).toContain(esc(format(tm.common.questions, { n: test.questionCount })));
      expect(p).toContain(esc(format(tm.common.minutes, { n: test.durationMinutes })));
      expect(hrefsOf(p)).toContain(`/tools/mock-tests/${test.id}`);
    }
    if (tests.some((test) => test.sample)) expect(p).toContain(`>${esc(tm.common.sample)}<`);
    expect(hrefsOf(p)).toContain("/tools/mock-tests/leaderboard");
    expect(hrefsOf(p)).toContain("/tools/mock-tests");
    for (const href of hrefsOf(html)) expectRealRoute(href);
  });

  it("introduces Rancho, Aspire's snow leopard mascot, with plain example doubts, the AI caveat and no question text in links", () => {
    const html = renderTools("en", true);
    const p = panel(html, "ask");
    const t = messagesFor("en", "home").tools.ask;
    const ta = messagesFor("en", "ask");
    expect(html).toContain(`>${esc(messagesFor("en", "home").tools.tabs.ask)}</span>`);
    expect(t.title).toBe("Ask Rancho");
    expect(t.lead).toMatch(/^Rancho, Aspire's friendly snow leopard/);
    expect(p).toContain(esc(t.title));
    expect(p).toContain(esc(t.lead));
    expect(p).not.toContain("Ask Aspire");
    for (const example of Object.values(t.examples)) expect(p).toContain(esc(example));
    expect(p).toContain(esc(ta.answer.disclaimer));
    expect(hrefsOf(p)).toEqual(["/tools/ask"]);
    // No allowance numbers are hard-coded here.
    expect(p).not.toMatch(/questions left|per day|a day/i);
  });

  it("shows Rancho's head as the Ask tab icon and beside the Ask title, decorative only", () => {
    const html = renderTools("en", true);
    const askTab = html.match(new RegExp(`<button[^>]*id="${homeToolTabId("ask")}"[\\s\\S]*?</button>`))?.[0] ?? "";
    expect(askTab, "ask tab").not.toBe("");
    const mascotIn = (markup: string) => markup.match(/<(?:svg|img)\b[^>]*data-rancho="head"[^>]*>/)?.[0] ?? "";
    for (const [where, markup] of [
      ["ask tab", askTab],
      ["ask panel", panel(html, "ask")],
    ] as const) {
      const mascot = mascotIn(markup);
      expect(mascot, `${where} mascot`).not.toBe("");
      expect(attr(mascot, "aria-hidden"), where).toBe("true");
      expect(mascot, where).not.toMatch(/\srole="img"/);
    }
    // No accessible name: the tab is named by its label alone.
    expect(askTab).not.toMatch(/<title\b/);
    // Only the Ask tab and panel use the mascot; the other tabs keep their icons.
    expect(html.match(/data-rancho="/g)).toHaveLength(2);
    for (const key of HOME_TOOL_KEYS.filter((k) => k !== "ask")) expect(mascotIn(panel(html, key)), key).toBe("");
  });

  it("shows the planner countdown form and features, linking to the planner", () => {
    const html = renderTools("en", true);
    const p = panel(html, "planner");
    const t = messagesFor("en", "home").tools.planner;
    expect(p).toContain('type="date"');
    expect(p).toContain(esc(t.prompt));
    for (const feature of Object.values(t.features)) expect(p).toContain(esc(feature));
    expect(p).toContain(esc(messagesFor("en", "planner").form.submit));
    expect(hrefsOf(p)).toEqual(["/tools/planner"]);
  });

  it("uses no photos and stores nothing", () => {
    const html = renderTools("en", true);
    // Rancho is illustration, not a photo: allowed even once the official art renders as an <img>.
    expect(html.replace(/<img\b[^>]*data-rancho="[^"]*"[^>]*>/g, "")).not.toMatch(/<img\b/);
    expect(html).not.toMatch(/localStorage|sessionStorage/);
  });

  it("renders in Hindi with Hindi copy and /hi links only", () => {
    const html = renderTools("hi", true);
    const hi = messagesFor("hi", "home").tools;
    expect(html).toContain(esc(hi.title));
    expect(html).toContain(esc(hi.tabs.predictor));
    expect(html).toContain(esc(hi.ask.title));
    expect(html).toContain("रैंचो");
    expect(html).toContain(esc(messagesFor("hi", "predictor").form.submit));
    expect(html).not.toContain(esc(messagesFor("en", "home").tools.title));
    const hrefs = hrefsOf(html);
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      expect(href, href).toMatch(/^\/hi\//);
      expectRealRoute(href);
    }
  });

  it("falls back to honest descriptions in production (no sample tables, tests or badges)", () => {
    const html = renderTools("en", false);
    const tp = messagesFor("en", "predictor");
    const tm = messagesFor("en", "mocktest");
    const predictor = panel(html, "predictor");
    expect(predictor).toContain(esc(tp.notices.comingSoonTitle));
    expect(predictor).not.toMatch(/<input\b/);
    expect(predictor).toContain('href="/tools/predictor"');
    expect(panel(html, "mockTests")).toContain(esc(tm.comingSoon.title));
    expect(panel(html, "mockTests")).not.toContain("/tools/mock-tests/leaderboard");
    expect(panel(html, "planner")).toContain(esc(messagesFor("en", "planner").unavailable.title));
    expect(html).not.toContain(`>${esc(messagesFor("en", "tools").status.sample)}<`);
    expect(html).not.toMatch(/>Sample</);
  });
});

describe("HomeTools results", () => {
  const tp = messagesFor("en", "predictor");
  const bandMessages = {
    crl: tp.result.crl,
    range: tp.result.range,
    percentileBand: tp.result.percentileBand,
    percentileYours: tp.result.percentileYours,
    basedOn: tp.result.basedOn,
    basedOnSample: tp.result.basedOnSample,
    bandNote: tp.result.bandNote,
    exams: tp.form.exams,
  };

  it("shows the computed band with the sample-table label", () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const result = predictRankBand({ exam: "jee-main", mode: "score", value: 180 }, getPredictorData());
    expect(result.status).toBe("ok");
    const band = result as RankBandPrediction;
    const html = renderToStaticMarkup(createElement(HomeToolsBand, { band, locale: "en", messages: bandMessages }));
    expect(html).toContain(esc(tp.result.crl["jee-main"]));
    expect(html).toContain(esc(formatRankRange(band.crl, "en", tp.result.range)));
    expect(html).toContain(esc(format(tp.result.basedOnSample, { exam: "JEE Main", year: band.year })));
    expect(html).toContain(esc(tp.result.bandNote));
  });

  it("shows the countdown and its edge-case messages", () => {
    const t = messagesFor("en", "home").tools.planner;
    const tpl = messagesFor("en", "planner");
    const messages = { ...t, tomorrow: tpl.today.countdownTomorrow, tooFar: tpl.form.errors.examDateFar };
    const view = (countdown: Parameters<typeof CountdownView>[0]["countdown"]) =>
      renderToStaticMarkup(createElement(CountdownView, { countdown, exam: "JEE Main", messages })).replace(/<[^>]+>/g, "");
    expect(view({ kind: "days", days: 164 })).toBe("164 days to JEE Main");
    expect(view({ kind: "today" })).toBe("JEE Main is today — all the best!");
    expect(view({ kind: "tomorrow" })).toBe(format(tpl.today.countdownTomorrow, { exam: "JEE Main" }));
    expect(view({ kind: "past" })).toBe(t.past);
    expect(view({ kind: "tooFar" })).toBe(tpl.form.errors.examDateFar);
    expect(view({ kind: "empty" })).toBe(t.prompt);
  });
});

describe("HomeTools on the homepage", () => {
  /** Owner request: mid-page, right after programs and before "why" — never near the bottom. */
  const ORDER = ["home-results-title", "home-programs-title", "home-tools-title", "home-approach-title"];

  it.each([
    ["en", true],
    ["en", false],
    ["hi", true],
  ] as const)("renders between programs and why (%s, placeholders %s)", async (locale, placeholders) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders ? "true" : "false");
    const html = await withTestLang(locale, async () => renderToStaticMarkup(await HomePage()));
    const positions = ORDER.map((id) => html.indexOf(`aria-labelledby="${id}"`));
    for (const [index, position] of positions.entries()) expect(position, ORDER[index]).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html.match(/aria-labelledby="home-tools-title"/g)).toHaveLength(1);
    // Well before the end: every later section and the closing CTA come after it.
    const tools = positions[2];
    for (const later of ["home-life-title", "home-cta-title"]) {
      expect(html.indexOf(`aria-labelledby="${later}"`)).toBeGreaterThan(tools);
    }
  });
});
