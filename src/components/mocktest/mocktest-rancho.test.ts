import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { clickAskRancho } from "@/components/home/home-tools-rancho.testkit";
import { MOCK_TESTS } from "@/content/mocktest";
import { topicLabel } from "@/content/mocktest/topics";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { clampToolSummary, TOOL_CONTEXT_MAX_CHARS } from "@/lib/ask/cards";
import { runnerPayload, scorableQuestions } from "@/lib/mocktest/catalog";
import { scoreAttempt, type Answer } from "@/lib/mocktest/scoring";
import { answerText } from "./format";
import { mockTestRancho, RANCHO_WEAK_TOPIC_LIMIT, ranchoScoreBand } from "./rancho";

/**
 * "Ask Rancho about my weak topics" (mock-test result): the test title, a 10-point score band and
 * topic names only — never question text, options, the student's answers or the exact score.
 */

const definition = MOCK_TESTS.find((test) => test.id === "jee-main-sample")!;
const test = runnerPayload(definition);
const questions = scorableQuestions(definition);

/** Physics answered correctly, Chemistry wrong, Maths skipped: strong, weak and skipped topics. */
function attempt() {
  const answers: Answer[] = questions.map((q) => {
    if (q.subject === "physics") return q.answer;
    if (q.subject === "chemistry") return q.type === "mcq" ? (q.answer + 1) % (q.optionCount ?? 4) : q.answer + 1000;
    return null;
  });
  return { answers, result: scoreAttempt(questions, answers) };
}

describe("mock-test result → Rancho", () => {
  it.each(["en", "hi"] as const)("%s: dispatches the localised prompt with title, score band and weakest topic names", (locale) => {
    const { answers, result } = attempt();
    const tr = messagesFor(locale, "mocktest").result;
    const { label, detail: handoff } = mockTestRancho(test, result, locale, tr);
    expect(label).toBe(tr.askRancho);
    const { handled, received } = clickAskRancho(handoff);
    expect(handled).toBe(true);
    expect(received).toHaveLength(1);
    const [detail] = received;
    expect(detail.prompt).toBe(tr.askRanchoPrompt);
    expect(detail.toolContext?.tool).toBe("mock-test");
    const summary = detail.toolContext!.summary;
    expect(summary.length).toBeLessThanOrEqual(TOOL_CONTEXT_MAX_CHARS);
    expect(clampToolSummary(summary)).toBe(summary);
    expect(summary).toContain(test.title[locale]);
    expect(summary).toContain(ranchoScoreBand(result.score, result.maxScore, tr));

    // Topic names only: weakest first (skipped / weak), never strong ones, at most RANCHO_WEAK_TOPIC_LIMIT.
    const [prefix, listed] = [summary.slice(0, summary.lastIndexOf(": ")), summary.slice(summary.lastIndexOf(": ") + 2)];
    expect(prefix).toBe(format(tr.askRanchoContext, { test: test.title[locale], band: ranchoScoreBand(result.score, result.maxScore, tr), topics: "" }).replace(/: $/, ""));
    const labels = listed.split("; ");
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(RANCHO_WEAK_TOPIC_LIMIT);
    const needy = result.topics.filter((topic) => topic.level !== "strong").map((topic) => topicLabel(topic.topic, locale));
    const strong = result.topics.filter((topic) => topic.level === "strong").map((topic) => topicLabel(topic.topic, locale));
    for (const label of labels) {
      expect(needy, label).toContain(label);
      expect(strong, label).not.toContain(label);
    }

    // No question text, options, answers or the exact score.
    expect(summary).not.toContain(format(messagesFor(locale, "mocktest").common.scoreOf, { score: result.score, max: result.maxScore }));
    test.questions.forEach((question, index) => {
      for (const lang of ["en", "hi"] as const) {
        expect(summary).not.toContain(question.stem[lang].slice(0, 24));
        for (const option of question.options ?? []) if (option[lang].length > 3) expect(summary).not.toContain(option[lang]);
        const given = answerText(question, answers[index], lang);
        if (given.length > 4) expect(summary).not.toContain(given);
      }
    });
  });

  it.each(["en", "hi"] as const)("%s: all-strong attempts ask what to practise next, not about weak topics", (locale) => {
    const tr = messagesFor(locale, "mocktest").result;
    const strong = scoreAttempt(questions, questions.map((q) => q.answer));
    const { label, detail } = mockTestRancho(test, strong, locale, tr);
    expect(label).toBe(tr.askRanchoStrong);
    expect(detail.prompt).toBe(tr.askRanchoStrongPrompt);
    expect(detail.toolContext!.summary).toBe(format(tr.askRanchoAllStrong, { test: test.title[locale], band: "90–100 %" }));
    for (const text of [label, detail.prompt!]) expect(text).not.toMatch(/weak|कमज़ोर/i);
    if (locale === "hi") for (const key of ["askRanchoStrong", "askRanchoStrongPrompt"] as const) expect(tr[key]).toMatch(/[ऀ-ॿ]/);
  });

  it("score bands read honestly", () => {
    const tr = messagesFor("en", "mocktest").result;
    expect(ranchoScoreBand(45, 100, tr)).toBe("40–49 %");
    expect(ranchoScoreBand(-3, 100, tr)).toBe(tr.askRanchoBelowZero);
    expect(ranchoScoreBand(100, 100, tr)).toBe("90–100 %");
  });

  it("the result view uses the helper and the shared link (client-only view)", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/mocktest/ResultView.tsx"), "utf8");
    expect(source).toContain("mockTestRancho(test, result, locale, tr)");
    expect(source).toMatch(/<AskRanchoLink href=\{localePath\("\/tools\/ask", locale\)\} detail=\{rancho\.detail\}/);
    expect(source).toContain("{rancho.label}");
  });
});
