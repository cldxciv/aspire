import "server-only";

import type { DatabaseSync } from "node:sqlite";

import {
  discrimination,
  isNegativeDiscrimination,
  paperThird,
  scoreBucket,
  suggestDifficulty,
  thirdCutoffs,
  thresholdsFor,
  wilsonInterval,
} from "./calibration-math";
import { qbCan } from "./access";
import { qbDb } from "./db";
import { rewritePoolFor } from "./pool";
import { addEvent, getQuestionRecord, setFlag, writeExamRow } from "./repo/questions";
import { conflict, forbidden, notFound, ok, type QbResult } from "./result";
import { bumpBankRevision, calibrationThresholds } from "./settings";
import type { QbDifficulty, QbExam, QbItemStats, QbQuestionType, QbViewer } from "./types";

/**
 * Item statistics and calibration (owner: QB-CORE-B; §B11). Aggregates only: no per-student rows.
 * Statistics only ever SUGGEST a difficulty; a reviewer accepts (pool rewritten) or dismisses.
 */

/** "partial": a one-or-more-correct answer with only correct options (attempted, not fully correct). */
export type QbOutcome = "correct" | "partial" | "wrong" | "unattempted";

export interface PaperOutcomeInput {
  exam: QbExam;
  slot: string;
  /** One entry per served question: its id, type and outcome (dropped questions are skipped by the caller or counted as given). */
  questions: { id: string; type: QbQuestionType; outcome: QbOutcome; timeSec?: number }[];
  score: number;
  maxScore: number;
  now: number;
}

/** Exposure counters (a question placed in a paper), per exam. */
export function addExposures(db: DatabaseSync, exam: QbExam, questionIds: readonly string[]): void {
  const stmt = db.prepare(
    `INSERT INTO qb_item_stats (question_id, exam, exposures) VALUES (?, ?, 1)
     ON CONFLICT (question_id, exam) DO UPDATE SET exposures = exposures + 1`,
  );
  for (const id of questionIds) stmt.run(id, exam);
}

/**
 * Adds one scored paper to the per-question counters, the slot's score histogram and (once the
 * histogram holds 30 papers) the top / bottom third counters; then refreshes suggestions and the
 * negative-discrimination flag. The caller guarantees "once per paper" (compare-and-set on the paper).
 */
export function accumulateOutcome(db: DatabaseSync, input: PaperOutcomeInput): void {
  const bucket = scoreBucket(input.score, input.maxScore);
  const hist = db
    .prepare("SELECT bucket, n FROM qb_score_hist WHERE slot = ?")
    .all(input.slot)
    .map((r) => ({ bucket: Number(r.bucket), n: Number(r.n) }));
  const third = paperThird(bucket, thirdCutoffs(hist));
  const upsert = db.prepare(
    `INSERT INTO qb_item_stats (question_id, exam, scored_n, attempted_n, correct_n, wrong_n, omitted_n, time_sum_sec,
        top_n, top_correct, bottom_n, bottom_correct)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (question_id, exam) DO UPDATE SET scored_n = scored_n + 1, attempted_n = attempted_n + excluded.attempted_n,
       correct_n = correct_n + excluded.correct_n, wrong_n = wrong_n + excluded.wrong_n, omitted_n = omitted_n + excluded.omitted_n,
       time_sum_sec = time_sum_sec + excluded.time_sum_sec, top_n = top_n + excluded.top_n, top_correct = top_correct + excluded.top_correct,
       bottom_n = bottom_n + excluded.bottom_n, bottom_correct = bottom_correct + excluded.bottom_correct`,
  );
  for (const q of input.questions) {
    const attempted = q.outcome === "unattempted" ? 0 : 1;
    const correct = q.outcome === "correct" ? 1 : 0;
    upsert.run(
      q.id,
      input.exam,
      attempted,
      correct,
      q.outcome === "wrong" ? 1 : 0,
      attempted ? 0 : 1,
      Math.max(0, Math.round(q.timeSec ?? 0)),
      third === "top" ? 1 : 0,
      third === "top" ? correct : 0,
      third === "bottom" ? 1 : 0,
      third === "bottom" ? correct : 0,
    );
  }
  db.prepare(
    `INSERT INTO qb_score_hist (slot, bucket, n) VALUES (?, ?, 1) ON CONFLICT (slot, bucket) DO UPDATE SET n = n + 1`,
  ).run(input.slot, bucket);
  for (const q of input.questions) refreshCalibration(db, q.id, input.exam, q.type, input.now);
}

interface StatsRow {
  attempted: number;
  correct: number;
  topN: number;
  topCorrect: number;
  bottomN: number;
  bottomCorrect: number;
  calibrated: QbDifficulty | null;
  state: QbItemStats["state"];
  flaggedAt: number | null;
}

function readStatsRow(db: DatabaseSync, id: string, exam: QbExam): StatsRow | null {
  const row = db.prepare("SELECT * FROM qb_item_stats WHERE question_id = ? AND exam = ?").get(id, exam);
  if (!row) return null;
  return {
    attempted: Number(row.attempted_n),
    correct: Number(row.correct_n),
    topN: Number(row.top_n),
    topCorrect: Number(row.top_correct),
    bottomN: Number(row.bottom_n),
    bottomCorrect: Number(row.bottom_correct),
    calibrated: (row.calibrated as QbDifficulty | null) ?? null,
    state: row.state as QbItemStats["state"],
    flaggedAt: row.discrimination_flagged_at === null ? null : Number(row.discrimination_flagged_at),
  };
}

