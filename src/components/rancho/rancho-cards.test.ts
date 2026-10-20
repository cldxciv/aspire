import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createNdjsonDecoder } from "@/components/ask/ask-client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { MockTestsCard, PlanCard, RankBandCard, RanchoToolCard } from "@/lib/ask/cards";

import { RanchoToolCards } from "./RanchoToolCards";
import { RanchoTurnView, type RanchoTurnData } from "./RanchoTurn";
import { askRancho } from "./rancho-chat";
import { parseToolCard, safeToolHref } from "./rancho-cards";
import { escapeHtml as escape, textOf } from "./rancho-test-html";

/** Tool cards in Rancho answers: the stream event, checking, rendering per kind, unknown kinds ignored. */

const rankBand: RankBandCard = {
  kind: "rank_band",
  exam: "jee-main",
  input: { mode: "score", value: 180 },
  band: { min: 2700, max: 125000 },
  percentile: { min: 99.123, max: 99.678 },
  sample: true,
  href: "/tools/predictor",
};

const mockTests: MockTestsCard = {
  kind: "mock_tests",
  tests: [
    { id: "jee-1", title: "JEE Main Physics: Kinematics", exam: "JEE_MAIN", questions: 25, minutes: 60, sample: true, href: "/tools/mock-tests/jee-1" },
    { id: "jee-2", title: "JEE Main Full Test 1", exam: "JEE_MAIN", questions: 75, minutes: 180, sample: false, href: "/tools/mock-tests/jee-2" },
    { id: "neet-1", title: "NEET Biology: Cells", exam: "NEET", questions: 45, minutes: 50, sample: false, href: "/tools/mock-tests/neet-1" },
  ],
  leaderboardHref: "/tools/mock-tests/leaderboard",
};

const plan: PlanCard = {
  kind: "plan",
  exam: "neet",
  examDate: "2027-05-02",
  daysLeft: 193,
  outline: ["Weeks 1–6: finish the syllabus", "Weeks 7–10: mock tests and revision"],
  href: "/tools/planner",
};

const renderCards = (cards: RanchoToolCard[], locale: Locale) =>
  renderToStaticMarkup(createElement(RanchoToolCards, { cards, messages: messagesFor(locale, "rancho").panel.cards, locale }));

describe("checking cards from the stream", () => {
  it("keeps well-formed cards of each known kind as clean copies", () => {
    expect(parseToolCard(rankBand)).toEqual(rankBand);
    expect(parseToolCard(mockTests)).toEqual(mockTests);
    expect(parseToolCard(plan)).toEqual(plan);
    expect(parseToolCard({ ...rankBand, extra: "<script>" })).not.toHaveProperty("extra");
  });

  it("ignores unknown kinds and malformed cards", () => {
    expect(parseToolCard({ kind: "college_list", colleges: [] })).toBeNull();
    expect(parseToolCard(null)).toBeNull();
    expect(parseToolCard("rank_band")).toBeNull();
    expect(parseToolCard([rankBand])).toBeNull();
    expect(parseToolCard({ ...rankBand, band: { min: "2700", max: 6000 } })).toBeNull();
    expect(parseToolCard({ ...rankBand, input: { mode: "rank", value: 1 } })).toBeNull();
    expect(parseToolCard({ ...mockTests, tests: [] })).toBeNull();
    expect(parseToolCard({ ...plan, examDate: "2 May 2027" })).toBeNull();
    expect(parseToolCard({ ...plan, daysLeft: -1 })).toBeNull();
  });

  it("only links to same-site paths", () => {
    expect(safeToolHref("/tools/predictor")).toBe("/tools/predictor");
    expect(safeToolHref("/tools/mock-tests/x?from=rancho#top")).toBe("/tools/mock-tests/x?from=rancho#top");
    for (const bad of ["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "tools/predictor", "/tools/<x>", 42]) {
      expect(safeToolHref(bad), String(bad)).toBeNull();
    }
    expect(parseToolCard({ ...rankBand, href: "https://evil.example/" })).toBeNull();
    // A bad test link drops that test only; at most three tests are kept.
    const card = parseToolCard({
      ...mockTests,
      tests: [{ ...mockTests.tests[0], href: "//evil" }, ...mockTests.tests, mockTests.tests[0]],
    }) as MockTestsCard;
    expect(card.tests.map((test) => test.id)).toEqual(["jee-1", "jee-2", "neet-1"]);
  });

  it("the NDJSON decoder passes known cards through and skips unknown ones", () => {
    const decoder = createNdjsonDecoder();
    const events = decoder.push(
      [{ t: "card", card: rankBand }, { t: "card", card: { kind: "weather" } }, { t: "card" }, { t: "delta", text: "Hi" }]
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
    );
    expect(events).toEqual([{ t: "card", card: rankBand }, { t: "delta", text: "Hi" }]);
  });

  it("askRancho reports each card as it arrives and returns them with the answer", async () => {
    const body = [
      { t: "start", remaining: 4, limit: 5 },
      { t: "card", card: rankBand },
      { t: "card", card: { kind: "future_card", x: 1 } },
      { t: "delta", text: "Your band is wide because the tables are samples." },
      { t: "card", card: plan },
      { t: "done", stop: "end_turn", meta: null },
    ]
      .map((event) => `${JSON.stringify(event)}\n`)
      .join("");
    const onCard = vi.fn();
    const answer = await askRancho(
      { question: "What rank for 180?", subject: "auto", language: "en" },
      {
        signal: new AbortController().signal,
        fetchImpl: async () => new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } }),
        onCard,
      },
    );
    expect(onCard.mock.calls.map(([card]) => card.kind)).toEqual(["rank_band", "plan"]);
    expect(answer.cards).toEqual([rankBand, plan]);
    expect(answer.text).toBe("Your band is wide because the tables are samples.");
    expect(answer.failure).toBeNull();
  });
});

