import "server-only";

import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";

import type { QbImportKind, QbImportMeta } from "@/lib/qb/types";

import type { CallUsage, QbImportClient } from "./client";
import { IMPORT_FALLBACK_BETA, MAX_SPLIT_DEPTH, type ModelPrice, supportsEffort } from "./config";
import { usageUsd } from "./estimate";
import { halvePages, type PdfSlicer, requestPages } from "./pdf";
import { batchInstructions, docxChunkInstructions, keyInstructions } from "./prompt";
import { KEY_OUTPUT_SCHEMA, PAPER_OUTPUT_SCHEMA, type ParsedOutput, parseKeyOutput, parsePaperOutput } from "./schema";
import type { ItemOutput } from "./types";

/**
 * One request's worth of work and its sync execution (docs/question-bank-plan.md §B8.3).
 *
 * Request shape (sync): streamed, `max_tokens` 64,000, the cached system prompt + chapter list,
 * the document first and the per-request instructions after it, `output_config: { effort, format:
 * json_schema }`, and the server-side refusal fallback (`fallbacks: "default"`). No `thinking`
 * parameter (Opus 5.5 always runs adaptive thinking; effort is the control), no tools, no
 * citations (incompatible with structured outputs).
 *
 * Batch requests use the same body WITHOUT `betas` / `fallbacks` (the Batches API rejects them).
 *
 * `max_tokens` → the page range (or text) is halved and both halves retried, at most twice deep.
 * Every extra call is checked against the daily cap first (`beforeSplit`), so one item cannot make
 * up to seven 64K-token calls on a single check. A refusal that survives the fallback marks the
 * item `refused`.
 */

export type RequestPlan =
  | { type: "pdf"; pageFrom: number; pageTo: number; lookahead: number | null }
  | { type: "text"; part: number; parts: number; text: string };

export interface BuildContext {
  kind: QbImportKind;
  meta: QbImportMeta;
  model: string;
  effort: string;
  maxTokens: number;
  /** System prompt + the exam's chapter list (one cached block). */
  systemText: string;
  totalPages: number | null;
  /** Unencrypted PDFs: request PDFs are built with copyPages. */
  slicer: PdfSlicer | null;
  /** Encrypted PDFs: the whole file, sent as one cached document block. */
  wholePdfBase64: string | null;
}

export interface BuiltRequest {
  body: Omit<MessageCreateParamsNonStreaming, "model"> & { model: string };
  parse: (text: string | null) => ParsedOutput;
}

function isKeyKind(kind: QbImportKind): boolean {
  return kind === "pdf_key" || kind === "csv_key";
}

export async function buildRequest(ctx: BuildContext, plan: RequestPlan): Promise<BuiltRequest> {
  const key = isKeyKind(ctx.kind);
  const schema = key ? KEY_OUTPUT_SCHEMA : PAPER_OUTPUT_SCHEMA;
  let documentBlock: Record<string, unknown>;
  let instructions: string;
  let parse: (text: string | null) => ParsedOutput;

  if (plan.type === "text") {
    documentBlock = {
      type: "document",
      source: { type: "text", media_type: "text/plain", data: plan.text },
      title: `Question-bank file, part ${plan.part} of ${plan.parts}`,
    };
    instructions = docxChunkInstructions(plan.part, plan.parts, ctx.meta);
    parse = (text) => parsePaperOutput(text, 0, null);
  } else {
    const ownPages = { from: plan.pageFrom, to: plan.pageTo };
    if (ctx.wholePdfBase64 !== null) {
      // Encrypted: cannot be split. The same cached document block for every request.
      documentBlock = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: ctx.wholePdfBase64 },
        cache_control: { type: "ephemeral" },
      };
      instructions = key
        ? keyInstructions({ ownPages, attachment: "whole", meta: ctx.meta })
        : batchInstructions({ ownPages, lookaheadPage: plan.lookahead, attachment: "whole", meta: ctx.meta });
      parse = (text) => (key ? parseKeyOutput(text, 0) : parsePaperOutput(text, 0, ownPages));
    } else {
      if (!ctx.slicer) throw new Error("pdf_unavailable");
      const pages = key ? requestPages({ ...plan, lookahead: null }) : requestPages(plan);
      const bytes = await ctx.slicer.slice(pages);
      documentBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } };
      instructions = key
        ? keyInstructions({ ownPages, attachment: "slice", meta: ctx.meta })
        : batchInstructions({ ownPages, lookaheadPage: plan.lookahead, attachment: "slice", meta: ctx.meta });
      const offset = plan.pageFrom - 1;
      parse = (text) => (key ? parseKeyOutput(text, offset) : parsePaperOutput(text, offset, ownPages));
    }
  }

  const outputConfig: Record<string, unknown> = { format: { type: "json_schema", schema } };
  if (supportsEffort(ctx.model)) outputConfig.effort = ctx.effort;
  const body = {
    model: ctx.model,
    max_tokens: ctx.maxTokens,
    system: [{ type: "text", text: ctx.systemText, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: [documentBlock, { type: "text", text: instructions }] }],
    output_config: outputConfig,
  } as unknown as BuiltRequest["body"];
  return { body, parse };
}

/** The sync form of a request body: streamed elsewhere, plus the refusal fallback. */
export function syncParams(body: BuiltRequest["body"]): BetaMessageStreamParams {
  return { ...(body as unknown as BetaMessageStreamParams), betas: [IMPORT_FALLBACK_BETA], fallbacks: "default" };
}

