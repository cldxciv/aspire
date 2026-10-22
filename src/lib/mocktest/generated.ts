import "server-only";

import { createHash } from "node:crypto";
import { getPredictorData } from "@/lib/predictor/data";
import type {
  QbAnswer,
  QbPaperView,
  QbPaperRef,
  QbQuestionType,
  QbReportKind,
  QbReviewItem,
  QbServedQuestion,
  QbSlot,
  QbSubject,
  QbTieBreakStep,
} from "@/lib/qb/types";
import { mocktestLog } from "./http";
import { tieBreakVector } from "./leaderboard";
import { projectPaperRankBand } from "./projection";
import { scoreForScorable, type ScorableTest, type ScoreOutcome, type SolutionRelease } from "./service";
import { listLinkedPaperIds, rescoreAttemptsForCorrection, type PaperAttemptLink } from "./store";
import type { Answer, ScorableQuestion, ScoreResult } from "./scoring";
import { maxDurationMs, minDurationMs, monthWindowFromId } from "./timing";
import type { BlueprintMockSummary, PaperQuestionMeta, PaperReadinessView, PaperResultMeta, ReviewItem, TestWindow } from "./types";

/**
 * Generated (exam-pattern) mock papers on the mock-test side (owner: QB-MOCKTEST-API;
 * docs/question-bank-plan.md §B9–B10). The question bank's services (src/lib/qb/**: papers,
 * windows, pool, stats, reports, figures, seeding) are reached ONLY through `QbPaperPort`, so:
 * - the routes in src/app/api/mocktest/** depend on one small, documented contract;
 * - tests inject a fake port (`setQbPaperPortForTests`);
 * - the default port (./qb-port.ts) is the single place that maps onto the bank's functions, and it
 *   calls `ensureQbSeeded()` before using them (plan §B14 SEED contract).
 *
 * What lives HERE (pure or mock-test logic): the ScorableTest adapter (key → scoring with partial
 * marking, ranges, the integer rule and dropped questions), release rules (practice: a quarter of
 * the paper time after it was made; ranked: when the month closes), the answer-lock hash, timing
 * plausibility for statistics, result metadata (source labels after submission only; ranked papers
 * only once the month closes), the statistics outcomes (no dropped questions, partial ≠ correct),
 * tie-break vectors and re-scoring of saved attempts after an answer-key correction. A served
 * question without a review item or key is a bank fault (`PaperKeyMissingError`): never free marks,
 * never a guessed source.
 */

// ---------------------------------------------------------------------------------------------
// The port

/** A paper the caller may use, with the server-only facts the mock-test side needs. */
export interface QbPaperRecord {
  /** The whitelisted runner payload (src/lib/qb/papers.ts): no answers, solutions, sources or staff fields. */
  view: QbPaperView;
  /** The signed-in student who made it (always set for ranked papers), else null. */
  userId: string | null;
  /** The pinned blueprint's official tie-break steps (ranked boards); null when none. */
  tieBreak: QbTieBreakStep[] | null;
  /** The real exam's question count for this paper's part (for "38 of 75 questions"). */
  fullQuestionCount: number;
}

export type QbCreatePaperResult =
  | { ok: true; papers: QbPaperRecord[]; token: string | null; resumed: boolean }
  | {
      ok: false;
      /** `signed_out`: a ranked paper without a student (the route checks the session first). */
      reason: "no_blueprint" | "thin" | "ranked_off" | "ranked_unavailable" | "language" | "signed_out";
      readiness?: PaperReadinessView["readiness"];
    };

export interface QbCreatePaperInput {
  slot: QbSlot;
  mode: "practice" | "ranked";
  /** The signed-in student, else null (guests and other roles: practice only). */
  userId: string | null;
  language: "en" | "hi";
  /** PwD compensatory time requested (practice only; the blueprint's `compensatoryMinutes`). */
  compensatory: boolean;
  /** A guest browser's last papers (validated by the bank), for the recent-seen exclusion. */
  recent: QbPaperRef[];
  /** `showPlaceholderContent()`: sample questions may be used (labelled). */
  placeholderMode: boolean;
  now: number;
}

export interface QbLockSummary {
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unattempted: number;
}

/** A slot's readiness as the bank reports it (the route adds whether the caller is a signed-in student). */
export type QbSlotReadiness = Omit<PaperReadinessView, "ranked"> & { ranked: Omit<PaperReadinessView["ranked"], "signedIn"> };

