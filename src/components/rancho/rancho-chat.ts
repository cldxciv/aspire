import { createNdjsonDecoder, failureFromResponse, type AskClientEvent, type AskFailure } from "@/components/ask/ask-client";
import { isLeadGateResponse } from "@/components/lead-gate/lead-gate-client";
import { stripLocale } from "@/i18n/paths";
import { clampToolSummary, type RanchoToolCard, type RanchoToolContext } from "@/lib/ask/cards";
import {
  ASK_ENDPOINT,
  ASK_MAX_QUESTION_CHARS,
  type AskAnswerMeta,
  type AskImageType,
  type AskLanguage,
  type AskStatus,
  type AskStreamEvent,
  type AskSubjectHint,
} from "@/lib/ask/constants";
import { splitAnswer } from "@/lib/ask/trailer";

/**
 * Browser-side helpers for the Rancho chat (pure / fetch-injected, unit-tested), used by the floating
 * panel and the chat on /tools/ask and /rancho (RanchoChat). Contract: `GET` / `POST /api/ask`
 * (docs/ask-aspire.md): a typed question, a photo of one, or both (photo handling: rancho-photo.ts),
 * plus an optional `toolContext` after an "Ask Rancho about this" handoff; the stream can carry tool
 * cards (`{ t: "card" }`, src/lib/ask/cards.ts). Nothing here touches browser storage: the
 * conversation lives in React state.
 */

/** Phones get a full-height modal sheet; from this width up the panel is a non-modal popover. */
export const RANCHO_DESKTOP_QUERY = "(min-width: 640px)";

export type RanchoStop = Extract<AskStreamEvent, { t: "done" }>["stop"] | "stopped";

export interface RanchoQuestion {
  /** May be empty when a photo is attached. */
  question: string;
  subject: AskSubjectHint;
  language: AskLanguage;
  /** A prepared photo (a JPEG re-encoded on the device, so without location metadata). */
  photo?: { mediaType: AskImageType; base64: string } | null;
  /** The student ticked "this photo shows only the question (no faces or names)". */
  photoConsent?: boolean;
  /** Context from a tool handoff ("Ask Rancho about this"), sent once with the next question. */
  toolContext?: RanchoToolContext | null;
}

/** `POST /api/ask` JSON body (src/lib/ask/schema.ts): `image` and `photoConsent` only with a photo. */
export interface RanchoAskBody {
  question: string;
  subject: AskSubjectHint;
  language: AskLanguage;
  image?: { mediaType: AskImageType; data: string };
  photoConsent?: boolean;
  toolContext?: RanchoToolContext;
}

/** The `POST /api/ask` JSON body: a typed question, a photo, or both (+ a tool context, if any). */
export function buildAskBody(input: RanchoQuestion): RanchoAskBody {
  const body: RanchoAskBody = { question: input.question.trim(), subject: input.subject, language: input.language };
  if (input.photo) {
    body.image = { mediaType: input.photo.mediaType, data: input.photo.base64 };
    body.photoConsent = input.photoConsent === true;
  }
  if (input.toolContext) {
    body.toolContext = { tool: input.toolContext.tool, summary: clampToolSummary(input.toolContext.summary) };
  }
  return body;
}

export type RanchoQuestionProblem = "required" | "too_long" | "consent_required";

/**
 * Client-side check before sending, with the API's rules (it checks again): a question or a photo
 * is required, the question has a length limit, and a photo needs the no-faces-or-names box ticked.
 */
export function validateQuestion(question: string, photo: { consent: boolean } | null = null): RanchoQuestionProblem | null {
  const trimmed = question.trim();
  if (!trimmed && !photo) return "required";
  if (trimmed.length > ASK_MAX_QUESTION_CHARS) return "too_long";
  if (photo && !photo.consent) return "consent_required";
  return null;
}

export interface RanchoAnswer {
  /** Visible answer text (the model's topic trailer is never shown). */
  text: string;
  stop: RanchoStop | null;
  meta: AskAnswerMeta | null;
  failure: AskFailure | null;
  /** Tool cards that came with the answer, in order (unknown kinds are already dropped). */
  cards: RanchoToolCard[];
}

export interface AskRanchoOptions {
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Today's allowance after this question was counted. */
  onStart?: (allowance: { remaining: number; limit: number }) => void;
  /** The answer so far, each time more text arrives. */
  onText?: (text: string) => void;
  /** A tool card, as soon as it arrives. */
  onCard?: (card: RanchoToolCard) => void;
}

