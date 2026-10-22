import type { QbExam, QbImportEstimate, QbImportKind } from "@/lib/qb/types";

import type { CallUsage } from "./client";
import type { ModelPrice } from "./config";
import { isAiKind } from "./types";

/** The Message Batches API bills half of the standard price (mirrors config.ts, kept pure here). */
const BATCH_FACTOR = 0.5;

/**
 * Questions per page and output tokens per question set the pages per request:
 * `clamp(floor(0.5 × maxTokens / (questionsPerPage × 1,100)), 1, 6)`, so the expected output is at
 * most half of `max_tokens`.
 */
export function pagesPerItem(maxTokens: number, questionsPerPage: number): number {
  const raw = Math.floor((0.5 * maxTokens) / (Math.max(0.5, questionsPerPage) * 1100));
  return Math.min(6, Math.max(1, raw));
}

/**
 * Cost estimate shown before every AI import (docs/question-bank-plan.md §B8.2). Planning figures,
 * not a quote: the Integrate stage's two real calls measure tokens per page and tune these
 * constants. Client-safe (pure).
 *
 * Inputs: 1,500–3,000 input tokens per page sent (own pages plus the lookahead page); a cached
 * system prompt with the chapter list of about 4,000 tokens; the structured-output schema with every
 * request; questions per page by exam; 600–1,100 output tokens per question, adaptive thinking
 * included. Batch mode costs half.
 *
 * Measured at Integrate (22 Oct 2026, free count_tokens on the 1-page synthetic smoke PDF, Opus 5.5):
 * page ≈ 1,820, system prompt without a chapter list ≈ 1,480, per-request instructions ≈ 130 and the
 * output schema ≈ 2,240 input tokens. Output tokens are not measured yet (no successful real call).
 */

export const INPUT_TOKENS_PER_PAGE: [number, number] = [1500, 3000];
export const OUTPUT_TOKENS_PER_QUESTION: [number, number] = [600, 1100];
/** Answer-key tables: output per key page (rows are short). */
export const OUTPUT_TOKENS_PER_KEY_PAGE: [number, number] = [800, 2500];
export const SYSTEM_PROMPT_TOKENS = 4000;
export const INSTRUCTION_TOKENS = 500;
/** The JSON schema of `output_config.format`, sent with every request (measured ≈ 2,240). */
export const OUTPUT_SCHEMA_TOKENS = 2300;
/** Fixed input per request on top of the pages / text. */
const PER_REQUEST_TOKENS = INSTRUCTION_TOKENS + OUTPUT_SCHEMA_TOKENS;
/** Word files: characters per token and characters per question (bank files are dense). */
export const DOCX_CHARS_PER_TOKEN = 4;
export const DOCX_CHARS_PER_QUESTION = 600;

export function questionsPerPage(exam: QbExam | undefined): number {
  switch (exam) {
    case "JEE_MAIN":
      return 2.5;
    case "NEET":
      return 4;
    case "JEE_ADV":
      return 2;
    default:
      return 3;
  }
}

/** USD for measured usage at `price` (per million tokens), halved in batch mode. */
export function usageUsd(usage: CallUsage, price: ModelPrice, batch: boolean): number {
  const usd =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000;
  return Math.round(usd * (batch ? BATCH_FACTOR : 1) * 1e6) / 1e6;
}