/**
 * One question's outcome for the bank's item statistics (`recordOutcome`). Built by
 * `paperStatsOutcomes`: dropped (bonus) questions are left out, and a partially correct
 * one-or-more-correct response counts as attempted but NOT correct, so calibration sees only
 * fully correct answers as correct.
 */
export interface PaperStatsOutcome {
  id: string;
  type: QbQuestionType;
  outcome: "correct" | "wrong" | "unattempted";
  timeSec: number;
}

export interface QbPaperPort {
  /** Readiness of a slot before anything is made (shown before the contact form; no paper is stored). */
  readiness(input: { slot: QbSlot; language: "en" | "hi"; placeholderMode: boolean; now: number }): Promise<QbSlotReadiness>;
  /** Makes a paper (or the JEE Advanced pair), or returns the student's ranked paper of the month. */
  createPaper(input: QbCreatePaperInput): Promise<QbCreatePaperResult>;
  /**
   * A paper the caller may open: `token` matches (constant time) or `userId` owns it. Null when
   * unknown, expired or not theirs. Ranked papers open with the owner's session only.
   */
  loadPaper(id: string, access: { token?: string | null; userId?: string | null }, now: number): Promise<QbPaperRecord | null>;
  /** Server-side only (saved attempts, verification, re-scoring): no access check. Null when gone. */
  loadPaperTrusted(id: string, now: number): Promise<QbPaperRecord | null>;
  /** Key, solution and public source label per question, in paper order, key corrections applied. Server-side only. */
  reviewItems(paper: QbPaperRecord, now: number): Promise<QbReviewItem[]>;
  /**
   * Answer lock (plan §B10.1): the first scoring stores the hash and summary ("first"); the same
   * hash again → "same"; a different one → "different" (the API answers 409); "not_found" when
   * the paper disappeared after it was loaded (the API answers 404).
   */
  lockAnswers(paperId: string, input: { answersHash: string; summary: QbLockSummary; now: number }): Promise<"first" | "same" | "different" | "not_found">;
  /**
   * Per-question statistics, recorded at most once per paper (compare-and-set in the bank, which
   * also re-checks the timing and leaves out dropped questions). True when recorded now.
   */
  recordOutcome(paper: QbPaperRecord, input: { questions: PaperStatsOutcome[]; score: number; maxScore: number; now: number }): Promise<boolean>;
  /**
   * "Report a problem" on a paper the caller already opened (`loadPaper` checked the access):
   * stores the question, its served version, the paper and the note — no account, no IP. False
   * when the paper or the question is gone (the API answers 404).
   */
  createReport(input: { paper: QbPaperRecord; questionId: string; kind: QbReportKind; note: string | null; now: number }): Promise<boolean>;
  /** A figure referenced by an approved version (version ≥ 1); null otherwise (drafts never leak). */
  figure(id: string): Promise<{ bytes: Uint8Array; mime: "image/png" | "image/jpeg" | "image/webp" } | null>;
  /** Which of `paperIds` contain the question (any version). Called with at most `RESCORE_CHUNK` ids at a time. */
  paperIdsContaining(questionId: string, paperIds: readonly string[]): Promise<string[]>;
  /** Monthly ranked board facts of a slot: windows that had a template, each with its max score. Null when ranked is off. */
  rankedBoard(slot: QbSlot, now: number): Promise<{ windows: { window: TestWindow; maxScore: number }[] } | null>;
  /** Published exam-pattern mocks for lists. */
  publicMocks(input: { placeholderMode: boolean; now: number }): Promise<BlueprintMockSummary[]>;
}

let override: QbPaperPort | null = null;

/** Tests only: replaces the question-bank port (null restores the default). */
export function setQbPaperPortForTests(port: QbPaperPort | null): void {
  override = port;
}

/** The port in use. The default implementation is loaded lazily (it pulls in the bank's services). */
export async function qbPaperPort(): Promise<QbPaperPort> {
  if (override) return override;
  const { defaultQbPaperPort } = await import("./qb-port");
  return defaultQbPaperPort;
}

/** `QB_GENERATION_ENABLED`: "0" / "false" / "off" switches paper generation off (default on). */
export function generationEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const value = env.QB_GENERATION_ENABLED?.trim().toLowerCase();
  return !(value === "0" || value === "false" || value === "off");
}

