import "server-only";

import Anthropic, { APIUserAbortError } from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages";

import type { RanchoToolCard, RanchoToolContext } from "./cards";
import type { AskConfig } from "./config";
import { MIN_ASK_MAX_TOKENS, supportsEffort } from "./config";
import type { AskImageType, AskLanguage, AskSubjectHint } from "./constants";
import { buildSystemPrompt, buildUserText } from "./prompt";
import { ASK_TOOLS, runAskTool } from "./tools";

/**
 * The one place that talks to the Claude API (Anthropic Messages API, official SDK).
 *
 * - Streaming, so long answers never hit HTTP timeouts and the student sees text as it arrives.
 * - Thinking is left to the model's default (adaptive on Opus 5.5) with effort "medium" — the
 *   Opus 5.5 default, set explicitly; it bounds the hidden reasoning spend.
 * - The system prompt and the tool definitions are identical for every request; the system
 *   block is marked for prompt caching (the cached prefix is tools + system).
 * - Server-side refusal fallback (`fallbacks: "default"`): if the model's safety classifiers
 *   decline a legitimate textbook question (e.g. NEET biology), the API retries it on a
 *   fallback model inside the same call. Models without fallback support ignore it.
 * - Tool use (./tools): a manual, server-side loop. The model asks for a tool → we run it here
 *   (pure, no I/O) → its card is emitted → the tool_result goes back → the model continues. At
 *   most ASK_MAX_TOOL_CALLS tool calls per question; after that the model must answer
 *   (`tool_choice: none`). The history is append-only (assistant turns echoed unchanged, thinking
 *   blocks included), so preserved thinking stays valid and the cached prefix is reused.
 */

export interface AskModelInput {
  question: string;
  subject: AskSubjectHint;
  language: AskLanguage;
  image: { mediaType: AskImageType; base64: string } | null;
  /** "Ask Rancho about this" handoff, already validated and cleaned (schema.ts). */
  toolContext?: RanchoToolContext | null;
}

/** Fails fast: one retry, two-minute ceiling per attempt. */
export function createAskClient(apiKey: string, workspaceId: string | null = null): Anthropic {
  return new Anthropic({
    apiKey,
    maxRetries: 1,
    timeout: 120_000,
    // Keys that are not scoped to a workspace must name one on every request.
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });
}

export const ASK_EFFORT = "medium" as const;
export const ASK_FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Tool calls run for one question (more requests get an error result, then the model must answer). */
export const ASK_MAX_TOOL_CALLS = 3;
/** Model requests for one question: every tool round, one forced-answer round, one spare. */
export const ASK_MAX_MODEL_TURNS = ASK_MAX_TOOL_CALLS + 2;

/** Request parameters for the first model turn of one doubt (exported for tests: no secrets in here). */
export function buildAskRequest(config: Pick<AskConfig, "model" | "maxTokens">, input: AskModelInput) {
  const content: BetaContentBlockParam[] = [];
  if (input.image) {
    content.push({ type: "image", source: { type: "base64", media_type: input.image.mediaType, data: input.image.base64 } });
  }
  content.push({
    type: "text",
    text: buildUserText({
      question: input.question,
      subject: input.subject,
      language: input.language,
      hasImage: input.image !== null,
      toolContext: input.toolContext ?? null,
    }),
  });

  const params: BetaMessageStreamParams = {
    model: config.model,
    max_tokens: config.maxTokens,
    system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }],
    tools: [...ASK_TOOLS],
    messages: [{ role: "user", content }],
    betas: [ASK_FALLBACK_BETA],
    fallbacks: "default",
  };
  if (supportsEffort(config.model)) params.output_config = { effort: ASK_EFFORT };
  return params;
}

// ---------------------------------------------------------------------------------------------
// The tool loop

export interface AskUsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** What the loop yields while it runs. */
export type AskLoopEvent =
  /** The first model turn has started (the request was accepted): the route can answer 200. */
  | { kind: "open" }
  /** A raw text delta from the model (the route strips the trailer). */
  | { kind: "text"; text: string }
  /**
   * A model turn that asked for tools has finished, so its text is complete. Yielded before that
   * turn's cards. The route closes its trailer filter here: a trailer written before a tool call
   * must not swallow the later answer, and the next turn's text starts a new paragraph.
   */
  | { kind: "turn_end" }
  /** A successful tool result to show, always before the model text that discusses it. */
  | { kind: "card"; card: RanchoToolCard };

/** Counts so far: tokens of the finished model turns, tool calls run, model requests made. */
export interface AskConversationProgress {
  usage: AskUsageTotals;
  toolCalls: number;
  turns: number;
}

/** The loop's return value. Usage is summed over every model turn (tool rounds included). */
export interface AskConversationResult extends AskConversationProgress {
  /** The last turn's stop reason ("ceiling" when ASK_MAX_MODEL_TURNS ran out). */
  stop: string | null;
}

export interface AskConversation {
  events: AsyncGenerator<AskLoopEvent, AskConversationResult, void>;
  /** Stops the current model turn and every later one (the browser went away). */
  abort(): void;
  /**
   * A snapshot of the counts so far, for logging a question that failed or was cancelled part-way
   * (the generator's return value only exists on success). Tokens cover finished turns only.
   */
  progress(): AskConversationProgress;
}

