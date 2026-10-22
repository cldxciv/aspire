import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { gateAtStart } from "@/lib/mocktest/lead-gate";
import { isAnswered, MAX_NUMERIC_LENGTH, parseNumeric, type Answer, type QuestionResult, type ScoreResult, type TopicResult } from "@/lib/mocktest/scoring";
import type { PaperReadinessView, PaperResultMeta } from "@/lib/mocktest/types";
import type {
  Bilingual,
  QbAnswer,
  QbDifficulty,
  QbPaperComposition,
  QbPaperView,
  QbServedPassage,
  QbServedQuestion,
  QbServedSection,
  QbSubject,
} from "@/lib/qb/types";

/**
 * Exam-pattern mocks on the student side (QB-MOCKTEST-UI, docs/question-bank-plan.md §B9–B12, §B14
 * package 5): pure, client-safe helpers behind the exam page, the generated-paper runner and its
 * result page. No I/O and no React, so every rule here is unit-tested (paper-ui.test.ts).
 */

// ---------------------------------------------------------------------------------------------
// Numerical answers: JEE Main Section B (signed whole numbers on the on-screen keypad) and the
// JEE (Advanced) numerical sections (a value truncated or rounded off to two decimal places).

export type NumericFormat = "integer" | "decimal2";
export type NumericIssue = "format" | "integer" | "decimals" | "length";

/** Typed text in a form the server accepts: the typographic minus becomes "-", spaces and a leading "+" go. */
export function normaliseNumericText(raw: string): string {
  let text = raw.replace(/[−‒–﹣－]/g, "-").replace(/\s+/g, "");
  if (text.startsWith("+")) text = text.slice(1);
  return text;
}

/**
 * Characters an answer box keeps while typing (anything else is dropped as it is typed). A decimal
 * point typed into a whole-number box is KEPT, so the box can say why the answer is not accepted.
 */
export function filterNumericTyping(raw: string): string {
  return raw
    .replace(/[−‒–﹣－]/g, "-")
    .replace(/[^0-9.-]/g, "")
    .slice(0, MAX_NUMERIC_LENGTH);
}

/**
 * Why a typed answer cannot be sent, or null when it can (an empty box is "not answered", never an
 * issue). Whole-number boxes take signed integers only; two-decimal boxes at most two decimals —
 * never rounded silently, because the student must truncate or round as the official instructions say.
 */
export function numericInputIssue(raw: string, format: NumericFormat): NumericIssue | null {
  const text = normaliseNumericText(raw);
  // Empty is "not answered"; a lone sign or point is a number still being typed (never sent).
  if (text === "" || text === "-" || text === "." || text === "-.") return null;
  if (text.length > MAX_NUMERIC_LENGTH) return "length";
  const value = parseNumeric(text);
  if (value === null) return "format";
  if (format === "integer") return /^-?\d+$/.test(text) ? null : "integer";
  const decimals = text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
  return decimals > 2 ? "decimals" : null;
}

/** The answer to store: the normalised text when it can be sent, else null (not answered). */
export function numericAnswerValue(raw: string, format: NumericFormat): string | null {
  const text = normaliseNumericText(raw);
  return numericInputIssue(text, format) === null && parseNumeric(text) !== null ? text : null;
}

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "-" | "." | "backspace" | "clear";

const DIGITS: KeypadKey[] = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"];

/** Keys of the on-screen keypad, in screen order (no decimal point for whole-number answers). */
export function keypadKeys(format: NumericFormat): KeypadKey[] {
  return [...DIGITS, ...(format === "decimal2" ? (["."] as KeypadKey[]) : []), "-", "backspace", "clear"];
}

/**
 * One key press on the on-screen keypad: digits append (a lone "0" is replaced), "-" toggles the
 * sign, "." adds one decimal point (two-decimal answers only; "0." when empty), "backspace" removes
 * the last character, "clear" empties. Never longer than the server's limit; a third decimal is ignored.
 */
