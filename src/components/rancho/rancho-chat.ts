import { createNdjsonDecoder, failureFromResponse, type AskFailure } from "@/components/ask/ask-client";
import { stripLocale } from "@/i18n/paths";
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
 * Browser-side helpers for the floating Rancho chat (pure / fetch-injected, unit-tested). The panel
 * uses the same backend and contract as the Ask page (`GET` / `POST /api/ask`, docs/ask-aspire.md):
 * a typed question, a photo of one, or both (photo handling: rancho-photo.ts). Nothing here touches
 * browser storage: the conversation lives in React state.
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
}

/** `POST /api/ask` JSON body (src/lib/ask/schema.ts): `image` and `photoConsent` only with a photo. */
export interface RanchoAskBody {
  question: string;
  subject: AskSubjectHint;
  language: AskLanguage;
  image?: { mediaType: AskImageType; data: string };
  photoConsent?: boolean;
}

/** The `POST /api/ask` JSON body: a typed question, a photo, or both. */
export function buildAskBody(input: RanchoQuestion): RanchoAskBody {
  const body: RanchoAskBody = { question: input.question.trim(), subject: input.subject, language: input.language };
  if (input.photo) {
    body.image = { mediaType: input.photo.mediaType, data: input.photo.base64 };
    body.photoConsent = input.photoConsent === true;
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
}

export interface AskRanchoOptions {
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Today's allowance after this question was counted. */
  onStart?: (allowance: { remaining: number; limit: number }) => void;
  /** The answer so far, each time more text arrives. */
  onText?: (text: string) => void;
}

/**
 * Sends one question and reads the NDJSON answer stream. Never throws: failures come back as
 * `failure` (same kinds as the Ask page), an abort through `signal` as `stop: "stopped"`.
 */
export async function askRancho(input: RanchoQuestion, options: AskRanchoOptions): Promise<RanchoAnswer> {
  const { signal, fetchImpl = fetch, onStart, onText } = options;
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
    return { text: "", stop: signal.aborted ? "stopped" : null, meta: null, failure: signal.aborted ? null : { kind: "network" } };
  }

  if (!response.ok || !response.body) {
    const body: unknown = await response.json().catch(() => null);
    return { text: "", stop: null, meta: null, failure: failureFromResponse(response.status, body, response.headers.get("retry-after")) };
  }

  const reader = response.body.getReader();
  const textDecoder = new TextDecoder();
  const lines = createNdjsonDecoder();
  let text = "";
  let finished = false;
  let stop: RanchoStop | null = null;
  let meta: AskAnswerMeta | null = null;
  let failure: AskFailure | null = null;

  const apply = (events: AskStreamEvent[]) => {
    for (const event of events) {
      if (event.t === "start") {
        onStart?.({ remaining: event.remaining, limit: event.limit });
      } else if (event.t === "delta") {
        text += event.text;
        onText?.(splitAnswer(text).answer);
      } else if (event.t === "done") {
        finished = true;
        stop = event.stop;
        meta = event.meta;
      } else {
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
  return { text: splitAnswer(text).answer, stop, meta, failure };
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
 * Pages where the floating launcher is not shown: the Ask page itself (it IS Rancho) and a mock
 * test attempt (no AI help during a test). Accepts `/x`, `/en/x` or `/hi/x`.
 */
export function isRanchoHiddenPath(pathname: string | null | undefined): boolean {
  const path = stripLocale(pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/tools/ask" || path.startsWith("/tools/ask/")) return true;
  return /^\/tools\/mock-tests\/(?!leaderboard$|verify$)[^/]+$/.test(path);
}