/**
 * Sends one question and reads the NDJSON answer stream. Never throws: failures come back as
 * `failure` (same kinds as the Ask page), an abort through `signal` as `stop: "stopped"`.
 */
export async function askRancho(input: RanchoQuestion, options: AskRanchoOptions): Promise<RanchoAnswer> {
  const { signal, fetchImpl = fetch, onStart, onText, onCard } = options;
  let response: Response;
  try {
    response = await fetchImpl(ASK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAskBody(input)),
      cache: "no-store",
      signal,
    });
  } catch {
    return { text: "", stop: signal.aborted ? "stopped" : null, meta: null, failure: signal.aborted ? null : { kind: "network" }, cards: [] };
  }

  if (!response.ok || !response.body) {
    // The lead gate (docs/lead-gate-plan.md §5.6): nothing was read or counted; the chat holds the
    // question and shows the contact form. Only the gate's own 401 (header), never any other 401.
    if (isLeadGateResponse(response)) return { text: "", stop: null, meta: null, failure: { kind: "gate" }, cards: [] };
    const body: unknown = await response.json().catch(() => null);
    return {
      text: "",
      stop: null,
      meta: null,
      failure: failureFromResponse(response.status, body, response.headers.get("retry-after")),
      cards: [],
    };
  }

  const reader = response.body.getReader();
  const textDecoder = new TextDecoder();
  const lines = createNdjsonDecoder();
  let text = "";
  let finished = false;
  let stop: RanchoStop | null = null;
  let meta: AskAnswerMeta | null = null;
  let failure: AskFailure | null = null;
  const cards: RanchoToolCard[] = [];

  const apply = (events: AskClientEvent[]) => {
    for (const event of events) {
      if (event.t === "card") {
        cards.push(event.card);
        onCard?.(event.card);
      } else if (event.t === "start") {
        onStart?.({ remaining: event.remaining, limit: event.limit });
      } else if (event.t === "delta") {
        text += event.text;
        onText?.(splitAnswer(text).answer);
      } else if (event.t === "done") {
        finished = true;
        stop = event.stop;
        meta = event.meta;
      } else if (event.t === "error") {
        finished = true;
        failure = { kind: event.code === "interrupted" ? "interrupted" : "busy" };
      }
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        apply(lines.push(textDecoder.decode()));
        apply(lines.end());
        break;
      }
      apply(lines.push(textDecoder.decode(value, { stream: true })));
    }
    if (!finished) failure = { kind: "interrupted" };
  } catch {
    if (signal.aborted) stop = "stopped";
    else failure = { kind: text ? "interrupted" : "network" };
  }
  // Safety net: never show a trailer the server did not strip.
  return { text: splitAnswer(text).answer, stop, meta, failure, cards };
}

/**
 * What replaces the composer, if anything: "not_connected" (no API key on the server, from the
 * status or a 503 `not_configured`), "limit" (today's questions used, from the status or a 429), or
 * null (the composer is shown).
 */
export function chatBlock(
  status: Pick<AskStatus, "configured" | "remaining"> | null,
  seen: { notConfigured: boolean; limitReached: boolean },
): "not_connected" | "limit" | null {
  if (seen.notConfigured || status?.configured === false) return "not_connected";
  if (seen.limitReached || (status !== null && status.remaining <= 0)) return "limit";
  return null;
}

/** `GET /api/ask`: connected? and today's allowance. Null when it can't be read. */
export async function fetchAskStatus(signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<AskStatus | null> {
  try {
    const response = await fetchImpl(ASK_ENDPOINT, { cache: "no-store", signal });
    if (!response.ok) return null;
    const body = (await response.json()) as { ok?: boolean; data?: AskStatus } | null;
    return body?.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

/**
 * Pages where the floating launcher is not shown: the Rancho pages themselves (/tools/ask and the
 * /rancho app, which ARE Rancho) and a mock test attempt (no AI help during a test). Accepts `/x`,
 * `/en/x` or `/hi/x`.
 */
export function isRanchoHiddenPath(pathname: string | null | undefined): boolean {
  const path = stripLocale(pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/tools/ask" || path.startsWith("/tools/ask/")) return true;
  if (path === "/rancho" || path.startsWith("/rancho/")) return true;
  return /^\/tools\/mock-tests\/(?!leaderboard$|verify$)[^/]+$/.test(path);
}