export function applyKeypadKey(value: string, key: KeypadKey, format: NumericFormat): string {
  const current = normaliseNumericText(value);
  if (key === "clear") return "";
  if (key === "backspace") return current.slice(0, -1) === "-" ? "" : current.slice(0, -1);
  if (key === "-") {
    if (current.startsWith("-")) return current.slice(1);
    return current.length < MAX_NUMERIC_LENGTH ? `-${current}` : current;
  }
  if (current.length >= MAX_NUMERIC_LENGTH) return current;
  const sign = current.startsWith("-") ? "-" : "";
  const body = sign ? current.slice(1) : current;
  if (key === ".") {
    if (format !== "decimal2" || body.includes(".")) return current;
    return `${sign}${body === "" ? "0" : body}.`;
  }
  if (body.includes(".") && body.length - body.indexOf(".") - 1 >= 2) return current;
  if (body === "0") return `${sign}${key}`;
  return `${sign}${body}${key}`;
}

// ---------------------------------------------------------------------------------------------
// One-or-more-correct answers (JEE Advanced Section 2): checkboxes → sorted, distinct indices.

export function toggleOption(answer: Answer | undefined, option: number): number[] | null {
  const chosen = new Set(Array.isArray(answer) ? answer : typeof answer === "number" ? [answer] : []);
  if (chosen.has(option)) chosen.delete(option);
  else chosen.add(option);
  const list = [...chosen].filter((i) => Number.isInteger(i) && i >= 0).sort((a, b) => a - b);
  return list.length > 0 ? list : null;
}

export function optionChosen(answer: Answer | undefined, option: number): boolean {
  return Array.isArray(answer) ? answer.includes(option) : answer === option;
}

// ---------------------------------------------------------------------------------------------
// The clock: the server decides when a paper ends.

/** Device clocks closer to the server than this are trusted as they are (the Date header has 1 s resolution). */
export const CLOCK_SKEW_THRESHOLD_MS = 30_000;

/**
 * How far the server's clock is ahead of this device (ms; negative when behind), from the HTTP `Date`
 * header of an answer received between `sentAt` and `receivedAt` (device clock). 0 when unknown or
 * within the threshold, so a normal device keeps its own (finer) clock.
 */
export function serverClockOffset(dateHeader: string | null | undefined, sentAt: number, receivedAt: number): number {
  if (!dateHeader) return 0;
  const server = Date.parse(dateHeader);
  if (!Number.isFinite(server)) return 0;
  const offset = server - Math.round((sentAt + receivedAt) / 2);
  return Math.abs(offset) < CLOCK_SKEW_THRESHOLD_MS ? 0 : offset;
}

/** The parts of a paper's timing the runner needs (all server facts). */
export interface PaperTiming {
  createdAt: number;
  durationMinutes: number;
  compensatoryMinutes: number;
}

/** The break allowed between the parts of a set (JEE Advanced Paper 1 → Paper 2), as on the server. */
export const PART_BREAK_MS = 60 * 60 * 1000;

export function paperLimitMs(part: Pick<PaperTiming, "durationMinutes" | "compensatoryMinutes">): number {
  return (Math.max(0, part.durationMinutes) + Math.max(0, part.compensatoryMinutes)) * 60_000;
}

/**
 * When a part must be submitted, in SERVER time. A paper (or Paper 1 of a set) ends its own time
 * after the server made it — a reload, a closed tab or a wrong device clock never adds time. A later
 * part of a set starts when the student starts it, but never ends later than the server allows: the
 * earlier parts' time plus a one-hour break each, then its own time.
 */
export function paperDeadline(part: PaperTiming, options: { startedAt: number; earlier?: readonly PaperTiming[] }): number {
  const earlier = options.earlier ?? [];
  const latest = paperLatestEnd(part, earlier);
  if (earlier.length === 0) return latest;
  return Math.min(options.startedAt + paperLimitMs(part), latest);
}

