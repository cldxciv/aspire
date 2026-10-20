import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import type { Answer, RunnerQuestion } from "@/lib/mocktest/types";

/** Display helpers for the mock-test UI (client-safe, pure). Dates are shown in India Standard Time. */

export type MocktestMessages = Messages<"mocktest">;

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export function localeTag(locale: Locale): string {
  return locale === "hi" ? "hi-IN" : "en-IN";
}

export function formatDate(epochMs: number, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(epochMs);
}

export function formatDateTime(epochMs: number, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(epochMs);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

/** "2 min 05 s" / "45 s". */
export function formatDuration(totalSeconds: number, t: MocktestMessages["common"]): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0
    ? format(t.durationMinSec, { m: minutes, s: String(seconds).padStart(2, "0") })
    : format(t.durationSec, { s: seconds });
}

/** 0–1 → whole percent. */
export function percent(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

/** Signed marks, e.g. "+4", "−1", "0". */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

/** A response as text: "(B) 20 m" for an MCQ, the typed value for a numerical question. */
export function answerText(question: RunnerQuestion, answer: Answer | number, lang: "en" | "hi"): string {
  if (answer === null || answer === undefined || answer === "") return "";
  if (question.type === "mcq" && typeof answer === "number") {
    const option = question.options?.[answer];
    return `(${OPTION_LETTERS[answer] ?? answer + 1}) ${option ? option[lang] : ""}`.trim();
  }
  const unit = question.unit ? ` ${question.unit[lang]}` : "";
  return `${answer}${unit}`;
}