/** Re-evaluates one (question, exam): a difficulty suggestion and the "possible wrong key" flag. */
export function refreshCalibration(db: DatabaseSync, id: string, exam: QbExam, type: QbQuestionType, now: number): void {
  const stats = readStatsRow(db, id, exam);
  if (!stats) return;
  const label = db.prepare("SELECT difficulty FROM qb_question_exams WHERE question_id = ? AND exam = ?").get(id, exam);
  const current = (label?.difficulty as QbDifficulty | null | undefined) ?? null;
  const suggestion = suggestDifficulty({
    attempted: stats.attempted,
    correct: stats.correct,
    current,
    thresholds: thresholdsFor(calibrationThresholds(db), exam, type),
  });
  if (suggestion && !(stats.state === "dismissed" && stats.calibrated === suggestion)) {
    if (stats.state !== "suggested" || stats.calibrated !== suggestion) {
      db.prepare("UPDATE qb_item_stats SET calibrated = ?, calibrated_at = ?, state = 'suggested' WHERE question_id = ? AND exam = ?").run(
        suggestion,
        now,
        id,
        exam,
      );
      addEvent(db, id, null, "calibration_suggested", { exam, suggested: suggestion, attempted: stats.attempted }, now);
    }
  } else if (!suggestion && stats.state === "suggested") {
    db.prepare("UPDATE qb_item_stats SET state = 'none' WHERE question_id = ? AND exam = ?").run(id, exam);
  }
  const d = discrimination(stats);
  if (isNegativeDiscrimination(d) && stats.flaggedAt === null) {
    db.prepare("UPDATE qb_item_stats SET discrimination_flagged_at = ? WHERE question_id = ? AND exam = ?").run(now, id, exam);
    setFlag(db, id, "negative_discrimination", true);
    addEvent(db, id, null, "negative_discrimination", { exam, d: Math.round((d ?? 0) * 1000) / 1000 }, now);
  }
}

/** Statistics per exam for the staff view. */
export function itemStatsFor(db: DatabaseSync, id: string): QbItemStats[] {
  return db
    .prepare("SELECT * FROM qb_item_stats WHERE question_id = ? ORDER BY exam")
    .all(id)
    .map((row) => {
      const attempted = Number(row.attempted_n);
      const correct = Number(row.correct_n);
      const scored = Number(row.scored_n);
      const omitted = Number(row.omitted_n);
      return {
        exam: row.exam as QbExam,
        exposures: Number(row.exposures),
        scored,
        attempted,
        correct,
        wrong: Number(row.wrong_n),
        omitted,
        pAttempted: attempted > 0 ? correct / attempted : null,
        omissionRate: scored > 0 ? omitted / scored : null,
        wilson: wilsonInterval(correct, attempted),
        discrimination: discrimination({
          topN: Number(row.top_n),
          topCorrect: Number(row.top_correct),
          bottomN: Number(row.bottom_n),
          bottomCorrect: Number(row.bottom_correct),
        }),
        calibrated: (row.calibrated as QbDifficulty | null) ?? null,
        state: row.state as QbItemStats["state"],
      };
    });
}

/** Accepts a suggestion: the difficulty becomes `calibrated` (recorded), the pool is rewritten. */
export function acceptCalibration(viewer: QbViewer, id: string, exam: QbExam, now: number, db: DatabaseSync = qbDb()): QbResult<true> {
  const record = getQuestionRecord(db, id);
  if (!record) return notFound("No such question.");
  if (!qbCan(viewer, "set_labels", record.subject)) return forbidden();
  const stats = readStatsRow(db, id, exam);
  if (!stats || stats.state !== "suggested" || !stats.calibrated) return conflict("stale", "There is no open suggestion for this exam.");
  writeExamRow(db, id, exam, { difficulty: stats.calibrated, difficultySource: "calibrated", difficultyBy: viewer.userId }, now);
  db.prepare("UPDATE qb_item_stats SET state = 'accepted' WHERE question_id = ? AND exam = ?").run(id, exam);
  addEvent(db, id, viewer.userId, "calibration_accepted", { exam, difficulty: stats.calibrated }, now);
  rewritePoolFor(db, id);
  bumpBankRevision(db, now);
  return ok(true);
}

export function dismissCalibration(viewer: QbViewer, id: string, exam: QbExam, now: number, db: DatabaseSync = qbDb()): QbResult<true> {
  const record = getQuestionRecord(db, id);
  if (!record) return notFound("No such question.");
  if (!qbCan(viewer, "set_labels", record.subject)) return forbidden();
  const stats = readStatsRow(db, id, exam);
  if (!stats || stats.state !== "suggested") return conflict("stale", "There is no open suggestion for this exam.");
  db.prepare("UPDATE qb_item_stats SET state = 'dismissed' WHERE question_id = ? AND exam = ?").run(id, exam);
  addEvent(db, id, viewer.userId, "calibration_dismissed", { exam, suggested: stats.calibrated }, now);
  return ok(true);
}