/**
 * The latest moment a part may end, in SERVER time, from server facts only: a paper (or Paper 1)
 * its own time after it was made; a later part of a set the earlier parts' time plus a one-hour
 * break each, then its own time.
 */
export function paperLatestEnd(part: PaperTiming, earlier: readonly PaperTiming[] = []): number {
  return part.createdAt + earlier.reduce((sum, p) => sum + paperLimitMs(p) + PART_BREAK_MS, 0) + paperLimitMs(part);
}

/** Time warnings for a long paper (minutes left), announced once each as they are crossed. */
export const PAPER_WARNING_MINUTES: readonly number[] = [30, 15, 5, 1];

/** The warning crossed between two readings of the time left (the smallest one when several were crossed at once). */
export function paperTimeWarning(previousMs: number, currentMs: number): number | null {
  let crossed: number | null = null;
  for (const minutes of PAPER_WARNING_MINUTES) {
    const at = minutes * 60_000;
    if (previousMs > at && currentMs <= at && currentMs > 0) crossed = minutes;
  }
  return crossed;
}

// ---------------------------------------------------------------------------------------------
// Readiness: what the bank can serve for an exam right now (honest wording on the list and exam pages).

export type ExamStatus =
  | { kind: "off" }
  | { kind: "unpublished" }
  | { kind: "full"; questions: number; minutes: number }
  | { kind: "short"; questions: number; full: number; minutes: number }
  | { kind: "thin"; have: number; need: number };

function round5(minutes: number): number {
  return Math.round(minutes / 5) * 5;
}

/** A shorter set's time, as the generator works it out: the full time × the share served, to 5 minutes, at least 10. */
export function estimatedShortMinutes(fullMinutes: number, ratio: number): number {
  return Math.max(10, round5(fullMinutes * Math.max(0, Math.min(1, ratio))));
}

type ReadinessFacts = Pick<PaperReadinessView, "available" | "reason" | "readiness" | "full" | "composition">;

/** Full, shorter (with its size), thin (with what the bank has) or not available — for the language asked. */
export function examStatus(view: ReadinessFacts): ExamStatus {
  if (!view.available) return view.reason === "disabled" ? { kind: "off" } : { kind: "unpublished" };
  const readiness = view.readiness;
  const full = view.full;
  if (!readiness || !full) return { kind: "unpublished" };
  if (readiness.level === "full") return { kind: "full", questions: full.questionCount, minutes: full.durationMinutes };
  if (readiness.level === "short") {
    const ratio = view.composition?.ratio ?? (readiness.full > 0 ? readiness.servable / readiness.full : 0);
    return { kind: "short", questions: readiness.servable, full: readiness.full, minutes: estimatedShortMinutes(full.durationMinutes, ratio) };
  }
  return { kind: "thin", have: readiness.servable, need: readiness.full };
}

/** One line in words for a status (the badge says the same in short). `placeholder`: a pattern Aspire has not confirmed (BOH). */
export function examStatusText(status: ExamStatus, placeholder: boolean, t: Messages<"mocktest">["paper"]): string {
  switch (status.kind) {
    case "full":
      return format(t.statusText.full, { questions: status.questions, minutes: status.minutes });
    case "short":
      return format(t.statusText.short, { questions: status.questions, full: status.full, minutes: status.minutes });
    case "thin":
      return format(t.statusText.thin, { have: status.have, need: status.need });
    case "off":
      return t.statusText.off;
    case "unpublished":
      return placeholder ? t.statusText.placeholder : t.statusText.unpublished;
  }
}

/** The paper's expected length in minutes before it is made (null when nothing can be made). */
export function expectedMinutes(status: ExamStatus): number | null {
  if (status.kind === "full" || status.kind === "short") return status.minutes;
  return null;
}

/**
 * The contact form appears before papers of 60 minutes or more (docs/lead-gate-plan.md §8.4, plan
 * §B10.6), judged on the expected length because the paper does not exist yet. Unknown → ask.
 */
