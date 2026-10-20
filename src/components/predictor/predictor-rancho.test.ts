import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { clickAskRancho } from "@/components/home/home-tools-rancho.testkit";
import { predictorTables } from "@/content/predictor";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { clampToolSummary, TOOL_CONTEXT_MAX_CHARS } from "@/lib/ask/cards";
import { matchColleges, scoreTableFor, selectVisibleData } from "@/lib/predictor/engine";
import { formatRankRange } from "./format";
import { ResultBody } from "./PredictorApp";
import { predictorRanchoDetail, type PredictorRanchoMessages } from "./rancho";

/** "Ask Rancho how to improve" (predictor): exam, score range, rank band and the sample label only. */

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function prediction() {
  const data = selectVisibleData(predictorTables, true);
  // Personal choices that must never reach Rancho: category, PwD, home state, gender, the exact score.
  const result = matchColleges({ exam: "jee-main", mode: "score", value: 187, category: "SC", pwd: true, homeState: "HP", gender: "female" }, data);
  if (result.status !== "ok") throw new Error("expected a prediction");
  const table = scoreTableFor("jee-main", data);
  if (!table) throw new Error("expected a score table");
  return { result, table };
}

function messages(locale: Locale): PredictorRanchoMessages {
  const t = messagesFor(locale, "predictor");
  return {
    exams: t.form.exams,
    crl: t.result.crl,
    range: t.result.range,
    rangeScore: t.share.rangeScore,
    rangePercentile: t.share.rangePercentile,
    askRanchoPrompt: t.result.askRanchoPrompt,
    askRanchoContext: t.result.askRanchoContext,
    askRanchoSample: t.result.askRanchoSample,
  };
}

describe("predictor → Rancho", () => {
  it.each(["en", "hi"] as const)("%s: dispatches the localised prompt and a short, non-sensitive summary", (locale) => {
    const { result, table } = prediction();
    const t = messagesFor(locale, "predictor");
    const { handled, received } = clickAskRancho(predictorRanchoDetail(result.band, table, locale, messages(locale)));
    expect(handled).toBe(true);
    expect(received).toHaveLength(1);
    const [detail] = received;
    expect(detail.prompt).toBe(t.result.askRanchoPrompt);
    expect(detail.toolContext?.tool).toBe("predictor");
    const summary = detail.toolContext!.summary;
    expect(summary.length).toBeLessThanOrEqual(TOOL_CONTEXT_MAX_CHARS);
    expect(clampToolSummary(summary)).toBe(summary);
    const rangeText = t.share.rangeScore.replace("{from}", "180").replace("{to}", "189");
    const bandText = formatRankRange(result.band.crl, locale, t.result.range);
    expect(summary).toContain(t.form.exams["jee-main"]);
    expect(summary).toContain(rangeText);
    expect(summary).toContain(bandText);
    expect(summary).toContain(t.result.askRanchoSample);
    // Never the exact score or the student's category, PwD, home state or gender.
    expect(summary.replace(rangeText, "").replace(bandText, "")).not.toMatch(/\d/);
    for (const text of [t.form.categories.SC, t.form.homeStates.HP, t.form.genders.female, t.result.pwdRank, "PwD"]) {
      expect(summary, text).not.toContain(text);
    }
  });

  it("the sample label is left out for published tables, and long templates are clamped", () => {
    const { result, table } = prediction();
    const published = predictorRanchoDetail({ ...result.band, sample: false }, table, "en", messages("en"));
    expect(published.toolContext!.summary).not.toContain("(sample data)");
    const long = predictorRanchoDetail(result.band, table, "en", { ...messages("en"), askRanchoContext: `${"x".repeat(400)} {exam}` });
    expect(long.toolContext!.summary.length).toBe(TOOL_CONTEXT_MAX_CHARS);
    expect(long.toolContext!.summary.endsWith("…")).toBe(true);
  });

  it.each(["en", "hi"] as const)("%s: the result shows the button as a link to the Ask page (no context in the markup)", (locale) => {
    const { result, table } = prediction();
    const t = messagesFor(locale, "predictor");
    const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
    const html = renderToStaticMarkup(createElement(Provider, { locale }, createElement(ResultBody, { result, messages: t, sample: true, table })));
    const anchor = html.match(/<a\b[^>]*data-ask-rancho[^>]*>/)?.[0] ?? "";
    expect(anchor).toContain(`href="${locale === "hi" ? "/hi" : ""}/tools/ask"`);
    expect(html).toContain(esc(t.result.askRancho));
    expect(html).not.toContain(esc(t.result.askRanchoPrompt));
    // Without the score table (tests / older callers) there is no button.
    const bare = renderToStaticMarkup(createElement(Provider, { locale }, createElement(ResultBody, { result, messages: t, sample: true })));
    expect(bare).not.toContain("data-ask-rancho");
  });
});
