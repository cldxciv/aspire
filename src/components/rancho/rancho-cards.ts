import type { MockTestsCard, PlanCard, RankBandCard, RanchoToolCard } from "@/lib/ask/cards";

/**
 * Checks a `{ t: "card", card }` event from the /api/ask stream before the chat renders it (pure,
 * unit-tested). The server builds cards from Aspire's tools, but the browser still treats the stream
 * as untrusted: unknown kinds and malformed cards are dropped (null), strings are length-capped, and
 * links must be same-site paths ("/tools/…"), which the UI then localises with `localePath()`.
 */

const MAX_TEXT = 160;
const MAX_TESTS = 3;
const MAX_OUTLINE = 6;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat;
};

const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** A same-site path such as "/tools/predictor" or "/tools/mock-tests/x?y=1#z"; anything else is null. */
export function safeToolHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null;
  return /^\/(?![/\\])[A-Za-z0-9\-._~/?#=&%+]*$/.test(value) ? value : null;
}

function range(value: unknown): { min: number; max: number } | null {
  const r = record(value);
  if (!r) return null;
  const min = number(r.min);
  const max = number(r.max);
  if (min === null || max === null) return null;
  return min <= max ? { min, max } : { min: max, max: min };
}

function rankBand(card: Record<string, unknown>): RankBandCard | null {
  const exam = text(card.exam);
  const input = record(card.input);
  const mode = input?.mode === "score" || input?.mode === "percentile" ? input.mode : null;
  const value = number(input?.value);
  const band = range(card.band);
  const href = safeToolHref(card.href);
  if (!exam || !mode || value === null || !band || !href) return null;
  const percentile = card.percentile === null || card.percentile === undefined ? null : range(card.percentile);
  return { kind: "rank_band", exam, input: { mode, value }, band, percentile, sample: card.sample === true, href };
}

function mockTests(card: Record<string, unknown>): MockTestsCard | null {
  const leaderboardHref = safeToolHref(card.leaderboardHref);
  if (!Array.isArray(card.tests) || !leaderboardHref) return null;
  const tests: MockTestsCard["tests"] = [];
  for (const raw of card.tests) {
    const test = record(raw);
    if (!test) continue;
    const id = text(test.id);
    const title = text(test.title);
    const exam = text(test.exam);
    const questions = number(test.questions);
    const minutes = number(test.minutes);
    const href = safeToolHref(test.href);
    if (!id || !title || !exam || questions === null || minutes === null || !href) continue;
    tests.push({ id, title, exam, questions, minutes, sample: test.sample === true, href });
    if (tests.length === MAX_TESTS) break;
  }
  return tests.length > 0 ? { kind: "mock_tests", tests, leaderboardHref } : null;
}

function plan(card: Record<string, unknown>): PlanCard | null {
  const exam = text(card.exam);
  const examDate = typeof card.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(card.examDate) ? card.examDate : null;
  const daysLeft = number(card.daysLeft);
  const href = safeToolHref(card.href);
  if (!exam || !examDate || daysLeft === null || daysLeft < 0 || !href) return null;
  const outline = Array.isArray(card.outline)
    ? card.outline
        .map(text)
        .filter((line): line is string => line !== null)
        .slice(0, MAX_OUTLINE)
    : [];
  return { kind: "plan", exam, examDate, daysLeft: Math.round(daysLeft), outline, href };
}

/** A clean copy of a known, well-formed card; null for anything else (ignored by the chat). */
export function parseToolCard(value: unknown): RanchoToolCard | null {
  const card = record(value);
  if (!card) return null;
  switch (card.kind) {
    case "rank_band":
      return rankBand(card);
    case "mock_tests":
      return mockTests(card);
    case "plan":
      return plan(card);
    default:
      return null;
  }
}