export function asksContactBeforePaper(status: ExamStatus): boolean {
  const minutes = expectedMinutes(status);
  return minutes === null ? true : gateAtStart(minutes);
}

/** Languages a student may choose for a paper now (a language the bank is thin in is not offered). */
export function startableLanguages(view: Pick<PaperReadinessView, "available" | "languages" | "readiness">): ("en" | "hi")[] {
  if (!view.available || !view.readiness) return [];
  const levels = view.readiness.byLanguage;
  return view.languages.filter((lang) => levels[lang] !== "thin");
}

export interface StartControls {
  /** The practice form (language, options, start): some language can start a paper now. */
  practice: boolean;
  /** "Start this month's ranked paper": open to this signed-in student this month. */
  ranked: boolean;
  /** Where "I have read the instructions" goes: with the practice form, else with the ranked start. */
  agreeIn: "practice" | "ranked" | null;
}

/**
 * Which start controls the exam page shows. Practice and ranked readiness are separate (this
 * month's ranked paper reserves questions, so practice can be thin while ranked is open), and the
 * acknowledgement is never missing while any start button is shown.
 */
export function startControls(view: Pick<PaperReadinessView, "available" | "languages" | "readiness" | "ranked"> | null): StartControls {
  const practice = view !== null && startableLanguages(view).length > 0;
  const ranked = view !== null && view.available && view.ranked.mode === "monthly" && view.ranked.signedIn && view.ranked.available;
  return { practice, ranked, agreeIn: practice ? "practice" : ranked ? "ranked" : null };
}

// ---------------------------------------------------------------------------------------------
// Composition: what a paper is made of, shown before starting (never per question during the test).

export interface CompositionSummary {
  total: number;
  official: number;
  aspire: number;
  sample: number;
  /** "2024–2026", "2025" or "" when there are no official questions. */
  years: string;
  difficulty: Record<QbDifficulty, number>;
  adapted: number;
  hindiShortfall: number;
}

/** "2024–2026" (en dash) for a span of years, a single year, or "". */
export function yearsText(years: readonly number[]): string {
  const valid = years.filter((y) => Number.isInteger(y));
  if (valid.length === 0) return "";
  const low = Math.min(...valid);
  const high = Math.max(...valid);
  return low === high ? String(low) : `${low}–${high}`;
}

