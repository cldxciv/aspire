import { ASK_SUBJECTS, type AskAnswerMeta, type AskSubject } from "./constants";

/**
 * The machine-readable trailer the model appends to every answer (see prompt.ts):
 *
 *   <aspire-meta>{"subject":"physics","topic":"Projectile motion","difficulty":"medium"}</aspire-meta>
 *
 * It feeds weak-topic tracking and is never shown to the student. The API strips it from the
 * stream with `createTrailerFilter()`; the UI runs `splitAnswer()` again as a safety net.
 * Parsing is defensive: model output is untrusted text.
 */

export const TRAILER_OPEN = "<aspire-meta>";
export const TRAILER_CLOSE = "</aspire-meta>";

export const MAX_TOPIC_CHARS = 80;

const SUBJECT_ALIASES: Readonly<Record<string, AskSubject | "other">> = {
  physics: "physics",
  phy: "physics",
  chemistry: "chemistry",
  chem: "chemistry",
  maths: "maths",
  math: "maths",
  mathematics: "maths",
  biology: "biology",
  bio: "biology",
  botany: "biology",
  zoology: "biology",
};

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

/** Trims, removes control characters / markup and caps a model-supplied topic label. */
export function cleanTopic(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f<>`{}[\]\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TOPIC_CHARS)
    .trim();
  if (cleaned.length < 2) return null;
  if (/^(none|n\/a|na|unknown|other|null)$/i.test(cleaned)) return null;
  return cleaned;
}

/** Case- and space-insensitive key used to count repeats of the same topic. */
export function topicKey(topic: string): string {
  return topic.toLocaleLowerCase("en-IN").replace(/\s+/g, " ").trim();
}

function normaliseSubject(value: unknown): AskSubject | "other" {
  if (typeof value !== "string") return "other";
  const key = value.trim().toLowerCase();
  const alias = SUBJECT_ALIASES[key];
  if (alias) return alias;
  return (ASK_SUBJECTS as readonly string[]).includes(key) ? (key as AskSubject) : "other";
}

/** Parses the text after `<aspire-meta>` (closing tag optional). `null` if it is not usable JSON. */
export function parseTrailerBody(body: string): AskAnswerMeta | null {
  const closeAt = body.indexOf(TRAILER_CLOSE);
  const inner = closeAt === -1 ? body : body.slice(0, closeAt);
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(inner.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const subject = normaliseSubject(record.subject);
  const difficultyRaw = typeof record.difficulty === "string" ? record.difficulty.trim().toLowerCase() : "";
  const difficulty = (DIFFICULTIES as readonly string[]).includes(difficultyRaw)
    ? (difficultyRaw as AskAnswerMeta["difficulty"])
    : null;
  return { subject, topic: subject === "other" ? null : cleanTopic(record.topic), difficulty };
}

/**
 * Trailing whitespace off, plus an unmatched opening code fence at the very end (left behind
 * when the model wraps its trailer in a fence). A properly closed final code block is kept.
 */
export function tidyAnswerEnd(text: string): string {
  const trimmed = text.replace(/\s+$/, "");
  const fences = trimmed.match(/^\s*```/gm)?.length ?? 0;
  if (fences % 2 === 1 && /(^|\n)\s*```[a-z-]*$/i.test(trimmed)) {
    return trimmed.replace(/(^|\n)\s*```[a-z-]*$/i, "").replace(/\s+$/, "");
  }
  return trimmed;
}

/** Splits a complete answer into the visible text and the parsed trailer. */
export function splitAnswer(full: string): { answer: string; meta: AskAnswerMeta | null } {
  const at = full.indexOf(TRAILER_OPEN);
  if (at === -1) return { answer: tidyAnswerEnd(full), meta: null };
  return { answer: tidyAnswerEnd(full.slice(0, at)), meta: parseTrailerBody(full.slice(at + TRAILER_OPEN.length)) };
}

/** Length of the longest suffix of `text` that is a proper prefix of `marker`. */
function partialMarkerSuffix(text: string, marker: string): number {
  const max = Math.min(text.length, marker.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (marker.startsWith(text.slice(text.length - length))) return length;
  }
  return 0;
}

export interface TrailerFilter {
  /** Feed one streamed chunk; returns the text that is safe to show now. */
  push(chunk: string): string;
  /** Call once at the end: any held-back text plus the parsed trailer. */
  end(): { tail: string; meta: AskAnswerMeta | null };
}

/**
 * Streaming trailer stripper. Text is forwarded as it arrives, except a suffix that could be
 * the start of `<aspire-meta>` (held back until it is clear). Everything from the marker on is
 * swallowed and parsed at the end.
 */
export function createTrailerFilter(): TrailerFilter {
  let pending = "";
  let trailer: string | null = null;
  return {
    push(chunk) {
      if (trailer !== null) {
        trailer += chunk;
        return "";
      }
      pending += chunk;
      const at = pending.indexOf(TRAILER_OPEN);
      if (at !== -1) {
        const visible = pending.slice(0, at);
        trailer = pending.slice(at + TRAILER_OPEN.length);
        pending = "";
        return visible;
      }
      const hold = partialMarkerSuffix(pending, TRAILER_OPEN);
      const visible = pending.slice(0, pending.length - hold);
      pending = pending.slice(pending.length - hold);
      return visible;
    },
    end() {
      if (trailer === null) {
        const tail = pending;
        pending = "";
        return { tail, meta: null };
      }
      return { tail: "", meta: parseTrailerBody(trailer) };
    },
  };
}
