import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";

import type { AskConfig } from "./config";
import { supportsEffort } from "./config";
import type { AskImageType, AskLanguage, AskSubjectHint } from "./constants";
import { buildSystemPrompt, buildUserText } from "./prompt";

/**
 * The one place that talks to the Claude API (Anthropic Messages API, official SDK).
 *
 * - Streaming, so long answers never hit HTTP timeouts and the student sees text as it arrives.
 * - Thinking is left to the model's default (adaptive on Opus 5.5) with effort "medium" — the
 *   Opus 5.5 default, set explicitly; it bounds the hidden reasoning spend.
 * - The system prompt is identical for every request and marked for prompt caching.
 * - Server-side refusal fallback (`fallbacks: "default"`): if the model's safety classifiers
 *   decline a legitimate textbook question (e.g. NEET biology), the API retries it on a
 *   fallback model inside the same call. Models without fallback support ignore it.
 */

export interface AskModelInput {
  question: string;
  subject: AskSubjectHint;
  language: AskLanguage;
  image: { mediaType: AskImageType; base64: string } | null;
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

/** Request parameters for one doubt (exported for tests: no secrets in here). */
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
    }),
  });

  const params: BetaMessageStreamParams = {
    model: config.model,
    max_tokens: config.maxTokens,
    system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    betas: [ASK_FALLBACK_BETA],
    fallbacks: "default",
  };
  if (supportsEffort(config.model)) params.output_config = { effort: ASK_EFFORT };
  return params;
}

/** Starts the streamed answer. Errors surface when the stream is iterated. */
export function streamAnswer(client: Anthropic, config: Pick<AskConfig, "model" | "maxTokens">, input: AskModelInput, signal?: AbortSignal) {
  return client.beta.messages.stream(buildAskRequest(config, input), signal ? { signal } : undefined);
}