const TOOL_LIMIT_RESULT = JSON.stringify({
  status: "tool_limit_reached",
  message: "No more tool calls for this question. Answer with the results you already have, and say what you could not check.",
});

/** Per-turn output cap: what is left of the per-question budget, but never below the minimum. */
function turnMaxTokens(budget: number, used: number): number {
  return Math.max(MIN_ASK_MAX_TOKENS, budget - used);
}

function addUsage(totals: AskUsageTotals, usage: BetaMessage["usage"] | undefined): void {
  if (!usage) return;
  totals.inputTokens += usage.input_tokens ?? 0;
  totals.outputTokens += usage.output_tokens ?? 0;
  totals.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  totals.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
}

/**
 * Splits a finished assistant turn into what goes back into the history and the tool calls to
 * run. After a mid-output refusal fallback (a `fallback` block), the declined partial before the
 * last boundary keeps only its text: its thinking and tool_use blocks are neither echoed nor run.
 * The `fallback` blocks themselves stay where they appeared (the SDK asks for them to be echoed in
 * place; the server uses them to tell thinking runs apart).
 */
export function assistantTurn(content: readonly BetaContentBlock[]): { echo: BetaContentBlockParam[]; toolUses: BetaToolUseBlock[] } {
  let boundary = -1;
  content.forEach((block, index) => {
    if (block.type === "fallback") boundary = index;
  });
  const kept = content.filter((block, index) => index > boundary || block.type === "text" || block.type === "fallback");
  return {
    echo: kept as BetaContentBlockParam[],
    toolUses: kept.filter((block): block is BetaToolUseBlock => block.type === "tool_use"),
  };
}

function snapshot(progress: AskConversationProgress): AskConversationProgress {
  return { usage: { ...progress.usage }, toolCalls: progress.toolCalls, turns: progress.turns };
}

async function* runConversation(
  client: Anthropic,
  config: Pick<AskConfig, "model" | "maxTokens">,
  input: AskModelInput,
  signal: AbortSignal,
  now: () => number,
  /** Running counts, shared with `AskConversation.progress()`; updated in place. */
  progress: AskConversationProgress,
): AsyncGenerator<AskLoopEvent, AskConversationResult, void> {
  const base = buildAskRequest(config, input);
  const messages: BetaMessageParam[] = [...base.messages];
  const done = (stop: string | null): AskConversationResult => ({ stop, ...snapshot(progress) });
  let opened = false;

  while (progress.turns < ASK_MAX_MODEL_TURNS) {
    if (signal.aborted) throw new APIUserAbortError();
    progress.turns += 1;
    const params: BetaMessageStreamParams = {
      ...base,
      // Append-only history: earlier turns are sent again byte-for-byte, never rebuilt.
      messages: [...messages],
      max_tokens: turnMaxTokens(config.maxTokens, progress.usage.outputTokens),
      // Out of tool calls: the model must answer now (tool_choice is outside the cached prefix).
      ...(progress.toolCalls >= ASK_MAX_TOOL_CALLS ? { tool_choice: { type: "none" as const } } : {}),
    };
    const stream = client.beta.messages.stream(params, { signal });

    for await (const event of stream) {
      if (!opened) {
        opened = true;
        yield { kind: "open" };
      }
      if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
        yield { kind: "text", text: event.delta.text };
      }
    }
    const message = await stream.finalMessage();
    addUsage(progress.usage, message.usage);

    // end_turn, max_tokens (a tool input may be cut off: never run it), refusal, …: done.
    if (message.stop_reason !== "tool_use") return done(message.stop_reason ?? null);
    const { echo, toolUses } = assistantTurn(message.content ?? []);
    if (toolUses.length === 0) return done(message.stop_reason);

    // This turn's text is complete; the route closes its trailer filter before any card.
    yield { kind: "turn_end" };
    messages.push({ role: "assistant", content: echo });
    // Every tool_result of a round goes back in ONE user message (parallel tool use).
    const results: BetaToolResultBlockParam[] = [];
    for (const call of toolUses) {
      if (progress.toolCalls >= ASK_MAX_TOOL_CALLS) {
        results.push({ type: "tool_result", tool_use_id: call.id, content: TOOL_LIMIT_RESULT, is_error: true });
        continue;
      }
      progress.toolCalls += 1;
      const outcome = runAskTool(call.name, call.input, { language: input.language, now: now() });
      results.push({ type: "tool_result", tool_use_id: call.id, content: outcome.content, ...(outcome.isError ? { is_error: true } : {}) });
      if (outcome.card) yield { kind: "card", card: outcome.card };
    }
    messages.push({ role: "user", content: results });
  }
  return done("ceiling");
}

/**
 * Starts one question's conversation with the model. Iterate `events` for text and cards; the
 * generator's return value has the stop reason and summed usage. Upstream errors are thrown from
 * the iteration (before `open` for a request that was never accepted).
 */
export function startAskConversation(
  client: Anthropic,
  config: Pick<AskConfig, "model" | "maxTokens">,
  input: AskModelInput,
  options: { now?: () => number } = {},
): AskConversation {
  const controller = new AbortController();
  const progress: AskConversationProgress = {
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    toolCalls: 0,
    turns: 0,
  };
  return {
    events: runConversation(client, config, input, controller.signal, options.now ?? Date.now, progress),
    abort: () => controller.abort(),
    progress: () => snapshot(progress),
  };
}