describe("RanchoToolCards", () => {
  it("rank band: band, percentile, exam, the 'Sample data' badge and a localised link (en)", () => {
    const html = renderCards([rankBand], "en");
    const t = messagesFor("en", "rancho").panel.cards;
    const text = textOf(html);
    expect(html).toContain('data-card="rank_band"');
    expect(text).toContain("Rank estimate · JEE Main");
    expect(text).toContain("Rank 2,700 – 1,25,000"); // Indian digit grouping, like the predictor
    expect(text).toContain("For a score of 180");
    expect(text).toContain("Percentile 99.12 – 99.68");
    expect(text).toContain(t.sample);
    expect(html).toMatch(new RegExp(`<a [^>]*href="/tools/predictor"[^>]*>${escape(t.rankBand.cta)}`));
    // Not sample data: no badge.
    expect(textOf(renderCards([{ ...rankBand, sample: false, percentile: null }], "en"))).not.toContain(t.sample);
  });

  it("mock tests: up to three tests with Start links named by the test, and the leaderboard", () => {
    const html = renderCards([mockTests], "en");
    const t = messagesFor("en", "rancho").panel.cards;
    expect(html.match(/<li/g)).toHaveLength(4); // the card + three tests
    for (const test of mockTests.tests) {
      expect(html).toMatch(new RegExp(`<a [^>]*href="${test.href}"[^>]*>${t.mockTests.start}<span class="sr-only">: ${escape(test.title)}</span></a>`));
    }
    expect(textOf(html)).toContain("JEE Main · 25 questions · 60 min");
    expect(textOf(html)).toContain(t.sample); // one of them is a sample test
    expect(html).toMatch(new RegExp(`<a [^>]*href="/tools/mock-tests/leaderboard"[^>]*>.*${t.mockTests.leaderboard}</a>`));
  });

  it("plan: days left, exam date, outline and 'Build my full plan'", () => {
    const html = renderCards([plan], "en");
    const text = textOf(html);
    expect(text).toContain("Study plan · NEET-UG");
    expect(text).toContain("193 days left");
    expect(text).toContain("Exam on 2 May 2027");
    expect(text).toContain("Weeks 1–6: finish the syllabus");
    expect(html).toMatch(/<a [^>]*href="\/tools\/planner"[^>]*>Build my full plan/);
    expect(textOf(renderCards([{ ...plan, daysLeft: 1 }], "en"))).toContain("1 day left");
    expect(textOf(renderCards([{ ...plan, daysLeft: 0 }], "en"))).toContain("The exam is today");
  });

  it("Hindi: localised copy and /hi links for every kind", () => {
    const html = renderCards([rankBand, mockTests, plan], "hi");
    const t = messagesFor("hi", "rancho").panel.cards;
    expect(html).toContain('href="/hi/tools/predictor"');
    expect(html).toContain('href="/hi/tools/mock-tests/jee-1"');
    expect(html).toContain('href="/hi/tools/mock-tests/leaderboard"');
    expect(html).toContain('href="/hi/tools/planner"');
    expect(html).not.toMatch(/href="\/tools/);
    const text = textOf(html);
    expect(text).toContain(t.sample);
    expect(text).toContain(t.rankBand.cta);
    expect(text).toContain(t.plan.cta);
    expect(text).toContain("193 दिन बाकी");
  });

  it("renders nothing for no cards, and skips a kind it doesn't know", () => {
    expect(renderCards([], "en")).toBe("");
    const unknown = { kind: "college_list" } as unknown as RanchoToolCard;
    const html = renderCards([unknown, plan], "en");
    expect(html.match(/data-card=/g)).toHaveLength(1);
    expect(html).toContain('data-card="plan"');
  });

  it("shows cards inside Rancho's answer bubble, above the text, with Listen and Copy on a finished answer", () => {
    const turn: RanchoTurnData = {
      id: 1,
      question: "What rank can I get with 180 in JEE Main?",
      photoUrl: null,
      subject: "auto",
      language: "en",
      toolContext: null,
      spoken: false,
      answer: "With **180**, aim to improve Physics.",
      cards: [rankBand],
      meta: { subject: "physics", topic: "Kinematics", difficulty: "easy" },
      phase: "done",
      stop: "end_turn",
      failure: null,
    };
    const t = messagesFor("en", "rancho").panel;
    const props = { turn, messages: t, locale: "en" as const, speaking: false, copied: false, onListen: () => {}, onCopy: () => {} };
    const html = renderToStaticMarkup(createElement(RanchoTurnView, { ...props, canSpeak: true }));
    expect(html.indexOf('data-card="rank_band"')).toBeLessThan(html.indexOf("With <strong"));
    expect(html).toContain(`<span class="sr-only">${t.voice.listen}</span>`);
    expect(html).toContain(`<span class="sr-only">${t.copy}</span>`);
    expect(textOf(html)).toContain("Physics · Kinematics · Easy");
    expect(html).not.toContain(t.helpful.yes); // feedback only where the page asks for it
    // No speech synthesis: no Listen button.
    expect(renderToStaticMarkup(createElement(RanchoTurnView, { ...props, canSpeak: false }))).not.toContain(t.voice.listen);
    // Reading it: the button says "Stop reading" and is pressed.
    const reading = renderToStaticMarkup(createElement(RanchoTurnView, { ...props, canSpeak: true, speaking: true }));
    expect(reading).toMatch(new RegExp(`aria-pressed="true" title="${t.voice.stopReading}"`));
  });
});
