import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import type { QbFlag, QbStatus } from "@/lib/qb/types";
import { isOneOf, QB_ADMIN_BLOCKING_FLAGS, QB_ADMIN_FLAGS } from "./constants";
import { QB_CONFLICT_CODES, type QbChapterView, type QbQuestionListItem } from "./contract";

/** Pure display helpers for the question-bank admin (client-safe; copy comes from the `qb` messages). */

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

const intlLocale = (locale: Locale) => (locale === "hi" ? "hi-IN" : "en-IN");

/** "22 Oct 2026, 3:05 pm" in India time (staff work in IST). */
export function formatDateTime(ms: number, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(ms);
}

/** A date from epoch ms or `YYYY-MM-DD`, in India time. */
export function formatDate(value: number | string, locale: Locale): string {
  const ms = typeof value === "number" ? value : Date.parse(`${value}T00:00:00+05:30`);
  if (!Number.isFinite(ms)) return String(value);
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(ms);
}

/** 0.456 → "46 %" (whole percent; `—` for null). */
export function formatShare(value: number | null, locale: Locale): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(value);
}

export function isBlockingFlag(flag: QbFlag): boolean {
  return QB_ADMIN_BLOCKING_FLAGS.includes(flag);
}

/** Blocking flags first, then the rest, each group in a stable order. */
export function sortFlags(flags: readonly QbFlag[]): QbFlag[] {
  return [...new Set(flags)].sort((a, b) => Number(isBlockingFlag(b)) - Number(isBlockingFlag(a)) || a.localeCompare(b));
}

/** The status shown for a row: approved-but-suspended reads as "suspended". */
export function displayStatus(item: Pick<QbQuestionListItem, "status" | "suspended">): QbStatus | "suspended" {
  return item.status === "approved" && item.suspended ? "suspended" : item.status;
}

/** Chapter id → its label in `locale` (falls back to the English label, then the id). */
export function chapterLabeler(chapters: readonly QbChapterView[], locale: Locale): (id: string | null) => string | null {
  const map = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  return (id) => {
    if (id === null) return null;
    const chapter = map.get(id);
    if (!chapter) return id;
    return (locale === "hi" ? chapter.label.hi : "") || chapter.label.en || id;
  };
}

/** A one-line preview of rich text: whitespace collapsed, cut at `max` characters with "…". */
export function previewText(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Splits a textarea into trimmed, non-empty, unique lines (unit ids, overrides). */
export function lines(value: string, max = 100): string[] {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].slice(0, max);
}

/**
 * Manual chapter weights from "chapter-id = 12" lines. Lines that do not parse are returned in
 * `invalid` (the editor shows them instead of dropping them silently).
 */
export function parseOverrides(value: string): { overrides: Record<string, number>; invalid: string[] } {
  const overrides: Record<string, number> = {};
  const invalid: string[] = [];
  for (const line of lines(value, 500)) {
    const match = /^([A-Za-z0-9_-]{1,64})\s*[=:]\s*(\d{1,3}(?:\.\d+)?)$/.exec(line);
    const weight = match ? Number(match[2]) : NaN;
    if (!match || weight < 0 || weight > 100) invalid.push(line);
    else overrides[match[1]] = weight;
  }
  return { overrides, invalid };
}

export function formatOverrides(overrides: Readonly<Record<string, number>>): string {
  return Object.entries(overrides)
    .map(([id, weight]) => `${id} = ${weight}`)
    .join("\n");
}

/** Shares of each answer position (A–D…) for one source row; 0 when the row is empty. */
export function positionShares(counts: readonly number[], total: number): number[] {
  return counts.map((count) => (total > 0 ? count / total : 0));
}

/**
 * Words for a server blocker code: approval blockers (`status`, `chapter`, `licence`, `role`,
 * `flag:<flag>`, `subject_scope`, `self_approval`) and publish blockers (409 codes). Unknown codes
 * are shown as written.
 */
export function blockerLabel(code: string, t: Pick<Messages<"qb">, "flags" | "errors" | "workflow">): string {
  if (code.startsWith("flag:")) {
    const flag = code.slice(5);
    return isOneOf(QB_ADMIN_FLAGS, flag) ? t.flags[flag] : code;
  }
  if (isOneOf(["status", "chapter", "licence", "role"] as const, code)) return t.workflow.blockerCodes[code];
  if (isOneOf(QB_CONFLICT_CODES, code)) return t.errors.codes[code];
  return code;
}