// ---------------------------------------------------------------------------------------------
// The ScorableTest adapter

/** A numerical key without a range in a "decimal2" section: correct within ±0.01 (plan §B9.3). */
export const DECIMAL2_TOLERANCE = 0.01;

/**
 * The bank returned no review item (or no key) for a question it served that is NOT dropped. This
 * is a bank fault, never a reason to give marks or to guess a source: scoring stops (the route
 * answers 500 with a fixed log code) and re-scoring skips the paper.
 */
export class PaperKeyMissingError extends Error {
  readonly code = "paper_key_missing";
  constructor() {
    super("A served question has no review item or key.");
    this.name = "PaperKeyMissingError";
  }
}

const TYPE_OF: Record<QbServedQuestion["type"], ScorableQuestion["type"]> = { single: "mcq", multiple: "multiple", numerical: "numerical" };

/** One served question + its key → a scorable question (subject = bank subject, topic = chapter). */
export function scorableFromServed(question: QbServedQuestion, review: QbReviewItem | undefined): ScorableQuestion<QbSubject> {
  if (!review) throw new PaperKeyMissingError();
  const answer: QbAnswer | null = review.answer ?? null;
  const base: ScorableQuestion<QbSubject> = {
    id: question.id,
    subject: question.subject,
    topic: question.chapterId,
    type: TYPE_OF[question.type],
    answer: 0,
    marking: { correct: question.marking.correct, wrong: question.marking.wrong, ...(question.marking.partial ? { partial: question.marking.partial } : {}) },
    ...(question.type === "numerical" ? {} : { optionCount: question.options.length }),
  };
  // A dropped question (an answer-key correction) gives everyone full marks.
  if (review.dropped) return { ...base, dropped: true };
  // A live question without a key is a bank fault: never full marks for everyone (ranked boards!).
  if (answer === null) throw new PaperKeyMissingError();
  if (answer.kind === "single") return { ...base, answer: answer.index };
  if (answer.kind === "multiple") {
    const options = [...new Set(answer.indices)].sort((a, b) => a - b);
    return { ...base, answer: options[0] ?? 0, correctOptions: options };
  }
  // The whole-number rule comes from the SECTION only (the JEE Main keypad section). `answer.integer`
  // merely says the key happens to be a whole number: in a "decimal2" (or format-less) section such
  // a key still takes decimal answers with the ±0.01 / range marking — it must never turn "3.99"
  // into a 422 (which would also tell the student the key is a whole number).
  const integer = question.answerFormat === "integer";
  const ranged = answer.low !== undefined || answer.high !== undefined;
  return {
    ...base,
    answer: answer.value,
    ...(ranged ? { low: answer.low ?? answer.value, high: answer.high ?? answer.value } : {}),
    tolerance: !ranged && question.answerFormat === "decimal2" ? DECIMAL2_TOLERANCE : 0,
    ...(integer ? { integer: true } : {}),
  };
}

/** The key as the fixed tests' review shape (+ the full typed key for generated papers). */
export function reviewItemFromQb(item: QbReviewItem): ReviewItem {
  const answer = item.answer;
  const correct = !answer ? 0 : answer.kind === "single" ? answer.index : answer.kind === "multiple" ? (answer.indices[0] ?? 0) : answer.value;
  return {
    id: item.id,
    correct,
    solution: item.solution,
    answer: item.dropped ? null : answer,
    dropped: item.dropped,
    solutionSource: item.solutionSource,
  };
}

function reviewById(review: readonly QbReviewItem[]): Map<string, QbReviewItem> {
  return new Map(review.map((item) => [item.id, item]));
}

/** Release of the key + solutions (plan §B10.2). */
export function paperRelease(view: Pick<QbPaperView, "kind" | "createdAt" | "durationMinutes" | "windowId">, now: number): SolutionRelease {
  let releaseAt: number;
  if (view.kind === "ranked") {
    const window = view.windowId ? monthWindowFromId(view.windowId) : null;
    // A ranked paper without a known window stays locked until its own time limit has passed.
    releaseAt = window ? Date.parse(window.endsAt) + maxDurationMs(view.durationMinutes) : view.createdAt + maxDurationMs(view.durationMinutes);
  } else {
    // Practice: a quarter of the paper's time (at least 5 minutes) after it was made: slows harvesting bots.
    releaseAt = view.createdAt + minDurationMs(view.durationMinutes);
  }
  return now >= releaseAt ? { released: true } : { released: false, releaseAt };
}

