/**
 * Client-side types and helpers of the study planner UI (A4-PLANNER). Client-safe, no React.
 */
import { htmlLang, type Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { dayNumber, type DateKey } from "@/lib/planner/dates";
import type { ClientTopic, ExamId, PlanBlock, PlanDay, SubjectId } from "@/lib/planner/types";

export type PlannerMessages = Messages<"planner">;

/** Flashcard as sent to the browser: text in the page's language only. */
export interface ClientCard {
  id: string;
  subject: SubjectId;
  topics: string[];
  levels: ("senior" | "foundation")[];
  front: string;
  back: string;
}

/** Syllabus and cards for the page's language, prepared by the server page. */
export interface PlannerData {
  topics: Record<string, ClientTopic>;
  examTopics: Record<ExamId, string[]>;
  cards: ClientCard[];
  mockMinutes: Record<ExamId, number>;
}

export interface PlannerLinks {
  signIn: string;
  mockTests: string;
  /** Path of this page in the current locale (service-worker scope). */
  self: string;
}

const SENIOR_EXAMS: readonly ExamId[] = ["jee-main", "jee-advanced", "neet"];

/** Flashcards for an exam: its subjects only, at its level (mirrors `flashcardsForExam`). */
export function cardsForExam(data: PlannerData, exam: ExamId): ClientCard[] {
  const level = SENIOR_EXAMS.includes(exam) ? "senior" : "foundation";
  const subjects = new Set(data.examTopics[exam].map((id) => data.topics[id]?.subject));
  return data.cards.filter((card) => card.levels.includes(level) && subjects.has(card.subject));
}

export function topicsForExam(data: PlannerData, exam: ExamId): ClientTopic[] {
  return data.examTopics[exam].map((id) => data.topics[id]).filter((topic): topic is ClientTopic => !!topic);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Formats a date key in the page language. The key is a calendar date, so it is formatted in UTC. */
export function formatDate(key: DateKey, locale: Locale, options: Intl.DateTimeFormatOptions): string {
  const id = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatters.get(id);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(htmlLang[locale], { ...options, timeZone: "UTC" });
    formatters.set(id, formatter);
  }
  return formatter.format(new Date(dayNumber(key) * DAY_MS));
}

export const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
export const SHORT_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(htmlLang[locale]).format(value);
}

/** Readable title of a plan block: "Learn · Physics: Kinematics". */
export function blockTitle(block: PlanBlock, day: PlanDay, t: PlannerMessages, data: PlannerData, maxTopics = 3): string {
  const names = block.topicIds.map((id) => data.topics[id]?.name ?? id);
  const shown = names.slice(0, maxTopics).join(", ");
  const more = names.length > maxTopics ? ` ${format(t.blocks.more, { count: names.length - maxTopics })}` : "";
  const subject = block.subject ? t.subjects[block.subject] : null;
  const topics = shown ? `${shown}${more}` : "";
  switch (block.kind) {
    case "learn":
    case "practice": {
      const label = t.blocks[block.kind];
      return `${label} · ${subject ?? ""}${topics ? `: ${topics}` : ""}`;
    }
    case "revise":
      if (day.kind === "light") return topics ? `${t.blocks.light} — ${topics}` : t.blocks.light;
      if (!topics) return subject ? `${t.blocks.revise} · ${subject}: ${t.blocks.reviseNotes}` : t.blocks.reviseNotes;
      return `${t.blocks.revise} · ${subject ? `${subject}: ` : ""}${topics}`;
    case "spaced":
      return t.blocks.spaced;
    case "mock":
      return t.blocks.mock;
    case "analysis":
      return t.blocks.analysis;
    case "buffer":
      return t.blocks.buffer;
  }
}

/** Tailwind classes for a day kind (calendar cells and legend). */
export const DAY_KIND_STYLE: Record<PlanDay["kind"], string> = {
  study: "bg-blue-soft text-navy border-[#cfe0fb]",
  revision: "bg-[#efe9ff] text-[#45307d] border-[#ddd2fb]",
  mock: "bg-gold-soft text-[#6b4d00] border-[#f2dfa0]",
  buffer: "bg-success-soft text-[#0f5a3c] border-[#bfe5cf]",
  light: "bg-white text-muted border-line",
};

/** `HH:MM` for minutes after midnight. */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}
