import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { clampToolSummary, TOOL_CONTEXT_MAX_CHARS, type RanchoOpenDetail } from "@/lib/ask/cards";
import { countdownRanchoDetail, homeToolPanelId } from "./home-tools";
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

  it.each(["en", "hi"] as Locale[])("%s: the Ask tab's button opens the floating chat, with a plain /tools/ask link as fallback", (locale) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = renderToStaticMarkup(createElement(HomeTools, { tools: getHomeToolsData(), locale }));
    const panelOf = (key: "predictor" | "ask" | "planner") => {
      const start = html.indexOf(`id="${homeToolPanelId(key)}"`);
      const next = html.indexOf('role="tabpanel"', start + 1);
      return html.slice(start, next === -1 ? undefined : next);
    };
    const anchors = panelOf("ask").match(/<a\b[^>]*>/g) ?? [];
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toContain(`href="${locale === "hi" ? "/hi" : ""}/tools/ask"`);
    expect(anchors[0]).toContain("data-ask-rancho");
    expect(panelOf("ask")).toContain(esc(messagesFor(locale, "ask").form.heading));
    // The predictor and planner buttons appear only after a result / an exam date (client state).
    expect(panelOf("predictor")).not.toContain("data-ask-rancho");
    expect(panelOf("planner")).not.toContain("data-ask-rancho");
  });

  it("the Ask tab hands over no prompt and no context (it just opens the chat)", () => {
    const source = renderToStaticMarkup(createElement(Link, { href: "/tools/ask", detail: {}, mascot: false }, "Ask"));
    expect(source).toContain('href="/tools/ask"');
    expect(clickAskRancho({}).received).toEqual([{}]);
  });

  it("new strings exist in both languages and the Hindi ones are in Devanagari", () => {
    const en = messagesFor("en", "home").tools.planner;
    const hi = messagesFor("hi", "home").tools.planner;
    for (const key of ["askRancho", "askRanchoPrompt", "askRanchoContext"] as const) {
      expect(en[key].trim()).not.toBe("");
      expect(hi[key]).not.toBe(en[key]);
      expect(hi[key]).toMatch(/[ऀ-ॿ]/);
    }
  });
});