/**
 * Statistics are recorded only for plausible attempts: between the minimum time (a quarter of the
 * paper, at least 5 minutes) and the limit plus grace plus compensatory time, since the paper was made.
 */
export function plausiblePaperTiming(view: Pick<QbPaperView, "createdAt" | "durationMinutes" | "compensatoryMinutes">, now: number): boolean {
  const elapsed = now - view.createdAt;
  return elapsed >= minDurationMs(view.durationMinutes) && elapsed <= maxDurationMs(view.durationMinutes) + view.compensatoryMinutes * 60_000;
}

/** SHA-256 of the normalised answers (the answer lock compares hashes, never stores answers). */
export function answersHash(answers: readonly Answer[]): string {
  return createHash("sha256").update(JSON.stringify(answers)).digest("hex");
}

/** Options of the result metadata: `withholdSourcesUntil` blanks the per-question source labels. */
export interface PaperMetaOptions {
  /** Ranked papers before the month closes: no per-question source label (epoch ms of the release). */
  withholdSourcesUntil?: number | null;
}

const NO_LABEL = { en: "", hi: "" } as const;

/**
 * Per-question result metadata, released with the score (never during the test). Every question
 * keeps its REAL source from the bank: a missing review item is a bank fault (`PaperKeyMissingError`),
 * never an "Aspire bank" default. For a ranked paper whose month is still open the source LABEL is
 * withheld (an official label points at a public key while the board is live); the kind stays.
 */
export function paperQuestionMeta(view: QbPaperView, review: readonly QbReviewItem[], options: PaperMetaOptions = {}): PaperQuestionMeta[] {
  const byId = reviewById(review);
  const withhold = options.withholdSourcesUntil !== undefined && options.withholdSourcesUntil !== null;
  return view.questions.map((q, index) => {
    const item = byId.get(q.id);
    if (!item) throw new PaperKeyMissingError();
    return {
      id: q.id,
      index,
      sectionId: q.sectionId,
      sourceLabel: withhold ? { ...NO_LABEL } : item.sourceLabel,
      sourceKind: item.sourceKind,
      ...(withhold ? { sourceWithheld: true as const } : {}),
      adapted: item.adapted,
      difficulty: item.difficulty,
      chapterId: q.chapterId,
      type: q.type,
      marking: q.marking,
      correctedAt: item.correctedAt,
      dropped: item.dropped,
    };
  });
}

export function paperResultMeta(record: QbPaperRecord, review: readonly QbReviewItem[], options: PaperMetaOptions = {}): PaperResultMeta {
  const { view } = record;
  const questions = paperQuestionMeta(view, review, options);
  const corrections = questions.map((q) => q.correctedAt).filter((at): at is number => at !== null);
  const withheldUntil = options.withholdSourcesUntil ?? null;
  return {
    paperId: view.id,
    slot: view.slot,
    exam: view.exam,
    kind: view.kind,
    setId: view.setId,
    setPart: view.setPart,
    short: view.short,
    sample: view.sample,
    language: view.language,
    durationMinutes: view.durationMinutes,
    fullQuestionCount: record.fullQuestionCount,
    composition: view.composition,
    questions,
    correctedAt: corrections.length > 0 ? Math.max(...corrections) : null,
    expiresAt: view.expiresAt,
    ...(withheldUntil !== null ? { sourcesWithheldUntil: withheldUntil } : {}),
  };
}

/** The paper as a ScorableTest: key corrections applied (by the port), projection only for full, non-sample papers. */
export function paperScorableTest(record: QbPaperRecord, review: readonly QbReviewItem[]): ScorableTest<QbSubject> {
  const { view } = record;
  const byId = reviewById(review);
  return {
    id: view.testId,
    durationMinutes: view.durationMinutes + view.compensatoryMinutes,
    questions: view.questions.map((q) => scorableFromServed(q, byId.get(q.id))),
    review: view.questions.map((q) => byId.get(q.id)).filter((item): item is QbReviewItem => item !== undefined).map(reviewItemFromQb),
    sample: view.sample,
    project: (result) =>
      projectPaperRankBand(
        {
          exam: view.exam,
          short: view.short,
          sample: view.sample,
          officialShare: view.composition.officialShare,
          score: result.score,
          maxScore: result.maxScore,
        },
        getPredictorData(),
      ),
  };
}

