import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock, BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";

import type { QbImportConfig } from "./config";

/**
 * The one place QB-IMPORT talks to the Claude API (official SDK). Injectable: the job runner only
 * sees `QbImportClient`, so tests use a fake and never call the API.
 *
 * - Sync: `client.beta.messages.stream(…).finalMessage()` (large `max_tokens`, streamed so long
 *   outputs never hit HTTP timeouts), with the server-side refusal fallback.
 * - Batch: `client.messages.batches.*` (half price); results are keyed by `custom_id`, never by
 *   position. Batch requests carry no `betas` / `fallbacks` (the Batches API rejects them).
 * The client is created separately from Rancho's; it shares `ANTHROPIC_API_KEY` /
 * `ANTHROPIC_WORKSPACE_ID` and retries 429 / 5xx twice (the SDK's own retries).
 */

export interface CallUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ModelReply {
  stopReason: string | null;
  /** The text the response ends with (after the last fallback boundary): the JSON output. */
  text: string | null;
  usage: CallUsage;
  /** The model that produced the final answer (differs after a refusal fallback). */
  model: string;
}

export type BatchProcessing = "in_progress" | "canceling" | "ended";

export type BatchResult =
  | { customId: string; type: "succeeded"; reply: ModelReply }
  | { customId: string; type: "errored" | "expired" | "canceled"; errorType: string | null };

export interface BatchRequest {
  customId: string;
  params: MessageCreateParamsNonStreaming;
}

export interface QbImportClient {
  /** One streamed request; resolves with the final message. Throws SDK errors (status on `.status`). */
  extract(params: BetaMessageStreamParams, options: { signal?: AbortSignal; timeoutMs: number }): Promise<ModelReply>;
  createBatch(requests: readonly BatchRequest[]): Promise<{ id: string }>;
  retrieveBatch(id: string): Promise<{ id: string; processingStatus: BatchProcessing }>;
  batchResults(id: string): AsyncIterable<BatchResult>;
  cancelBatch(id: string): Promise<void>;
}

type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
} | null | undefined;

export function usageOf(usage: UsageLike): CallUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

/**
 * The JSON text of a response: text blocks after the last `fallback` block (a declined partial
 * before a fallback boundary is never parsed), joined.
 */
export function replyText(content: readonly { type: string; text?: string }[]): string | null {
  let boundary = -1;
  content.forEach((block, index) => {
    if (block.type === "fallback") boundary = index;
  });
  const text = content
    .slice(boundary + 1)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
  return text.length > 0 ? text : null;
}

/** HTTP status of an SDK error (or a fake's `{ status }`); null for anything else. */
export function errorStatus(error: unknown): number | null {
  if (error instanceof Anthropic.APIError && typeof error.status === "number") return error.status;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

/** Retryable at job level: rate limits, overload, server errors, timeouts and connection drops. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError) return true;
  const status = errorStatus(error);
  return status === null ? false : status === 408 || status === 409 || status === 429 || status >= 500;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Anthropic.APIUserAbortError || (error instanceof Error && error.name === "AbortError");
}

/** A short, secret-free code for the job's error column. */
export function errorCode(error: unknown): string {
  if (isAbortError(error)) return "aborted";
  const status = errorStatus(error);
  if (status !== null) return `api_${status}`;
  if (error instanceof Anthropic.APIConnectionError) return "api_connection";
  if (error instanceof Error && /^[a-z_]{3,40}$/.test(error.message)) return error.message;
  return "unexpected";
}

export function createAnthropicImportClient(config: Pick<QbImportConfig, "apiKey" | "workspaceId">): QbImportClient | null {
  if (!config.apiKey) return null;
  const client = new Anthropic({
    apiKey: config.apiKey,
    maxRetries: 2,
    timeout: 10 * 60_000,
    ...(config.workspaceId ? { defaultHeaders: { "anthropic-workspace-id": config.workspaceId } } : {}),
  });
  return {
    async extract(params, options) {
      const stream = client.beta.messages.stream(params, { signal: options.signal, timeout: options.timeoutMs });
      const message = await stream.finalMessage();
      return {
        stopReason: message.stop_reason ?? null,
        text: replyText((message.content ?? []) as readonly BetaContentBlock[] as readonly { type: string; text?: string }[]),
        usage: usageOf(message.usage),
        model: message.model,
      };
    },
    async createBatch(requests) {
      const batch = await client.messages.batches.create({
        requests: requests.map((request) => ({ custom_id: request.customId, params: request.params })),
      });
      return { id: batch.id };
    },
    async retrieveBatch(id) {
      const batch = await client.messages.batches.retrieve(id);
      return { id: batch.id, processingStatus: batch.processing_status };
    },
    async *batchResults(id) {
      for await (const entry of await client.messages.batches.results(id)) {
        const result = entry.result;
        if (result.type === "succeeded") {
          yield {
            customId: entry.custom_id,
            type: "succeeded",
            reply: {
              stopReason: result.message.stop_reason ?? null,
              text: replyText(result.message.content as readonly { type: string; text?: string }[]),
              usage: usageOf(result.message.usage),
              model: result.message.model,
            },
          };
        } else if (result.type === "errored") {
          yield { customId: entry.custom_id, type: "errored", errorType: result.error?.error?.type ?? null };
        } else {
          yield { customId: entry.custom_id, type: result.type, errorType: null };
        }
      }
    },
    async cancelBatch(id) {
      await client.messages.batches.cancel(id);
    },
  };
}
