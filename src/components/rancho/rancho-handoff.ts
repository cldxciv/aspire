import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask/constants";
import {
  clampToolSummary,
  RANCHO_OPEN_EVENT,
  type RanchoOpenDetail,
  type RanchoTool,
  type RanchoToolContext,
} from "@/lib/ask/cards";

/**
 * "Ask Rancho about this" handoffs from the student tools (pure + one listener helper, unit-tested).
 * A tool calls `openRancho({ prompt, toolContext })` (src/lib/ask/cards.ts), which dispatches
 * `RANCHO_OPEN_EVENT` on `window`. The page's Rancho chat (the floating panel via RanchoLauncher, or
 * the chat on /tools/ask and /rancho) listens, prefills the composer, shows a removable "From: …"
 * chip and sends `toolContext` with the next question. Nothing goes in the URL or in storage.
 */

const TOOLS: readonly RanchoTool[] = ["predictor", "mock-test", "planner"];

export interface RanchoHandoff {
  /** Increases with every handoff, so the chat applies each one once. */
  id: number;
  /** Prefill for the composer ("" = keep what is there). */
  prompt: string;
  toolContext: RanchoToolContext | null;
}

/** Cleans an event's detail: a capped prompt and a valid, clamped tool context (or none). */
export function readOpenDetail(detail: unknown): Omit<RanchoHandoff, "id"> {
  const value = (typeof detail === "object" && detail !== null ? detail : {}) as RanchoOpenDetail;
  const prompt =
    typeof value.prompt === "string"
      ? value.prompt
          .replace(/\r\n?/g, "\n")
          .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
          .trim()
          .slice(0, ASK_MAX_QUESTION_CHARS)
      : "";
  const context = value.toolContext;
  const toolContext =
    context && typeof context === "object" && TOOLS.includes(context.tool) && typeof context.summary === "string" && context.summary.trim()
      ? { tool: context.tool, summary: clampToolSummary(context.summary) }
      : null;
  return { prompt, toolContext };
}

let lastHandoffId = 0;

/** Calls `onOpen` for every `RANCHO_OPEN_EVENT` on `target` (default `window`); returns the unsubscribe. */
export function listenForRanchoOpen(
  onOpen: (handoff: RanchoHandoff) => void,
  target: EventTarget | undefined = typeof window === "undefined" ? undefined : window,
): () => void {
  if (!target) return () => {};
  const handler = (event: Event) => {
    lastHandoffId += 1;
    onOpen({ id: lastHandoffId, ...readOpenDetail((event as CustomEvent<unknown>).detail) });
  };
  target.addEventListener(RANCHO_OPEN_EVENT, handler);
  return () => target.removeEventListener(RANCHO_OPEN_EVENT, handler);
}