/**
 * Scores a paper's answers (no lock, no statistics): the result carries `scored.paper`. Practice
 * papers show the source labels straight away (plan A7-14); a RANKED paper withholds them until its
 * key is released (the month has closed), like the key itself. Throws `PaperKeyMissingError` when
 * the bank's review list misses a served question.
 */
export function scorePaperAnswers(
  record: QbPaperRecord,
  review: readonly QbReviewItem[],
  rawAnswers: readonly unknown[],
  rawTimes: readonly number[] | undefined,
  release: SolutionRelease,
): ScoreOutcome<QbSubject> {
  const outcome = scoreForScorable(paperScorableTest(record, review), rawAnswers, rawTimes, release);
  if (!outcome.ok) return outcome;
  const withholdSourcesUntil = record.view.kind === "ranked" && !release.released ? release.releaseAt : null;
  return { ...outcome, scored: { ...outcome.scored, paper: paperResultMeta(record, review, { withholdSourcesUntil }) } };
}

/**
 * The per-question outcomes the bank's statistics may use: dropped (bonus) questions are left out
 * (their "outcome" says nothing about the item), and a partially correct one-or-more-correct
 * response counts as attempted but not correct (the bank's counters know three outcomes only).
 */
export function paperStatsOutcomes(view: Pick<QbPaperView, "questions">, result: Pick<ScoreResult<QbSubject>, "questions">): PaperStatsOutcome[] {
  const types = new Map(view.questions.map((q) => [q.id, q.type]));
  const out: PaperStatsOutcome[] = [];
  for (const q of result.questions) {
    const type = types.get(q.id);
    if (q.bonus || !type) continue;
    out.push({ id: q.id, type, outcome: q.partial ? "wrong" : q.outcome, timeSec: q.timeSec });
  }
  return out;
}

export function lockSummary(result: Pick<ScoreResult<string>, "score" | "maxScore" | "correct" | "wrong" | "unattempted">): QbLockSummary {
  return { score: result.score, maxScore: result.maxScore, correct: result.correct, wrong: result.wrong, unattempted: result.unattempted };
}

export type PaperSubmission =
  | { ok: true; outcome: Extract<ScoreOutcome<QbSubject>, { ok: true }>; lock: "first" | "same" }
  | { ok: false; reason: "validation"; fieldErrors: Record<string, string[]> }
  | { ok: false; reason: "paper_already_scored" }
  | { ok: false; reason: "paper_not_found" };

/**
 * Scores a submission and applies the answer lock; on the FIRST scoring of a plausibly timed
 * attempt it records the statistics (at most once: the bank compares-and-sets as well). Used by
 * /score (practice papers) and /attempts (practice and ranked papers).
 */
export async function submitPaper(
  port: QbPaperPort,
  record: QbPaperRecord,
  input: { answers: readonly unknown[]; timeSpentSec?: readonly number[]; release: SolutionRelease; now: number },
): Promise<PaperSubmission> {
  const review = await port.reviewItems(record, input.now);
  const outcome = scorePaperAnswers(record, review, input.answers, input.timeSpentSec, input.release);
  if (!outcome.ok) return { ok: false, reason: "validation", fieldErrors: outcome.fieldErrors };
  const lock = await port.lockAnswers(record.view.id, {
    answersHash: answersHash(outcome.answers),
    summary: lockSummary(outcome.scored.result),
    now: input.now,
  });
  if (lock === "different") return { ok: false, reason: "paper_already_scored" };
  if (lock === "not_found") return { ok: false, reason: "paper_not_found" };
  if (lock === "first" && plausiblePaperTiming(record.view, input.now)) {
    const { result } = outcome.scored;
    await port.recordOutcome(record, { questions: paperStatsOutcomes(record.view, result), score: result.score, maxScore: result.maxScore, now: input.now });
  }
  return { ok: true, outcome, lock };
}

/**
 * The tie-break vector of a ranked paper's result (null for practice papers or without steps).
 * Subject marks include a dropped question's full marks (everyone gets them), but a response to a
 * dropped question is neither right nor wrong: it never counts in a wrong ÷ correct ratio, so
 * answering it (with any option) cannot beat leaving it blank.
 */
