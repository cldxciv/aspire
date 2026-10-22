/**
 * Small parsers shared by the import steps (client-safe, no I/O): exam and subject labels as
 * printed or typed by staff, printed question numbers, section labels, and answers in the forms
 * keys and bank files use (`A`, `A;C`, `12`, `2.30-2.35`, an NTA option ID).
 */
import type { QbAnswer, QbExam, QbSubject } from "@/lib/qb/types";

import { IMPORT_EXAMS, IMPORT_SUBJECTS } from "./types";

const EXAM_ALIASES: Record<string, QbExam> = {
  jeemain: "JEE_MAIN",
  jeemains: "JEE_MAIN",
  jeem: "JEE_MAIN",
  neet: "NEET",
  neetug: "NEET",
  jeeadv: "JEE_ADV",
  jeeadvanced: "JEE_ADV",
  boh: "BOH",
  brainofhimachal: "BOH",
};

/** `JEE_MAIN`, `jee-main`, `JEE Main`, `NEET (UG)` … → the exam code; null when unknown. */
export function examFromLabel(raw: string | null | undefined): QbExam | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if ((IMPORT_EXAMS as readonly string[]).includes(upper)) return upper as QbExam;
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  return EXAM_ALIASES[key] ?? null;
}

const SUBJECT_ALIASES: Array<[RegExp, QbSubject]> = [
  [/^(physics|phy|phys)$/, "physics"],
  [/^(chemistry|chem)$/, "chemistry"],
  [/^(mathematics|maths|math|mathematic)$/, "maths"],
  [/^botany$/, "botany"],
  [/^zoology$/, "zoology"],
  [/^(biology|bio)$/, "biology"],
  [/^(mentalability|mat|mentalabilitytest|reasoning)$/, "mental_ability"],
];

/** Printed / typed subject names (English or Hindi) → subject code; null when unknown. */
export function subjectFromLabel(raw: string | null | undefined): QbSubject | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if ((IMPORT_SUBJECTS as readonly string[]).includes(lower)) return lower as QbSubject;
  if (/भौतिक/.test(trimmed)) return "physics";
  if (/रसायन/.test(trimmed)) return "chemistry";
  if (/गणित/.test(trimmed)) return "maths";
  if (/वनस्पति/.test(trimmed)) return "botany";
  if (/प्राणि/.test(trimmed)) return "zoology";
  if (/जीव/.test(trimmed)) return "biology";
  if (/मानसिक/.test(trimmed)) return "mental_ability";
  const key = lower.replace(/[^a-z]/g, "");
  for (const [pattern, subject] of SUBJECT_ALIASES) if (pattern.test(key)) return subject;
  return null;
}

/** Printed question number → its digits-and-letters form (`Q.12` → `12`, `12(a)` → `12a`); null when empty. */
export function normaliseQno(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^(?:q(?:uestion)?|प्रश्न)\s*(?:no\.?|number)?\s*[.:#-]?\s*/i, "")
    .replace(/[^0-9A-Za-z]/g, "")
    .replace(/^0+(?=\d)/, "")
    .toLowerCase();
  return cleaned ? cleaned.slice(0, 12) : null;
}

/** `Section A`, `SECTION - B`, `Part I` → `a`, `b`, `i`; anything else → a short slug; null when empty. */
export function sectionSlug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  const match = /^(?:section|part|sec\.?|खंड|भाग)\s*[-:.]?\s*([a-z0-9ivx]+)\b/i.exec(lower);
  if (match) return match[1].toLowerCase();
  const slug = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? slug.slice(0, 24) : null;
}

const LETTERS = "abcdef";

