import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { clampToolSummary, TOOL_CONTEXT_MAX_CHARS, type RanchoOpenDetail } from "@/lib/ask/cards";
import { askExampleDetail, countdownRanchoDetail, HOME_ASK_EXAMPLES, homeToolPanelId } from "./home-tools";
import { getHomeToolsData } from "./home-tools-data";
import { clickAskRancho, fakeClick, fakeDocument, fakeLauncher } from "./home-tools-rancho.testkit";
import { HomeTools } from "./HomeTools";
import { AskRanchoLink, handleAskRanchoClick, RANCHO_OPEN_CHECK_MS, ranchoChatOnPage } from "./HomeToolsAskRancho";

/**
 * "Ask Rancho about this" (tools track): the shared link opens the page's Rancho chat through
 * `openRancho()` (a window CustomEvent, never a URL) and degrades to a plain link to /tools/ask.
 */

/** `children` is required in the props type; createElement passes it as an argument. */
const Link = AskRanchoLink as (props: Omit<ComponentProps<typeof AskRanchoLink>, "children"> & { children?: ReactNode }) => ReactNode;

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AskRanchoLink", () => {
  const detail: RanchoOpenDetail = { prompt: "How can I improve?", toolContext: { tool: "predictor", summary: "JEE Main, score 180–189" } };

  it("a plain click on a page with the floating chat opens Rancho with the context instead of following the link", () => {
    const { handled, prevented, received } = clickAskRancho(detail);
    expect(handled).toBe(true);
    expect(prevented).toBe(true);
    expect(received).toEqual([detail]);
    expect("window" in globalThis).toBe(false);
  });

  it("keeps the normal link without the floating chat, for modified / middle clicks and when already handled", () => {
    const cases = [
      { withLauncher: false, event: fakeClick() },
      { withLauncher: true, event: fakeClick({ ctrlKey: true }) },
      { withLauncher: true, event: fakeClick({ metaKey: true }) },
      { withLauncher: true, event: fakeClick({ shiftKey: true }) },
      { withLauncher: true, event: fakeClick({ altKey: true }) },
      { withLauncher: true, event: fakeClick({ button: 1 }) },
      { withLauncher: true, event: fakeClick({ defaultPrevented: true }) },
    ];
    for (const options of cases) {
      const { handled, prevented, received } = clickAskRancho(detail, options);
      expect(handled).toBe(false);
      expect(prevented).toBe(false);
      expect(received).toEqual([]);
    }
    // Server render / no document: nothing to hand over to.
    expect(handleAskRanchoClick(fakeClick(), detail, null)).toBe(false);
  });

  it("follows the link after all when the launcher is not listening yet (still hydrating)", () => {
    vi.useFakeTimers();
    try {
      // Launcher HTML present, listener not attached: the panel stays closed, so the link is followed.
      const asleep = vi.fn();
      const missed = clickAskRancho(detail, { launcher: fakeLauncher("false"), listening: false, followLink: asleep });
      expect(missed.handled).toBe(true);
      expect(missed.received).toEqual([detail]);
      vi.advanceTimersByTime(RANCHO_OPEN_CHECK_MS - 1);
      expect(asleep).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(asleep).toHaveBeenCalledTimes(1);

      // Hydrated launcher: its panel opens (aria-expanded="true"), the page stays.
      const awake = vi.fn();
      clickAskRancho(detail, { launcher: fakeLauncher("false"), followLink: awake });
      vi.advanceTimersByTime(RANCHO_OPEN_CHECK_MS * 2);
      expect(awake).not.toHaveBeenCalled();

      // Panel already open, or a launcher that does not report aria-expanded: trusted, no check.
      for (const launcher of [fakeLauncher("true"), fakeLauncher(null)]) {
        const follow = vi.fn();
        clickAskRancho(detail, { launcher, listening: false, followLink: follow });
        vi.advanceTimersByTime(RANCHO_OPEN_CHECK_MS * 2);
        expect(follow).not.toHaveBeenCalled();
      }

      // Not taken over (modified click): the browser follows the link itself, nothing scheduled.
      const modified = vi.fn();
      clickAskRancho(detail, { launcher: fakeLauncher("false"), listening: false, followLink: modified, event: fakeClick({ ctrlKey: true }) });
      vi.advanceTimersByTime(RANCHO_OPEN_CHECK_MS * 2);
      expect(modified).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("finds the floating chat by the launcher's data attribute", () => {
    expect(ranchoChatOnPage(fakeDocument(true))).toBe(true);
    expect(ranchoChatOnPage(fakeDocument(false))).toBe(false);
    expect(ranchoChatOnPage(undefined)).toBe(false);
  });

  it("renders as a real link to the Ask page (works before hydration and without JS), with a decorative Rancho head", () => {
    const html = renderToStaticMarkup(createElement(Link, { href: "/hi/tools/ask", detail, size: "sm" }, "रैंचो से पूछें"));
    const anchor = html.match(/<a\b[^>]*>/)?.[0] ?? "";
    expect(anchor).toContain('href="/hi/tools/ask"');
    expect(anchor).toContain("data-ask-rancho");
    expect(html).toContain("रैंचो से पूछें");
    // The context never goes into the markup or the URL.
    expect(html).not.toContain("JEE Main");
    expect(html).not.toContain("How can I improve");
    const mascot = html.match(/<(?:svg|img)\b[^>]*data-rancho="head"[^>]*>/)?.[0] ?? "";
    expect(mascot).not.toBe("");
    expect(mascot).toContain('aria-hidden="true"');
    expect(mascot).not.toMatch(/\srole="img"/);
    const plain = renderToStaticMarkup(createElement(Link, { href: "/tools/ask", detail, mascot: false }, "Ask"));
    expect(plain).not.toContain("data-rancho=");
  });
});

describe("homepage widget hand-offs", () => {
  it.each(["en", "hi"] as const)("%s: the countdown asks Rancho for a plan with the exam and days left only", (locale) => {
    const t = messagesFor(locale, "home").tools.planner;
    const exam = messagesFor(locale, "planner").exams["jee-main"];
    const detail = countdownRanchoDetail({ kind: "days", days: 1640 }, exam, t);
    expect(detail).not.toBeNull();
    const { received } = clickAskRancho(detail!);
    expect(received).toHaveLength(1);
    expect(received[0].prompt).toBe(t.askRanchoPrompt);
    expect(received[0].toolContext?.tool).toBe("planner");
    const summary = received[0].toolContext!.summary;
    expect(summary).toBe(format(t.askRanchoContext, { exam, days: "1,640" }));
    expect(summary.length).toBeLessThanOrEqual(TOOL_CONTEXT_MAX_CHARS);
    expect(clampToolSummary(summary)).toBe(summary);
    for (const kind of ["empty", "past", "today", "tomorrow", "tooFar"] as const) expect(countdownRanchoDetail({ kind }, exam, t), kind).toBeNull();
  });

  it.each(["en", "hi"] as Locale[])("%s: the Ask tab's button and example bubbles open the floating chat, with a plain /tools/ask link as fallback", (locale) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = renderToStaticMarkup(createElement(HomeTools, { tools: getHomeToolsData(), locale }));
    /** One tab panel's element (balanced divs), so the card's footer is never part of the last one. */
    const panelOf = (key: "predictor" | "ask" | "planner") => {
      const start = html.lastIndexOf("<div", html.indexOf(`id="${homeToolPanelId(key)}"`));
      const tags = /<div\b|<\/div>/g;
      tags.lastIndex = start;
      let depth = 0;
      for (let match = tags.exec(html); match; match = tags.exec(html)) {
        depth += match[0] === "</div>" ? -1 : 1;
        if (depth === 0) return html.slice(start, match.index + match[0].length);
      }
      throw new Error("unbalanced markup");
    };
    const prefix = locale === "hi" ? "/hi" : "";
    const anchors = panelOf("ask").match(/<a\b[^>]*>/g) ?? [];
    expect(anchors).toHaveLength(6);
    const handOffs = anchors.filter((anchor) => anchor.includes("data-ask-rancho"));
    expect(handOffs).toHaveLength(5); // "Chat with Rancho" + the four example bubbles
    for (const anchor of handOffs) {
      // Exactly the Ask page: no question text, query or fragment in the URL.
      expect(anchor).toContain(`href="${prefix}/tools/ask"`);
      expect(anchor).not.toMatch(/href="[^"]*[?#]/);
    }
    const others = anchors.filter((anchor) => !anchor.includes("data-ask-rancho"));
    expect(others).toHaveLength(1);
    expect(others[0]).toContain(`href="${prefix}/rancho"`);
    expect(panelOf("ask")).toContain(esc(messagesFor(locale, "home").tools.ask.cta));
    // The predictor and planner buttons appear only after a result / a countdown (client state).
    expect(panelOf("predictor")).not.toContain("data-ask-rancho");
    expect(panelOf("planner")).not.toContain("data-ask-rancho");
  });

  it.each(["en", "hi"] as Locale[])("%s: an example bubble hands over just that question (no tool context)", (locale) => {
    const examples = messagesFor(locale, "home").tools.ask.examples;
    for (const key of HOME_ASK_EXAMPLES) {
      expect(clickAskRancho(askExampleDetail(examples[key])).received).toEqual([{ prompt: examples[key] }]);
    }
  });

  it("renders a plain-styled link (the example bubbles) without the button styles, keeping the hand-off and fallback", () => {
    const className = "flex min-h-11 w-full items-start rounded-2xl bg-white";
    const plain = renderToStaticMarkup(createElement(Link, { href: "/tools/ask", detail: {}, appearance: "plain", mascot: false, className }, "Q"));
    const anchor = plain.match(/<a\b[^>]*>/)?.[0] ?? "";
    expect(anchor).toContain('href="/tools/ask"');
    expect(anchor).toContain("data-ask-rancho");
    expect(anchor).toContain(`class="${className}"`);
    expect(anchor).not.toMatch(/rounded-control|justify-center/);
    // The default is the button, as on the other tool pages.
    const button = renderToStaticMarkup(createElement(Link, { href: "/tools/ask", detail: {}, mascot: false, className: "mt-3" }, "Q"));
    const buttonAnchor = button.match(/<a\b[^>]*>/)?.[0] ?? "";
    expect(buttonAnchor).toMatch(/class="[^"]*\brounded-control\b[^"]*\bmt-3"/);
    expect(buttonAnchor).toMatch(/class="[^"]*\bjustify-center\b/);
  });

  it("the Ask tab hands over no prompt and no context (it just opens the chat)", () => {
    const source = renderToStaticMarkup(createElement(Link, { href: "/tools/ask", detail: {}, mascot: false }, "Ask"));
    expect(source).toContain('href="/tools/ask"');
    expect(clickAskRancho({}).received).toEqual([{}]);
  });

  it("new strings exist in both languages and the Hindi ones are in Devanagari", () => {
    const en = messagesFor("en", "home").tools;
    const hi = messagesFor("hi", "home").tools;
    const pairs: [string, string, string][] = [
      ...(["askRancho", "askRanchoPrompt", "askRanchoContext", "submit", "ready", "change", "dateMissing", "pressToShow"] as const).map(
        (key): [string, string, string] => [`planner.${key}`, en.planner[key], hi.planner[key]],
      ),
      ...(["cta", "app"] as const).map((key): [string, string, string] => [`ask.${key}`, en.ask[key], hi.ask[key]]),
      ...(["score", "percentile"] as const).map((key): [string, string, string] => [`predictor.change.${key}`, en.predictor.change[key], hi.predictor.change[key]]),
      ...(["score", "percentile"] as const).map((key): [string, string, string] => [`predictor.ready.${key}`, en.predictor.ready[key], hi.predictor.ready[key]]),
      ...(["predictor", "mockTests", "ask", "planner"] as const).flatMap((key): [string, string, string][] => [
        [`tabsShort.${key}`, en.tabsShort[key], hi.tabsShort[key]],
        [`taglines.${key}`, en.taglines[key], hi.taglines[key]],
      ]),
    ];
    for (const [key, enText, hiText] of pairs) {
      expect(enText.trim(), key).not.toBe("");
      expect(hiText, key).not.toBe(enText);
      expect(hiText, key).toMatch(/[ऀ-ॿ]/);
    }
    // The recaps keep their placeholders in both languages.
    for (const text of [en.predictor.ready.score, hi.predictor.ready.score, en.predictor.ready.percentile, hi.predictor.ready.percentile]) {
      expect(text).toContain("{exam}");
      expect(text).toContain("{value}");
    }
    expect(en.planner.ready).toContain("{exam}");
    expect(hi.planner.ready).toContain("{exam}");
    // Names the real button in both languages.
    expect(format(en.planner.pressToShow, { button: en.planner.submit })).toContain(en.planner.submit);
    expect(format(hi.planner.pressToShow, { button: hi.planner.submit })).toContain(hi.planner.submit);
    // Same word as the form's button (leadGate.submitFor.countdown).
    expect(hi.planner.ready).toContain("काउंटडाउन");
    expect(messagesFor("hi", "leadGate").submitFor.countdown).toContain("काउंटडाउन");
  });
});