export interface EstimateInput {
  kind: QbImportKind;
  exam: QbExam | undefined;
  pages: number | null;
  rows: number | null;
  /** Word files: characters of converted text. */
  textChars?: number | null;
  /** Encrypted PDFs cannot be split: the whole file goes with every request. */
  encrypted?: boolean;
  mode: "sync" | "batch";
  model: string;
  price: ModelPrice;
  maxTokens: number;
  dailyCapUsd: number;
  spentTodayUsd: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Number of requests (batches of pages / text chunks) the job will make. */
export function requestCount(input: Pick<EstimateInput, "kind" | "exam" | "pages" | "textChars" | "maxTokens">): number {
  if (input.kind === "docx_bank") return Math.max(1, Math.ceil((input.textChars ?? 0) / 24_000));
  const pages = input.pages ?? 0;
  if (pages === 0) return 0;
  const perItem = input.kind === "pdf_key" ? 6 : pagesPerItem(input.maxTokens, questionsPerPage(input.exam));
  return Math.ceil(pages / perItem);
}

function pdfOutputTokens(kind: QbImportKind, exam: QbExam | undefined, pages: number): [number, number] {
  if (kind === "pdf_key") return [pages * OUTPUT_TOKENS_PER_KEY_PAGE[0], pages * OUTPUT_TOKENS_PER_KEY_PAGE[1]];
  const questions = pages * questionsPerPage(exam);
  return [Math.round(questions * OUTPUT_TOKENS_PER_QUESTION[0]), Math.round(questions * OUTPUT_TOKENS_PER_QUESTION[1])];
}

export function estimateImport(input: EstimateInput): QbImportEstimate {
  if (!isAiKind(input.kind)) {
    return {
      aiRequired: false,
      model: null,
      mode: "none",
      pages: input.pages,
      rows: input.rows,
      batches: 0,
      inputTokens: [0, 0],
      outputTokens: [0, 0],
      usd: [0, 0],
      dailyCapUsd: input.dailyCapUsd,
      spentTodayUsd: round2(input.spentTodayUsd),
    };
  }
  const batches = requestCount(input);
  const batch = input.mode === "batch";
  let inputTokens: [number, number];
  let outputTokens: [number, number];
  if (input.encrypted && input.kind !== "docx_bank") {
    // The WHOLE file goes with every request. At best it is written to the prompt cache once and
    // read by the later requests; at worst (calls longer than the 5-minute cache life, or a batch)
    // every copy is billed as fresh input. Both bounds are priced that way.
    const pages = input.pages ?? 0;
    const doc: [number, number] = [pages * INPUT_TOKENS_PER_PAGE[0], pages * INPUT_TOKENS_PER_PAGE[1]];
    inputTokens = [batches * (doc[0] + PER_REQUEST_TOKENS), batches * (doc[1] + PER_REQUEST_TOKENS)];
    outputTokens = pdfOutputTokens(input.kind, input.exam, pages);
    const later = Math.max(0, batches - 1);
    const low: CallUsage = {
      inputTokens: batches * PER_REQUEST_TOKENS,
      outputTokens: outputTokens[0],
      cacheWriteTokens: SYSTEM_PROMPT_TOKENS + doc[0],
      cacheReadTokens: later * (SYSTEM_PROMPT_TOKENS + doc[0]),
    };
    const high: CallUsage = {
      inputTokens: inputTokens[1],
      outputTokens: outputTokens[1],
      cacheWriteTokens: SYSTEM_PROMPT_TOKENS,
      cacheReadTokens: later * SYSTEM_PROMPT_TOKENS,
    };
    return {
      aiRequired: true,
      model: input.model,
      mode: input.mode,
      pages: input.pages,
      rows: input.rows,
      batches,
      inputTokens,
      outputTokens,
      usd: [round2(usageUsd(low, input.price, batch)), round2(usageUsd(high, input.price, batch))],
      dailyCapUsd: input.dailyCapUsd,
      spentTodayUsd: round2(input.spentTodayUsd),
    };
  }
  if (input.kind === "docx_bank") {
    const textTokens = Math.ceil((input.textChars ?? 0) / DOCX_CHARS_PER_TOKEN);
    const questions = Math.max(1, Math.ceil((input.textChars ?? 0) / DOCX_CHARS_PER_QUESTION));
    inputTokens = [textTokens + batches * PER_REQUEST_TOKENS, Math.ceil(textTokens * 1.3) + batches * PER_REQUEST_TOKENS];
    outputTokens = [questions * OUTPUT_TOKENS_PER_QUESTION[0], questions * OUTPUT_TOKENS_PER_QUESTION[1]];
  } else {
    const pages = input.pages ?? 0;
    // Every request but the last also carries one lookahead page.
    const pagesSent = pages + Math.max(0, batches - 1);
    inputTokens = [
      pagesSent * INPUT_TOKENS_PER_PAGE[0] + batches * PER_REQUEST_TOKENS,
      pagesSent * INPUT_TOKENS_PER_PAGE[1] + batches * PER_REQUEST_TOKENS,
    ];
    outputTokens = pdfOutputTokens(input.kind, input.exam, pages);
  }
  // The system prompt is written to the cache once and read by every later request.
  const cache = (lowOrHigh: 0 | 1): CallUsage => ({
    inputTokens: inputTokens[lowOrHigh],
    outputTokens: outputTokens[lowOrHigh],
    cacheWriteTokens: SYSTEM_PROMPT_TOKENS,
    cacheReadTokens: Math.max(0, batches - 1) * SYSTEM_PROMPT_TOKENS,
  });
  return {
    aiRequired: true,
    model: input.model,
    mode: input.mode,
    pages: input.pages,
    rows: input.rows,
    batches,
    inputTokens,
    outputTokens,
    usd: [round2(usageUsd(cache(0), input.price, batch)), round2(usageUsd(cache(1), input.price, batch))],
    dailyCapUsd: input.dailyCapUsd,
    spentTodayUsd: round2(input.spentTodayUsd),
  };
}

/** Upper-bound cost of one request of a job (for the daily-cap check before each sync call). */
export function perRequestUpperUsd(estimate: QbImportEstimate | null): number {
  if (!estimate || !estimate.aiRequired || estimate.batches === 0) return 0;
  return estimate.usd[1] / estimate.batches;
}

/** Start of the current IST day (UTC+05:30, no DST) in epoch ms: the daily cap resets at IST midnight. */
export function istDayStart(now: number): number {
  const offset = 330 * 60_000;
  return Math.floor((now + offset) / 86_400_000) * 86_400_000 - offset;
}
