import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { messagesFor } from "@/i18n/messages";
import { openRancho, RANCHO_OPEN_EVENT, TOOL_CONTEXT_MAX_CHARS } from "@/lib/ask/cards";
import { ASK_ENDPOINT, ASK_MAX_QUESTION_CHARS } from "@/lib/ask/constants";
import { askRequestSchema } from "@/lib/ask/schema";

import { RanchoChatPanel } from "./RanchoChatPanel";
import { askRancho, buildAskBody } from "./rancho-chat";
import { listenForRanchoOpen, readOpenDetail, type RanchoHandoff } from "./rancho-handoff";
import { elementHtml, escapeHtml as escape, textOf } from "./rancho-test-html";

/** "Ask Rancho about this": the open event, the prefilled composer with its context chip, and toolContext in the POST. */

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = "JEE Main, score 180, rank band 2,700–6,000 (sample data)";

describe("reading the handoff", () => {
  it("keeps a capped prompt and a valid tool context", () => {
    expect(readOpenDetail({ prompt: "  What does this band mean?  ", toolContext: { tool: "predictor", summary } })).toEqual({
      prompt: "What does this band mean?",
      toolContext: { tool: "predictor", summary },
    });
    expect(readOpenDetail({ prompt: `a\u0000b${"x".repeat(ASK_MAX_QUESTION_CHARS + 50)}` }).prompt).toHaveLength(ASK_MAX_QUESTION_CHARS);
    const long = readOpenDetail({ toolContext: { tool: "planner", summary: "s ".repeat(400) } });
    expect(long.toolContext?.summary.length).toBeLessThanOrEqual(TOOL_CONTEXT_MAX_CHARS);
  });

  it("drops unknown tools, empty summaries and junk (the panel still opens)", () => {
    expect(readOpenDetail({ toolContext: { tool: "crm", summary } })).toEqual({ prompt: "", toolContext: null });
    expect(readOpenDetail({ toolContext: { tool: "predictor", summary: "  " } }).toolContext).toBeNull();
    expect(readOpenDetail(undefined)).toEqual({ prompt: "", toolContext: null });
    expect(readOpenDetail("open")).toEqual({ prompt: "", toolContext: null });
    expect(readOpenDetail({ prompt: 42 })).toEqual({ prompt: "", toolContext: null });
  });

  it("openRancho() reaches a listener on window, each handoff with a new id, until unsubscribed", () => {
    vi.stubGlobal("window", new EventTarget());
    const seen: RanchoHandoff[] = [];
    const stop = listenForRanchoOpen((handoff) => seen.push(handoff));
    openRancho({ prompt: "Explain my rank band", toolContext: { tool: "predictor", summary } });
    openRancho({});
    stop();
    openRancho({ prompt: "after unsubscribe" });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ prompt: "Explain my rank band", toolContext: { tool: "predictor", summary } });
    expect(seen[1]).toMatchObject({ prompt: "", toolContext: null });
    expect(seen[1].id).toBeGreaterThan(seen[0].id);
    expect(RANCHO_OPEN_EVENT).toBe("rancho:open");
  });

  it("is a no-op without a window (server)", () => {
    expect(() => listenForRanchoOpen(() => {})()).not.toThrow();
  });
});

describe("the chat after a handoff", () => {
  const render = (handoff: RanchoHandoff | null, locale: "en" | "hi" = "en") =>
    renderToStaticMarkup(
      createElement(RanchoChatPanel, {
        id: "rancho-panel",
        open: false,
        onClose: () => {},
        messages: messagesFor(locale, "rancho").panel,
        locale,
        links: { ask: "/tools/ask", enquiry: "/admissions#enquiry", privacy: "/privacy", signIn: "/login" },
        handoff,
      }),
    );

  it.each(["en", "hi"] as const)("prefills the field and shows a removable 'From <tool>' chip (%s)", (locale) => {
    const t = messagesFor(locale, "rancho").panel;
    const html = render({ id: 7, prompt: "What does my rank band mean?", toolContext: { tool: "predictor", summary } }, locale);
    expect(html).toMatch(/<textarea [^>]*>What does my rank band mean\?<\/textarea>/);
    const chip = elementHtml(html, /<div data-rancho-context=""/, "div");
    expect(textOf(chip)).toContain(`${t.handoff.tools.predictor}`);
    expect(textOf(chip)).toContain(summary);
    expect(chip).toContain(`<span class="sr-only">${escape(t.handoff.remove)}</span>`);
    // The chip sits in the composer, above the input row.
    const form = elementHtml(html, /<form [^>]*data-rancho-composer=""/, "form");
    expect(form.indexOf("data-rancho-context")).toBeLessThan(form.indexOf("<textarea"));
  });

  it("without a handoff: an empty field and no chip", () => {
    const html = render(null);
    expect(html).toMatch(/<textarea [^>]*><\/textarea>/);
    expect(html).not.toContain("data-rancho-context");
  });

  it("only a context (no prompt): the chip, and the field keeps what was typed", () => {
    const html = render({ id: 8, prompt: "", toolContext: { tool: "planner", summary: "NEET, 193 days left" } });
    expect(html).toContain("data-rancho-context");
    expect(html).toMatch(/<textarea [^>]*><\/textarea>/);
  });

  it("sends toolContext once with the next question (clamped), which the API's schema accepts", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(`${JSON.stringify({ t: "done", stop: "end_turn", meta: null })}\n`, { status: 200 }));
    await askRancho(
      { question: "Explain my band", subject: "auto", language: "en", toolContext: { tool: "predictor", summary: `${summary} ${"x".repeat(400)}` } },
      { signal: new AbortController().signal, fetchImpl },
    );
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(ASK_ENDPOINT);
    const body = JSON.parse(String(init?.body));
    expect(body.toolContext.tool).toBe("predictor");
    expect(body.toolContext.summary.startsWith(summary)).toBe(true);
    expect(body.toolContext.summary.length).toBeLessThanOrEqual(TOOL_CONTEXT_MAX_CHARS);
    expect(askRequestSchema.safeParse(body).success).toBe(true);
    // Without a handoff there is no toolContext key at all.
    expect(buildAskBody({ question: "q", subject: "auto", language: "en" })).not.toHaveProperty("toolContext");
    expect(buildAskBody({ question: "q", subject: "auto", language: "en", toolContext: null })).not.toHaveProperty("toolContext");
  });

  it("the chat sends the chip's context and then clears it; the launcher and the page chat listen", () => {
    const dir = join(process.cwd(), "src", "components", "rancho");
    const chat = readFileSync(join(dir, "RanchoChat.tsx"), "utf8");
    const send = chat.slice(chat.indexOf("async function send("), chat.indexOf("function stop()"));
    expect(send).toContain("const context = toolContext;");
    expect(send).toContain("toolContext: context }");
    expect(send).toContain("setToolContext(null);");
    expect(chat).toContain("listenForRanchoOpen(setPageHandoff)");
    const launcher = readFileSync(join(dir, "RanchoLauncher.tsx"), "utf8");
    expect(launcher).toMatch(/if \(hidden\) return;\r?\n\s*return listenForRanchoOpen\(/);
    expect(launcher).toContain("handoff={handoff}");
    // Never in the URL or in storage.
    for (const source of [chat, launcher, readFileSync(join(dir, "rancho-handoff.ts"), "utf8")]) {
      expect(source).not.toMatch(/searchParams|router\.push|localStorage|sessionStorage/);
    }
  });
});