export function paperTieBreak(record: QbPaperRecord, result: ScoreResult<QbSubject>): number[] | null {
  if (record.view.kind !== "ranked") return null;
  const counts = new Map<string, { correct: number; wrong: number }>();
  let correct = 0;
  let wrong = 0;
  for (const q of result.questions) {
    if (q.bonus || q.outcome === "unattempted") continue;
    const tally = counts.get(q.subject) ?? { correct: 0, wrong: 0 };
    if (q.outcome === "correct") {
      tally.correct += 1;
      correct += 1;
    } else {
      tally.wrong += 1;
      wrong += 1;
    }
    counts.set(q.subject, tally);
  }
  return tieBreakVector(record.tieBreak, {
    correct,
    wrong,
    subjects: result.subjects.map((s) => ({ subject: s.subject, score: s.score, ...(counts.get(s.subject) ?? { correct: 0, wrong: 0 }) })),
  });
}

// ---------------------------------------------------------------------------------------------
// Answer-key corrections (plan §B10.4)

/** How many linked paper ids one `paperIdsContaining` call (and one SQL `IN` list) carries at most. */
export const RESCORE_CHUNK = 400;

/**
 * Re-scores every SAVED attempt whose paper contains `questionId`, after a key correction was
 * recorded (call it from the correction service or route, after the correction is stored). Each
 * attempt is re-scored from its stored answers against the paper's key with corrections applied;
 * `mocktest_attempts` (score, correct, wrong, unattempted) and the tie-break vector are updated in
 * one transaction, so boards and verification pages follow. Practice results that were never saved
 * re-score on their next view. Returns the number of attempts whose stored figures changed.
 */
export async function rescoreAttemptsAfterCorrection(questionId: string, now: number = Date.now()): Promise<{ attempts: number }> {
  const port = await qbPaperPort();
  const linked = listLinkedPaperIds();
  if (linked.length === 0) return { attempts: 0 };
  // Bounded calls: the bank is asked about at most RESCORE_CHUNK linked papers at a time.
  const affected = new Set<string>();
  for (let i = 0; i < linked.length; i += RESCORE_CHUNK) {
    for (const id of await port.paperIdsContaining(questionId, linked.slice(i, i + RESCORE_CHUNK))) affected.add(id);
  }
  if (affected.size === 0) return { attempts: 0 };
  const keyed = new Map<string, { record: QbPaperRecord; review: QbReviewItem[] }>();
  for (const paperId of affected) {
    const record = await port.loadPaperTrusted(paperId, now);
    if (!record) continue;
    const review = await port.reviewItems(record, now);
    const byId = reviewById(review);
    // A paper whose review list misses a served question cannot be re-scored honestly: skip it, loudly.
    if (record.view.questions.some((q) => !byId.has(q.id) || (!byId.get(q.id)!.dropped && byId.get(q.id)!.answer === null))) {
      mocktestLog({ route: "rescore", outcome: "error", reason: "paper_key_missing" });
      continue;
    }
    keyed.set(paperId, { record, review });
  }
  let invalid = 0;
  const { updated } = rescoreAttemptsForCorrection({
    paperIds: [...keyed.keys()],
    now,
    rescore: (link: PaperAttemptLink) => {
      const entry = keyed.get(link.paperId);
      if (!entry) return null;
      const outcome = scorePaperAnswers(entry.record, entry.review, link.answers, link.timeSpentSec, { released: true });
      if (!outcome.ok) {
        invalid += 1;
        return null;
      }
      return { result: outcome.scored.result, tiebreak: paperTieBreak(entry.record, outcome.scored.result) };
    },
  });
  // Stored answers were valid when saved; a refusal now is a bug worth seeing (never silent).
  if (invalid > 0) mocktestLog({ route: "rescore", outcome: "error", reason: "stored_answers_invalid" });
  return { attempts: updated };
}


// ---------------------------------------------------------------------------------------------
// Lists

/**
 * Published exam-pattern mocks with their readiness (DYNAMIC callers only: route handlers, or page
 * parts under `<Suspense>` after `await connection()`, because the bank is seeded and read here).
 * Static parts use `QB_SLOT_META` / `mockTestTitle` instead.
 */
export async function getPublicBlueprintMocks(input: { placeholderMode: boolean; now?: number }): Promise<BlueprintMockSummary[]> {
  if (!generationEnabled()) return [];
  const port = await qbPaperPort();
  return port.publicMocks({ placeholderMode: input.placeholderMode, now: input.now ?? Date.now() });
}