/** `A`, `(b)`, `c)`, `1`–`6` → 0-based option index (null when not a single option token). */
export function optionIndex(token: string, optionCount: number, optionRefs: readonly string[] = []): number | null {
  const raw = token.trim();
  if (!raw) return null;
  const refIndex = optionRefs.findIndex((ref) => ref.trim() === raw);
  if (refIndex >= 0) return refIndex;
  const bare = raw.replace(/^[(\[]|[)\].]$/g, "").trim().toLowerCase();
  if (bare.length === 1 && LETTERS.includes(bare)) {
    const index = LETTERS.indexOf(bare);
    return index < optionCount ? index : null;
  }
  if (/^[1-6]$/.test(bare)) {
    const index = Number(bare) - 1;
    return index < optionCount ? index : null;
  }
  return null;
}

const NUMBER = String.raw`[-−]?\d+(?:\.\d+)?|[-−]?\.\d+`;
const RANGE = new RegExp(String.raw`^(${NUMBER})\s*(?:-|–|—|to|TO|\.\.)\s*(${NUMBER})$`);

function toNumber(raw: string): number {
  return Number(raw.replace("−", "-"));
}

export type AnswerParse = { ok: true; answer: QbAnswer } | { ok: false; reason: "answer_empty" | "answer_invalid" | "answer_out_of_range" };

/**
 * Parses an answer for a question of `type`. Single: one option. Multiple: letters / options
 * separated by `,` `;` `/` spaces, or run together (`AC`); sorted and distinct. Numerical: a number
 * (`integer` when it is a whole number) or a range `low-high` (value = midpoint).
 */
export function parseAnswer(
  raw: string | null | undefined,
  question: { type: "single" | "multiple" | "numerical"; optionCount: number; optionRefs?: readonly string[] },
): AnswerParse {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, reason: "answer_empty" };
  if (question.type === "numerical") {
    const compact = text.replace(/\s+/g, " ");
    const range = RANGE.exec(compact);
    if (range) {
      const low = toNumber(range[1]);
      const high = toNumber(range[2]);
      if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return { ok: false, reason: "answer_invalid" };
      const value = Math.round(((low + high) / 2) * 1e6) / 1e6;
      return { ok: true, answer: { kind: "numerical", value, low, high, integer: false } };
    }
    if (!new RegExp(`^(${NUMBER})$`).test(compact)) return { ok: false, reason: "answer_invalid" };
    const value = toNumber(compact);
    if (!Number.isFinite(value)) return { ok: false, reason: "answer_invalid" };
    return { ok: true, answer: { kind: "numerical", value, integer: Number.isInteger(value) } };
  }
  const refs = question.optionRefs ?? [];
  let tokens = text.split(/[\s,;/&+]+/).filter(Boolean);
  if (tokens.length === 1 && /^[A-Fa-f]{2,6}$/.test(tokens[0]) && question.type === "multiple") tokens = tokens[0].split("");
  const indices: number[] = [];
  for (const token of tokens) {
    const index = optionIndex(token, question.optionCount, refs);
    if (index === null) {
      const looksLikeOption = /^[(\[]?[A-Fa-f1-6][)\].]?$/.test(token);
      return { ok: false, reason: looksLikeOption ? "answer_out_of_range" : "answer_invalid" };
    }
    if (!indices.includes(index)) indices.push(index);
  }
  if (indices.length === 0) return { ok: false, reason: "answer_empty" };
  if (question.type === "single") {
    if (indices.length !== 1) return { ok: false, reason: "answer_invalid" };
    return { ok: true, answer: { kind: "single", index: indices[0] } };
  }
  return { ok: true, answer: { kind: "multiple", indices: indices.sort((a, b) => a - b) } };
}

/** Two answers mean the same thing (ranges compare by bounds, numbers by value). */
export function sameAnswer(a: QbAnswer | null, b: QbAnswer | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "single" && b.kind === "single") return a.index === b.index;
  if (a.kind === "multiple" && b.kind === "multiple") {
    return a.indices.length === b.indices.length && a.indices.every((value, index) => value === b.indices[index]);
  }
  if (a.kind === "numerical" && b.kind === "numerical") {
    return a.value === b.value && (a.low ?? null) === (b.low ?? null) && (a.high ?? null) === (b.high ?? null);
  }
  return false;
}