export function compositionSummary(composition: QbPaperComposition): CompositionSummary {
  return {
    total: composition.total,
    official: composition.bySource.official ?? 0,
    aspire: composition.bySource.aspire ?? 0,
    sample: composition.bySource.sample ?? 0,
    years: yearsText(composition.officialYears),
    difficulty: {
      easy: composition.byDifficulty.easy ?? 0,
      medium: composition.byDifficulty.medium ?? 0,
      hard: composition.byDifficulty.hard ?? 0,
    },
    adapted: composition.adapted ?? 0,
    hindiShortfall: composition.hindiShortfall ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------
// The runner's copy of a paper: an explicit whitelist, so nothing but the question paper reaches the
// test screen even if a payload ever carried more (the server already sends no answers, solutions,
// sources, difficulty or staff fields; this is the second fence).

function passageCopy(passage: QbServedPassage | null): QbServedPassage | null {
  return passage ? { id: passage.id, stem: { en: passage.stem.en, hi: passage.stem.hi }, figures: passage.figures.map((f) => ({ ...f, alt: { ...f.alt } })) } : null;
}

export function runnerQuestion(q: QbServedQuestion): QbServedQuestion {
  return {
    id: q.id,
    index: q.index,
    sectionId: q.sectionId,
    subject: q.subject,
    chapterId: q.chapterId,
    type: q.type,
    format: q.format,
    answerFormat: q.answerFormat,
    stem: { en: q.stem.en, hi: q.stem.hi },
    options: q.options.map((o) => ({ en: o.en, hi: o.hi })),
    ...(q.unit ? { unit: { en: q.unit.en, hi: q.unit.hi } } : {}),
    figures: q.figures.filter((f) => f.slot !== "solution").map((f) => ({ ...f, alt: { ...f.alt } })),
    passage: passageCopy(q.passage),
    marking: { correct: q.marking.correct, wrong: q.marking.wrong, ...(q.marking.partial ? { partial: q.marking.partial } : {}) },
    hiAvailable: q.hiAvailable === true,
    hiMachine: q.hiMachine === true,
  };
}

export function runnerPaper(view: QbPaperView): QbPaperView {
  return {
    id: view.id,
    kind: view.kind,
    slot: view.slot,
    testId: view.testId,
    exam: view.exam,
    setId: view.setId,
    setPart: view.setPart,
    title: { en: view.title.en, hi: view.title.hi },
    partLabel: view.partLabel ? { en: view.partLabel.en, hi: view.partLabel.hi } : null,
    language: view.language,
    durationMinutes: view.durationMinutes,
    compensatoryMinutes: view.compensatoryMinutes,
    maxScore: view.maxScore,
    questionCount: view.questions.length,
    short: view.short,
    sample: view.sample,
    windowId: view.windowId,
    createdAt: view.createdAt,
    expiresAt: view.expiresAt,
    scored: view.scored,
    composition: view.composition,
    sections: view.sections.map((s) => ({ ...s, label: { ...s.label }, instructions: { ...s.instructions }, marking: { ...s.marking } })),
    questions: view.questions.map(runnerQuestion),
    patternNote: { en: view.patternNote.en, hi: view.patternNote.hi },
  };
}

/** The section a question index belongs to (the first section when out of range). */
export function sectionOf(sections: readonly QbServedSection[], index: number): QbServedSection | undefined {
  return sections.find((s) => index >= s.start && index < s.start + s.count) ?? sections[0];
}

/** Questions that share a paragraph: "Questions 5–6" (1-based, in paper order). */
export function passageRange(questions: readonly Pick<QbServedQuestion, "passage" | "index">[], passageId: string): { first: number; last: number } | null {
  const indices = questions.filter((q) => q.passage?.id === passageId).map((q) => q.index + 1);
  return indices.length === 0 ? null : { first: Math.min(...indices), last: Math.max(...indices) };
}

/** Which language a question shows in: the student's choice for it, else the paper's language (English when Hindi is missing). */
export function questionLanguage(question: Pick<QbServedQuestion, "hiAvailable" | "hiMachine">, paperLanguage: "en" | "hi", override?: "en" | "hi"): "en" | "hi" {
  const wanted = override ?? paperLanguage;
  if (wanted === "hi" && !question.hiAvailable && !(override === "hi" && question.hiMachine)) return "en";
  return wanted;
}

/**
 * A question's language in the result review, by the runner's rule: machine-drafted Hindi only when
 * the student picks Hindi in the review (`chosen`), and then `machine` so it is labelled.
 */
export function reviewLanguage(
  question: Pick<QbServedQuestion, "hiAvailable" | "hiMachine">,
  paperLanguage: "en" | "hi",
  chosen?: "en" | "hi",
): { lang: "en" | "hi"; machine: boolean } {
  const lang = questionLanguage(question, paperLanguage, chosen);
  return { lang, machine: lang === "hi" && !question.hiAvailable && question.hiMachine };
}

// ---------------------------------------------------------------------------------------------
// Results (after submission only).

export type DifficultyKey = QbDifficulty | "unlabelled";
export const DIFFICULTY_KEYS: readonly DifficultyKey[] = ["easy", "medium", "hard", "unlabelled"];

export interface AccuracyRow {
  difficulty: DifficultyKey;
  total: number;
  attempted: number;
  correct: number;
  wrong: number;
  /** correct ÷ attempted (a partially correct response counts as attempted, not correct); null when none attempted. */
  accuracy: number | null;
}

/** Accuracy by the paper's difficulty labels. Dropped (bonus) questions say nothing about the student and are left out. */
export function accuracyByDifficulty(
  result: Pick<ScoreResult<string>, "questions">,
  meta: Pick<PaperResultMeta, "questions">,
): AccuracyRow[] {
  const labels = new Map(meta.questions.map((q) => [q.id, q.difficulty]));
  const rows = new Map<DifficultyKey, AccuracyRow>(
    DIFFICULTY_KEYS.map((d) => [d, { difficulty: d, total: 0, attempted: 0, correct: 0, wrong: 0, accuracy: null }]),
  );
  for (const q of result.questions) {
    if (q.bonus) continue;
    const row = rows.get(labels.get(q.id) ?? "unlabelled")!;
    row.total += 1;
    if (q.outcome === "unattempted") continue;
    row.attempted += 1;
    if (q.outcome === "correct" && !q.partial) row.correct += 1;
    else if (q.outcome === "wrong") row.wrong += 1;
  }
  return [...rows.values()]
    .filter((row) => row.total > 0)
    .map((row) => ({ ...row, accuracy: row.attempted > 0 ? row.correct / row.attempted : null }));
}

export interface NegativeMarksRow<S extends string = QbSubject> {
  subject: S;
  /** Marks lost to negative marking (a positive number). */
  lost: number;
  wrong: number;
}

/** Marks lost to negative marking, per subject in paper order (only subjects with a loss). */
export function negativeMarksBySubject<S extends string>(result: Pick<ScoreResult<S>, "questions">): NegativeMarksRow<S>[] {
  const order: S[] = [];
  const bySubject = new Map<S, NegativeMarksRow<S>>();
  for (const q of result.questions) {
    if (!bySubject.has(q.subject)) {
      order.push(q.subject);
      bySubject.set(q.subject, { subject: q.subject, lost: 0, wrong: 0 });
    }
    if (q.outcome === "wrong" && q.marks < 0) {
      const row = bySubject.get(q.subject)!;
      row.lost += -q.marks;
      row.wrong += 1;
    }
  }
  return order.map((s) => bySubject.get(s)!).filter((row) => row.lost > 0);
}

/** A chapter's strength is shown only when the paper had at least this many of its questions ("based on N questions"). */
export const STRENGTH_MIN_QUESTIONS = 3;

/** Chapters with enough questions to judge (weakest first), and how many chapters had too few. */
export function chapterStrengths<S extends string>(result: Pick<ScoreResult<S>, "topics">): { shown: TopicResult<S>[]; tooFew: number } {
  const order: Record<TopicResult<S>["level"], number> = { weak: 0, skipped: 1, developing: 2, strong: 3 };
  const shown = result.topics
    .filter((topic) => topic.total >= STRENGTH_MIN_QUESTIONS)
    .slice()
    .sort((a, b) => order[a.level] - order[b.level] || a.mastery - b.mastery || b.total - a.total);
  return { shown, tooFew: result.topics.length - shown.length };
}

export interface SectionRow {
  sectionId: string;
  label: { en: string; hi: string };
  total: number;
  attempted: number;
  correct: number;
  wrong: number;
  unattempted: number;
  score: number;
  maxScore: number;
  timeSec: number;
}

/** Section-wise marks, in paper order, from the served sections (positions) and the scored questions. */
export function sectionRows(sections: readonly QbServedSection[], result: Pick<ScoreResult<string>, "questions">): SectionRow[] {
  return sections.map((section) => {
    const own: QuestionResult<string>[] = result.questions.filter((q) => q.index >= section.start && q.index < section.start + section.count);
    const correct = own.filter((q) => q.outcome === "correct").length;
    const wrong = own.filter((q) => q.outcome === "wrong").length;
    return {
      sectionId: section.id,
      label: section.label,
      total: own.length,
      attempted: correct + wrong,
      correct,
      wrong,
      unattempted: own.length - correct - wrong,
      score: own.reduce((sum, q) => sum + q.marks, 0),
      maxScore: own.length * section.marking.correct,
      timeSec: own.reduce((sum, q) => sum + q.timeSec, 0),
    };
  });
}

/** The banners of a scored paper, in display order. */
export type PaperBanner = "sample" | "short" | "compensatory" | "adapted" | "corrected" | "officialShare";

/** A rank projection notes a paper that is mostly past-year questions (plan A7-12). */
export const OFFICIAL_SHARE_NOTE = 0.5;

export function paperBanners(input: {
  meta: Pick<PaperResultMeta, "sample" | "short" | "questions" | "correctedAt">;
  compensatoryMinutes: number;
  officialShare: number | null;
}): PaperBanner[] {
  const out: PaperBanner[] = [];
  if (input.meta.sample) out.push("sample");
  if (input.meta.short) out.push("short");
  if (input.compensatoryMinutes > 0) out.push("compensatory");
  if (input.meta.questions.some((q) => q.adapted)) out.push("adapted");
  if (input.meta.correctedAt !== null) out.push("corrected");
  if (input.officialShare !== null && input.officialShare > OFFICIAL_SHARE_NOTE) out.push("officialShare");
  return out;
}

/** A response as display text (option letters, the typed number with its unit); "" when not answered. */
export function paperAnswerText(
  question: Pick<QbServedQuestion, "type" | "unit">,
  answer: Answer | undefined,
  lang: "en" | "hi",
  letters: readonly string[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
): string {
  if (!isAnswered(answer)) return "";
  if (Array.isArray(answer)) return answer.map((i) => `(${letters[i] ?? i + 1})`).join(" ");
  if (question.type !== "numerical" && typeof answer === "number") return `(${letters[answer] ?? answer + 1})`;
  const unit = question.unit ? ` ${question.unit[lang]}` : "";
  return `${String(answer).replace(/^-/, "−")}${unit}`;
}

/**
 * The answer key as display text: "(B)", "(A) (C) (D)", "12 m", "2.3 to 2.35 m" (`range` = "{low} to
 * {high}"). A numerical key without its own unit takes the question's (`fallbackUnit`).
 */
export function keyText(
  answer: QbAnswer | null | undefined,
  lang: "en" | "hi",
  range: string,
  letters: readonly string[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
  fallbackUnit?: Bilingual,
): string {
  if (!answer) return "";
  if (answer.kind === "single") return `(${letters[answer.index] ?? answer.index + 1})`;
  if (answer.kind === "multiple") return answer.indices.map((i) => `(${letters[i] ?? i + 1})`).join(" ");
  const show = (value: number) => String(value).replace(/^-/, "−");
  const unitText = answer.unit ?? fallbackUnit;
  const unit = unitText ? ` ${unitText[lang] || unitText.en}` : "";
  const ranged = answer.low !== undefined || answer.high !== undefined;
  if (ranged) {
    const low = answer.low ?? answer.value;
    const high = answer.high ?? answer.value;
    if (low !== high) return `${range.replace("{low}", show(low)).replace("{high}", show(high))}${unit}`;
    return `${show(low)}${unit}`;
  }
  return `${show(answer.value)}${unit}`;
}

/** Is option `index` part of the key (single or one-or-more-correct)? */
export function keyHasOption(answer: QbAnswer | null | undefined, index: number): boolean {
  if (!answer) return false;
  if (answer.kind === "single") return answer.index === index;
  if (answer.kind === "multiple") return answer.indices.includes(index);
  return false;
}

/**
 * A chapter's name: the label the server page passed (the seeded NCERT-aligned chapters, which keep
 * every sample-test topic), else the id made readable ("chem-p-block" → "chem p block"). Staff-added
 * chapters without a passed label fall back to their id.
 */
export function chapterLabelOf(id: string, labels: Readonly<Record<string, Bilingual>>, lang: "en" | "hi"): string {
  const label = labels[id];
  if (label) return (lang === "hi" ? label.hi.trim() : "") || label.en;
  return id.replace(/[-_]+/g, " ").trim() || id;
}