/** The batch form of a request body: no betas, no fallbacks. */
export function batchParams(body: BuiltRequest["body"]): MessageCreateParamsNonStreaming {
  return body as MessageCreateParamsNonStreaming;
}

export function addUsage(a: CallUsage, b: CallUsage): CallUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export const ZERO_USAGE: CallUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function mergeOutputs(a: ItemOutput, b: ItemOutput): ItemOutput {
  return {
    header: a.header ?? b.header,
    questions: [...a.questions, ...b.questions],
    keyRows: [...a.keyRows, ...b.keyRows.map((row, index) => ({ ...row, line: a.keyRows.length + index + 1 }))],
    pageMarks: [...a.pageMarks, ...b.pageMarks],
    instructions: [...a.instructions, ...b.instructions],
    skippedOutside: a.skippedOutside + b.skippedOutside,
    invalid: [...a.invalid, ...b.invalid],
  };
}

/** Two halves of a request plan (pages, or text at a paragraph break); null when it cannot be split. */
export function halvePlan(plan: RequestPlan, totalPages: number | null): [RequestPlan, RequestPlan] | null {
  if (plan.type === "pdf") {
    const halves = halvePages(plan.pageFrom, plan.pageTo, totalPages ?? plan.pageTo);
    if (!halves) return null;
    return [
      { type: "pdf", ...halves[0] },
      { type: "pdf", ...halves[1] },
    ];
  }
  const paragraphs = plan.text.split(/\n\n+/);
  if (paragraphs.length < 2) return null;
  const mid = Math.ceil(paragraphs.length / 2);
  return [
    { ...plan, text: paragraphs.slice(0, mid).join("\n\n") },
    { ...plan, text: paragraphs.slice(mid).join("\n\n") },
  ];
}

/** Every outcome carries the summed usage, cost and number of API calls (halving makes several). */
export type SyncOutcome =
  | { kind: "done"; output: ItemOutput; usage: CallUsage; usd: number; calls: number; model: string; stopReason: string | null }
  | { kind: "refused"; usage: CallUsage; usd: number; calls: number; model: string | null }
  | { kind: "too_long"; usage: CallUsage; usd: number; calls: number; model: string | null }
  | { kind: "unparseable"; reason: string; usage: CallUsage; usd: number; calls: number; model: string | null }
  /** `max_tokens` needed another call, but the daily cap would not allow it. */
  | { kind: "capped"; usage: CallUsage; usd: number; calls: number; model: string | null };

export interface SyncDeps {
  client: QbImportClient;
  build: (plan: RequestPlan) => Promise<BuiltRequest>;
  price: ModelPrice;
  totalPages: number | null;
  /**
   * Asked before each extra call that `max_tokens` halving makes, with what this item has cost so
   * far (not recorded anywhere yet); false stops with `capped`. Omitted: always allowed.
   */
  beforeSplit?: (spentSoFarUsd: number) => boolean;
}

/**
 * Runs one plan synchronously (streamed), halving on `max_tokens`. API errors are thrown to the
 * caller (the SDK has already retried 429 / 5xx twice).
 */
export async function extractSync(
  deps: SyncDeps,
  plan: RequestPlan,
  options: { signal?: AbortSignal; timeoutMs: number; depth?: number; spentBefore?: number },
): Promise<SyncOutcome> {
  const depth = options.depth ?? 0;
  const spentBefore = options.spentBefore ?? 0;
  const request = await deps.build(plan);
  const reply = await deps.client.extract(syncParams(request.body), { signal: options.signal, timeoutMs: options.timeoutMs });
  const usd = usageUsd(reply.usage, deps.price, false);

  if (reply.stopReason === "refusal") return { kind: "refused", usage: reply.usage, usd, calls: 1, model: reply.model };
  if (reply.stopReason === "max_tokens") {
    const halves = depth < MAX_SPLIT_DEPTH ? halvePlan(plan, deps.totalPages) : null;
    if (!halves) return { kind: "too_long", usage: reply.usage, usd, calls: 1, model: reply.model };
    const allowed = (spent: number) => !deps.beforeSplit || deps.beforeSplit(spent);
    if (!allowed(spentBefore + usd)) return { kind: "capped", usage: reply.usage, usd, calls: 1, model: reply.model };
    const first = await extractSync(deps, halves[0], { ...options, depth: depth + 1, spentBefore: spentBefore + usd });
    if (first.kind !== "done") return { ...first, usage: addUsage(reply.usage, first.usage), usd: usd + first.usd, calls: 1 + first.calls };
    if (!allowed(spentBefore + usd + first.usd)) {
      return { kind: "capped", usage: addUsage(reply.usage, first.usage), usd: usd + first.usd, calls: 1 + first.calls, model: first.model };
    }
    const second = await extractSync(deps, halves[1], { ...options, depth: depth + 1, spentBefore: spentBefore + usd + first.usd });
    const calls = 1 + first.calls + second.calls;
    const total = addUsage(addUsage(reply.usage, first.usage), second.usage);
    if (second.kind !== "done") return { ...second, usage: total, usd: usd + first.usd + second.usd, calls };
    return {
      kind: "done",
      output: mergeOutputs(first.output, second.output),
      usage: total,
      usd: usd + first.usd + second.usd,
      calls,
      model: second.model,
      stopReason: second.stopReason,
    };
  }
  const parsed = request.parse(reply.text);
  if (!parsed.ok) return { kind: "unparseable", reason: parsed.reason, usage: reply.usage, usd, calls: 1, model: reply.model };
  return { kind: "done", output: parsed.output, usage: reply.usage, usd, calls: 1, model: reply.model, stopReason: reply.stopReason };
}
