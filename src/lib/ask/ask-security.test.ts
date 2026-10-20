import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnswerContent } from "@/components/ask/AnswerContent";

import { headingText, parseAnswer } from "./markdown";
import { splitAnswer } from "./trailer";

/**
 * QA-SEC-M6: adversarial model output through the whitelist renderer (the model can be steered by
 * the student's question or photo, so its text is untrusted). Nothing may become markup, a link,
 * an image, a style or an event handler; everything must come out as escaped text.
 */

const PAYLOADS = [
  "<script>alert(1)</script>",
  '<img src=x onerror="alert(1)">',
  "<svg/onload=alert(1)>",
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  "<style>body{display:none}</style>",
  '<a href="javascript:alert(1)">click</a>',
  "[click me](javascript:alert(1))",
  "![x](https://evil.example/x.png)",
  "<https://evil.example>",
  '<form action="https://evil.example"><input name=p></form>',
  "&lt;script&gt;alert(1)&lt;/script&gt;",
  '"><img src=x onerror=alert(1)>',
  "<math><mi xlink:href=javascript:alert(1)>x</mi></math>",
];

const WRAPPERS: ((p: string) => string)[] = [
  (p) => p,
  (p) => `## ${p}`,
  (p) => `#### ${p} ###`,
  (p) => `**${p}**`,
  (p) => `*${p}*`,
  (p) => `\`${p}\``,
  (p) => `1. ${p}\n2. **${p}**`,
  (p) => `- ${p}\n  continued ${p}`,
  (p) => `\`\`\`html\n${p}\n\`\`\``,
  (p) => `**Final answer:** ${p}`,
  (p) => `x^(${p.slice(0, 20)}) and e^${p.slice(0, 8)}`,
];

function render(text: string): string {
  return renderToStaticMarkup(createElement(AnswerContent, { text }));
}

/** Tags the renderer itself may produce. */
const ALLOWED_TAGS = new Set(["div", "p", "span", "br", "h3", "h4", "ol", "ul", "li", "pre", "code", "strong", "em", "sup", "hr"]);

describe("Ask Aspire answer renderer — adversarial model output (QA-SEC-M6)", () => {
  it.each(PAYLOADS)("never turns %s into markup in any block or inline context", (payload) => {
    for (const wrap of WRAPPERS) {
      const html = render(wrap(payload));
      const tags = [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)].map((m) => m[1].toLowerCase());
      for (const tag of tags) expect(ALLOWED_TAGS.has(tag), `${tag} in ${html}`).toBe(true);
      // Attributes come only from the renderer: class, start (ol). No href/src/on*/style/srcdoc/action.
      const attributes = [...html.matchAll(/<[a-zA-Z][^>]*?\s([a-zA-Z-]+)=/g)].map((m) => m[1].toLowerCase());
      for (const attribute of attributes) expect(["class", "start"], `${attribute} in ${html}`).toContain(attribute);
      // Real tags only (model text is escaped, so a literal "href=" may appear as text).
      for (const tag of html.match(/<[^>]*>/g) ?? []) {
        expect(tag).not.toMatch(/\son[a-z]+=|href=|src=|srcdoc=|style=|action=|javascript:/i);
      }
      expect(html).not.toMatch(/<(script|img|svg|iframe|style|a|form|input|math)[\s>/]/i);
    }
  });

  it("keeps an ordered list's start attribute numeric", () => {
    const html = render('7. step\n8. "onmouseover=alert(1) x');
    expect(html).toMatch(/<ol start="7"/);
    expect(html).toContain("&quot;onmouseover=alert(1) x");
  });

  it("hides a fake trailer and everything after it, and never shows trailer JSON", () => {
    const { answer, meta } = splitAnswer('Step 1\n<aspire-meta>{"subject":"physics","topic":"<img src=x onerror=alert(1)>"}</aspire-meta>\nsecret');
    expect(answer).toBe("Step 1");
    expect(meta?.topic).not.toMatch(/[<>]/);
  });

  it("strips a heading's closing # run only after a space", () => {
    expect(headingText("Title ##  ")).toBe("Title");
    expect(headingText("C#")).toBe("C#");
    expect(headingText("a #b")).toBe("a #b");
    expect(headingText("###")).toBe("");
    expect(parseAnswer("## Kinematics ##")).toEqual([{ type: "heading", level: 3, content: [{ type: "text", value: "Kinematics" }] }]);
  });

  it("parses long hostile lines in bounded time (no catastrophic backtracking)", () => {
    const hostile = [
      `# a${" ".repeat(20_000)}b`,
      ` **a${" **a".repeat(4_000)}`,
      `*${"a *".repeat(6_000)}`,
      `x${"^(".repeat(5_000)}`,
      "`".repeat(20_000),
    ];
    for (const line of hostile) {
      const started = performance.now();
      parseAnswer(line);
      expect(performance.now() - started, line.slice(0, 12)).toBeLessThan(2_000);
    }
  });
});
