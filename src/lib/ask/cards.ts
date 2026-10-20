/**
 * Shared contract for Rancho's tool integration (lead, 2026-10-21). Client-safe: types and tiny
 * pure helpers only.
 *
 * - Rancho can run Aspire's student tools while answering (server-side tool use in /api/ask) and
 *   streams each tool result as a `card` event, which the chat UIs (/tools/ask, /rancho, the
 *   floating panel) render as a card with a link to the full tool. Numbers come from the tools,
 *   never from the model.
 * - Tools can hand a visitor over to Rancho with a short, non-sensitive context ("Ask Rancho about
 *   this"): `openRancho()` dispatches `RANCHO_OPEN_EVENT`; the chat UIs listen for it, prefill the
 *   composer and send `toolContext` with the next question. Never put this context in a URL.
 */

/** Tools Rancho can use or be handed context from. */
export type RanchoTool = "predictor" | "mock-test" | "planner";

/** A rank-band estimate from the predictor engine (src/lib/predictor/engine.ts). */
export interface RankBandCard {
  kind: "rank_band";
  /** Predictor exam id, e.g. "jee-main" | "neet-ug" (whatever the engine uses). */
  exam: string;
  input: { mode: "score" | "percentile"; value: number };
  /** Rank band (inclusive), already rounded the way the predictor page rounds it. */
  band: { min: number; max: number };
  /** Percentile range when the engine reports one. */
  percentile: { min: number; max: number } | null;
  /** True when the tables are sample/illustrative data (label it like the predictor page does). */
  sample: boolean;
  /** Locale-free link to the full tool, e.g. "/tools/predictor". */
  href: string;
}

/** Mock tests that match what the student asked for (src/lib/mocktest/catalog.ts). */
export interface MockTestsCard {
  kind: "mock_tests";
  tests: { id: string; title: string; exam: string; questions: number; minutes: number; sample: boolean; href: string }[];
  /** Locale-free, e.g. "/tools/mock-tests/leaderboard". */
  leaderboardHref: string;
}

/** Days to the exam plus a short outline from the planner logic (src/lib/planner/**). */
export interface PlanCard {
  kind: "plan";
  exam: string;
  /** ISO date (YYYY-MM-DD), India time. */
  examDate: string;
  daysLeft: number;
  /** A few short phase lines from the planner logic, e.g. "Weeks 1–6: finish syllabus". */
  outline: string[];
  /** Locale-free, e.g. "/tools/planner". */
  href: string;
}

export type RanchoToolCard = RankBandCard | MockTestsCard | PlanCard;

/** NDJSON event added to the /api/ask stream (see AskStreamEvent in ./constants). */
export interface AskCardEvent {
  t: "card";
  card: RanchoToolCard;
}

/** Optional context sent with a question that started from a tool ("Ask Rancho about this"). */
export interface RanchoToolContext {
  tool: RanchoTool;
  /** Short plain-text summary, e.g. "JEE Main, score 180, rank band 2,700–6,000 (sample data)". */
  summary: string;
}

/** Server-side limit for `RanchoToolContext.summary`. */
export const TOOL_CONTEXT_MAX_CHARS = 300;

export const RANCHO_OPEN_EVENT = "rancho:open";

export interface RanchoOpenDetail {
  /** Text to prefill in the composer (the visitor still presses Send). */
  prompt?: string;
  toolContext?: RanchoToolContext;
}

/** Ask the page's Rancho chat (floating panel, /tools/ask or /rancho) to open with this context. */
export function openRancho(detail: RanchoOpenDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RanchoOpenDetail>(RANCHO_OPEN_EVENT, { detail }));
}

/** Trims and caps a tool summary for sending (the server re-validates). */
export function clampToolSummary(summary: string): string {
  const flat = summary.replace(/\s+/g, " ").trim();
  return flat.length > TOOL_CONTEXT_MAX_CHARS ? `${flat.slice(0, TOOL_CONTEXT_MAX_CHARS - 1)}…` : flat;
}
