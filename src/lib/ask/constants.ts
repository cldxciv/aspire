import type { AskCardEvent } from "./cards";

/**
 * Constants of Rancho, the AI doubt solver, shared by the API route and the browser UI (client-safe: no secrets,
 * no server imports). See docs/ask-aspire.md.
 */

export const ASK_ENDPOINT = "/api/ask";

/** Subjects the solver answers. "auto" = let the model work it out. */
export const ASK_SUBJECTS = ["physics", "chemistry", "maths", "biology"] as const;
export type AskSubject = (typeof ASK_SUBJECTS)[number];
export const ASK_SUBJECT_HINTS = ["auto", ...ASK_SUBJECTS] as const;
export type AskSubjectHint = (typeof ASK_SUBJECT_HINTS)[number];

export const ASK_LANGUAGES = ["en", "hi"] as const;
export type AskLanguage = (typeof ASK_LANGUAGES)[number];

/** Image types accepted (re-checked on the server by magic bytes). */
export const ASK_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AskImageType = (typeof ASK_IMAGE_TYPES)[number];

/** Largest decoded image accepted by the API. */
export const ASK_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** The browser downscales photos so the longer side is at most this many pixels. */
export const ASK_MAX_IMAGE_DIMENSION = 1600;
/** Longest typed question. */
export const ASK_MAX_QUESTION_CHARS = 2000;
/** JSON body limit: a base64 image (4/3 of the bytes) plus the question and field names. */
export const ASK_MAX_BODY_BYTES = Math.ceil((ASK_MAX_IMAGE_BYTES * 4) / 3) + 64 * 1024;

/** Account kinds as reported by `GET /api/ask` (never the account id). */
export type AskAccount = "guest" | "student" | "member";

/** `GET /api/ask` → `{ ok: true, data: AskStatus }`. */
export interface AskStatus {
  /** False until ANTHROPIC_API_KEY is set on the server. */
  configured: boolean;
  account: AskAccount;
  limit: number;
  used: number;
  remaining: number;
  /** Seconds until the daily allowance resets (midnight India time). */
  resetsInSeconds: number;
  maxImageBytes: number;
}

/** Topic tag the model attaches to an answer (parsed from its trailer; see trailer.ts). */
export interface AskAnswerMeta {
  subject: AskSubject | "other";
  topic: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
}

/**
 * `POST /api/ask` streams newline-delimited JSON (`application/x-ndjson`), one event per line.
 * Errors before the answer starts are ordinary JSON envelopes with an HTTP error status.
 *
 * `card` (./cards, `AskCardEvent`): the result of one of Aspire's tools that Rancho used while
 * answering (rank band, mock tests, exam countdown). It arrives before the answer text that
 * discusses it; there can be zero to three per answer. Clients that do not know an event type
 * skip it.
 */
export type AskStreamEvent =
  | { t: "start"; remaining: number; limit: number }
  | { t: "delta"; text: string }
  | AskCardEvent
  | { t: "done"; stop: "end_turn" | "max_tokens" | "refusal" | "other"; meta: AskAnswerMeta | null }
  | { t: "error"; code: "upstream" | "interrupted" };
