import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { MockTestDefinition, TestWindow } from "@/content/mocktest/types";
import { getDb, withTransaction } from "@/lib/db/connection";
import { schema as MOCKTEST_SCHEMA } from "@/lib/db/features/mocktest";
import { computeBadges, longestStreakDays } from "./badges";
import { getVisibleMockTest } from "./catalog";
import { rankEntries, rankRankedEntries, SCHOOL_MIN_PARTICIPANTS, schoolKey } from "./leaderboard";
import { parseBlueprintTest } from "./resolve";
import { nicknameIdentityIssue, type ProfileInput } from "./schemas";
import type { Answer, ScoreResult } from "./scoring";
import {
  evaluateAttempt,
  isPracticeReason,
  maxDurationMs,
  monthWindowFromId,
  openWindowAt,
  type AttemptTiming,
  type StartCheck,
} from "./timing";
import type {
  AttemptsSummary,
  LeaderboardData,
  LeaderboardEntry,
  LeaderboardGroup,
  MocktestProfile,
  SavedAttempt,
  SavedAttemptSummary,
} from "./types";

/**
 * Mock-test storage for signed-in students (D-034; tables in src/lib/db/features/mocktest.ts).
 *
 * Phase 2 (PORTAL-INTEGRATION) entry points — call them only after your own record-level check
 * (student: own id; parent: a linked learner via canAccessStudentRecord):
 * - `listAttemptsForStudent(userId)` → newest-first summaries of the learner's saved attempts.
 * - `summariseAttempts(userId)` → totals, best score per test, streak and badges.
 *
 * QA-SEC-M6: leaderboards rank only server-timed attempts (`mocktest_starts` →
 * `mocktest_attempt_meta`), never the browser's clock; schools appear only in the aggregate table.
 */

type Row = Record<string, unknown>;

const prepared = new WeakSet<DatabaseSync>();

/**
 * The shared connection with this feature's tables. Feature schemas are applied when a connection
 * opens; a long-running process (the dev server) may hold one opened before a table was added, so
 * the idempotent schema is applied once more per connection here.
 */
function mocktestDb(): DatabaseSync {
  const db = getDb();
  if (!prepared.has(db)) {
    db.exec(MOCKTEST_SCHEMA);
    prepared.add(db);
  }
  return db;
}

const num = (value: unknown): number => Number(value ?? 0);
const str = (value: unknown): string => String(value ?? "");
const nullableStr = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const nullableNum = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function parseJsonArray<T>(text: unknown): T[] {
  try {
    const parsed: unknown = JSON.parse(str(text));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Public certificate verification id of a saved attempt (L7): not reversible to the attempt id. */
export function verifyIdFor(attemptId: string): string {
  return createHash("sha256").update(`mocktest-verify:${attemptId}`).digest("hex").slice(0, 16);
}

function toSummary(row: Row): SavedAttemptSummary {
  const reason = row.meta_reason ?? (row.meta_verify === null || row.meta_verify === undefined ? "no_start" : null);
  return {
    id: str(row.id),
    testId: str(row.test_id),
    windowId: nullableStr(row.window_id),
    score: num(row.score),
    maxScore: num(row.max_score),
    correct: num(row.correct),
    wrong: num(row.wrong),
    unattempted: num(row.unattempted),
    timeTakenSec: num(row.time_taken_sec),
    startedAt: num(row.started_at),
    submittedAt: num(row.submitted_at),
    leaderboard: num(row.meta_leaderboard) === 1,
    practiceReason: isPracticeReason(reason) ? reason : null,
    serverDurationSec: nullableNum(row.meta_duration),
    verifyId: nullableStr(row.meta_verify),
  };
}

function toAttempt(row: Row): SavedAttempt {
  return {
    ...toSummary(row),
    attemptId: str(row.client_attempt_id),
    answers: parseJsonArray<Answer>(row.answers),
    timeSpentSec: parseJsonArray<number>(row.time_spent),
  };
}

/** A saved attempt without its answers. */
export function summaryOf(attempt: SavedAttempt): SavedAttemptSummary {
  return {
    id: attempt.id,
    testId: attempt.testId,
    windowId: attempt.windowId,
    score: attempt.score,
    maxScore: attempt.maxScore,
    correct: attempt.correct,
    wrong: attempt.wrong,
    unattempted: attempt.unattempted,
    timeTakenSec: attempt.timeTakenSec,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    leaderboard: attempt.leaderboard,
    practiceReason: attempt.practiceReason,
    serverDurationSec: attempt.serverDurationSec,
    verifyId: attempt.verifyId,
    // Generated papers only (absent for fixed tests).
    ...(attempt.paperId !== undefined ? { paperId: attempt.paperId, rescoredAt: attempt.rescoredAt ?? null } : {}),
  };
}

const META_COLUMNS =
  "m.leaderboard AS meta_leaderboard, m.practice_reason AS meta_reason, m.duration_sec AS meta_duration, m.verify_id AS meta_verify";
const SUMMARY_COLUMNS = `a.id, a.test_id, a.window_id, a.score, a.max_score, a.correct, a.wrong, a.unattempted, a.time_taken_sec,
  a.started_at, a.submitted_at, ${META_COLUMNS}`;
const WITH_META = "mocktest_attempts a LEFT JOIN mocktest_attempt_meta m ON m.attempt_id = a.id";

// ---------------------------------------------------------------------------------------------
// Server-issued starts (QA-SEC-M6 M1)

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
/** Expired starts are kept this long (then a stale token is simply "unknown"). */
const START_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Records a server start and returns its opaque token (only the hash is stored). `userId` is the
 * signed-in student, or null for guests and other roles (their attempts can only be practice).
 */
export function createStart(
  input: { userId: string | null; test: Pick<MockTestDefinition, "id" | "durationMinutes">; windowId: string | null; now: number },
  db: DatabaseSync = mocktestDb(),
): { token: string; expiresAt: number } {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = input.now + maxDurationMs(input.test.durationMinutes);
  withTransaction(db, () => {
    db.prepare("DELETE FROM mocktest_starts WHERE expires_at < ?").run(input.now - START_RETENTION_MS);
    db.prepare(
      "INSERT INTO mocktest_starts (token_hash, user_id, test_id, window_id, started_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
    ).run(hashToken(token), input.userId, input.test.id, input.windowId, input.now, expiresAt);
  });
  return { token, expiresAt };
}

/**
 * Checks a start token for this student and test and, when it is theirs and unused, marks it used
 * (one saved attempt per start). An expired start is still "ok": the duration then says too slow.
 */
export function consumeStart(
  input: { token: string | null | undefined; userId: string; testId: string; now: number },
  db: DatabaseSync = mocktestDb(),
): StartCheck {
  if (!input.token) return { status: "missing" };
  const tokenHash = hashToken(input.token);
  const row = db.prepare("SELECT user_id, test_id, window_id, started_at, used_at FROM mocktest_starts WHERE token_hash = ?").get(tokenHash);
  if (!row) return { status: "unknown" };
  if (row.used_at !== null) return { status: "used" };
  if (str(row.test_id) !== input.testId) return { status: "other_test" };
  if (row.user_id === null) return { status: "guest" };
  if (str(row.user_id) !== input.userId) return { status: "other_user" };
  const claimed = db.prepare("UPDATE mocktest_starts SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(input.now, tokenHash);
  if (Number(claimed.changes) !== 1) return { status: "used" };
  return { status: "ok", startedAt: num(row.started_at), windowId: nullableStr(row.window_id) };
}

// ---------------------------------------------------------------------------------------------
// Attempts

export interface SaveAttemptInput {
  userId: string;
  testId: string;
  windowId: string | null;
  attemptId: string;
  answers: Answer[];
  timeSpentSec: number[];
  /** Only the tally is stored; a generated paper may carry question-bank subjects (`mental_ability`). */
  result: Pick<ScoreResult<string>, "score" | "maxScore" | "correct" | "wrong" | "unattempted">;
  timeTakenSec: number;
  startedAt: number;
  submittedAt: number;
  now: number;
  /** Server timing; without it the attempt is practice ("no_start"). */
  timing?: AttemptTiming;
}

function findOwnAttemptRow(db: DatabaseSync, where: string, ...values: string[]): Row | undefined {
  return db.prepare(`SELECT a.*, ${META_COLUMNS} FROM ${WITH_META} WHERE ${where}`).get(...values) as Row | undefined;
}

/** Stores a server-scored attempt. Saving the same client attempt id twice returns the first row. */
export function saveAttempt(input: SaveAttemptInput, db: DatabaseSync = mocktestDb()): { attempt: SavedAttempt; created: boolean } {
  return withTransaction(db, () => {
    const existing = findOwnAttemptRow(db, "a.user_id = ? AND a.client_attempt_id = ?", input.userId, input.attemptId);
    if (existing) return { attempt: toAttempt(existing), created: false };
    const timing: AttemptTiming = input.timing ?? {
      leaderboard: false,
      practiceReason: "no_start",
      serverStartedAt: null,
      serverSubmittedAt: input.now,
      durationSec: null,
      windowId: null,
    };
    const id = insertAttempt(db, input, timing);
    return { attempt: toAttempt(findOwnAttemptRow(db, "a.id = ?", id) as Row), created: true };
  });
}

function insertAttempt(db: DatabaseSync, input: SaveAttemptInput, timing: AttemptTiming): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO mocktest_attempts (id, user_id, test_id, window_id, client_attempt_id, answers, time_spent, score, max_score,
      correct, wrong, unattempted, time_taken_sec, started_at, submitted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.testId,
    input.windowId,
    input.attemptId,
    JSON.stringify(input.answers),
    JSON.stringify(input.timeSpentSec),
    input.result.score,
    input.result.maxScore,
    input.result.correct,
    input.result.wrong,
    input.result.unattempted,
    input.timeTakenSec,
    input.startedAt,
    input.submittedAt,
    input.now,
  );
  db.prepare(
    `INSERT INTO mocktest_attempt_meta (attempt_id, verify_id, leaderboard, practice_reason, server_started_at, server_submitted_at, duration_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    verifyIdFor(id),
    timing.leaderboard ? 1 : 0,
    timing.practiceReason,
    timing.serverStartedAt,
    timing.serverSubmittedAt,
    timing.durationSec,
  );
  return id;
}

/**
 * The attempt this student already saved at THIS test under this CLIENT attempt id, or null. POST
 * /api/mocktest/attempts answers a retried save from it without asking for contact details again
 * (the student's own saved data, as GET ?id= returns it), and never scores the retry's body: a
 * reused id with another test is not a retry, and other answers get the stored scoring back.
 */
export function findSavedClientAttempt(userId: string, testId: string, clientAttemptId: string, db: DatabaseSync = mocktestDb()): SavedAttempt | null {
  const row = db.prepare("SELECT id FROM mocktest_attempts WHERE user_id = ? AND test_id = ? AND client_attempt_id = ?").get(userId, testId, clientAttemptId);
  return row ? getAttemptForStudent(userId, str(row.id), db) : null;
}

/**
 * POST /api/mocktest/attempts: saves a server-scored attempt with server timing, atomically —
 * a retried save (same client attempt id) returns the first row and does not touch the start.
 * The start token is used up; the attempt is leaderboard-eligible only when `evaluateAttempt`
 * says so. A leaderboard attempt belongs to the window open at its server start; a practice
 * attempt to the window open now (if any).
 */
export function saveTimedAttempt(
  input: Omit<SaveAttemptInput, "windowId" | "timing" | "testId"> & {
    test: Pick<MockTestDefinition, "id" | "kind" | "durationMinutes" | "windows">;
    startToken: string | null | undefined;
  },
  db: DatabaseSync = mocktestDb(),
): { attempt: SavedAttempt; created: boolean } {
  return withTransaction(db, () => {
    const existing = findOwnAttemptRow(db, "a.user_id = ? AND a.client_attempt_id = ?", input.userId, input.attemptId);
    if (existing) return { attempt: toAttempt(existing), created: false };
    const start = consumeStart({ token: input.startToken, userId: input.userId, testId: input.test.id, now: input.now }, db);
    const timing = evaluateAttempt({ test: input.test, start, now: input.now });
    const windowId = timing.leaderboard ? timing.windowId : (openWindowAt(input.test.windows, input.now)?.id ?? null);
    const record: SaveAttemptInput = {
      userId: input.userId,
      testId: input.test.id,
      windowId,
      attemptId: input.attemptId,
      answers: input.answers,
      timeSpentSec: input.timeSpentSec,
      result: input.result,
      timeTakenSec: input.timeTakenSec,
      startedAt: input.startedAt,
      submittedAt: input.submittedAt,
      now: input.now,
    };
    const id = insertAttempt(db, record, timing);
    return { attempt: toAttempt(findOwnAttemptRow(db, "a.id = ?", id) as Row), created: true };
  });
}

// ---------------------------------------------------------------------------------------------
// Attempts at generated papers (docs/question-bank-plan.md §B9.4, §B10). The link to the paper lives
// in `qb_attempt_papers` (src/lib/db/features/qb.ts; feature schemas may not ALTER mocktest tables).
// Fixed-test code paths never touch qb_* tables.

/** The paper facts a save needs (from the bank's paper view). */
export interface SavedPaperFacts {
  id: string;
  kind: "practice" | "ranked";
  /** The student who made the paper (ranked: always), else null. */
  userId: string | null;
  windowId: string | null;
  /** Server time the paper was made: the server start of the attempt. */
  createdAt: number;
  durationMinutes: number;
}

export type SavePaperAttemptResult =
  | { ok: true; attempt: SavedAttempt; created: boolean }
  | { ok: false; reason: "paper_already_saved" };

/**
 * Server timing of a paper attempt: the paper's `created_at` is the server start (no start token).
 * A ranked paper counts on its month's board only when saved by its owner within the window rules
 * of `evaluateAttempt` (between a quarter of the time and the limit + grace); practice papers are
 * practice ("practice_test") with their server duration.
 */
export function paperAttemptTiming(paper: SavedPaperFacts, userId: string, now: number): AttemptTiming {
  if (paper.kind === "ranked") {
    const window = paper.windowId ? monthWindowFromId(paper.windowId) : null;
    const start: StartCheck =
      paper.userId === userId ? { status: "ok", startedAt: paper.createdAt, windowId: window ? window.id : null } : { status: "other_user" };
    return evaluateAttempt({ test: { kind: "weekly", durationMinutes: paper.durationMinutes, windows: window ? [window] : [] }, start, now });
  }
  return evaluateAttempt({
    test: { kind: "practice", durationMinutes: paper.durationMinutes },
    start: { status: "ok", startedAt: paper.createdAt, windowId: null },
    now,
  });
}

/**
 * Saves a server-scored attempt at a generated paper for the signed-in student, atomically: the
 * same client attempt id returns the first row (200); a paper can be saved ONCE (`paper_id UNIQUE`),
 * so another save of it is refused (`paper_already_saved`). The ranked test id
 * ("bp-<slot>-ranked") keeps practice attempts ("bp-<slot>") from ever blocking a board entry.
 */
export function savePaperAttempt(
  input: Omit<SaveAttemptInput, "windowId" | "timing"> & { paper: SavedPaperFacts; tiebreak: number[] | null },
  db: DatabaseSync = mocktestDb(),
): SavePaperAttemptResult {
  return withTransaction(db, () => {
    const existing = findOwnAttemptRow(db, "a.user_id = ? AND a.client_attempt_id = ?", input.userId, input.attemptId);
    if (existing) return { ok: true, attempt: withPaperLink(db, toAttempt(existing)), created: false };
    if (db.prepare("SELECT 1 FROM qb_attempt_papers WHERE paper_id = ?").get(input.paper.id)) return { ok: false, reason: "paper_already_saved" };
    const timing = paperAttemptTiming(input.paper, input.userId, input.now);
    const record: SaveAttemptInput = {
      userId: input.userId,
      testId: input.testId,
      windowId: input.paper.kind === "ranked" ? input.paper.windowId : null,
      attemptId: input.attemptId,
      answers: input.answers,
      timeSpentSec: input.timeSpentSec,
      result: input.result,
      timeTakenSec: input.timeTakenSec,
      startedAt: input.startedAt,
      submittedAt: input.submittedAt,
      now: input.now,
    };
    const id = insertAttempt(db, record, timing);
    db.prepare("INSERT INTO qb_attempt_papers (attempt_id, paper_id, tiebreak, rescored_at) VALUES (?, ?, ?, NULL)").run(
      id,
      input.paper.id,
      input.tiebreak ? JSON.stringify(input.tiebreak) : null,
    );
    return { ok: true, attempt: withPaperLink(db, toAttempt(findOwnAttemptRow(db, "a.id = ?", id) as Row)), created: true };
  });
}

/** The paper behind a saved attempt, with the last re-score after an answer-key correction. */
export function paperLinkForAttempt(attemptId: string, db: DatabaseSync = mocktestDb()): { paperId: string; rescoredAt: number | null } | null {
  const row = db.prepare("SELECT paper_id, rescored_at FROM qb_attempt_papers WHERE attempt_id = ?").get(attemptId);
  return row ? { paperId: str(row.paper_id), rescoredAt: nullableNum(row.rescored_at) } : null;
}

function withPaperLink(db: DatabaseSync, attempt: SavedAttempt): SavedAttempt {
  const link = paperLinkForAttempt(attempt.id, db);
  return link ? { ...attempt, paperId: link.paperId, rescoredAt: link.rescoredAt } : attempt;
}

/** Every paper that has a saved attempt (papers linked to an attempt are never pruned by the bank). */
export function listLinkedPaperIds(db: DatabaseSync = mocktestDb()): string[] {
  return db
    .prepare("SELECT DISTINCT paper_id FROM qb_attempt_papers ORDER BY paper_id")
    .all()
    .map((row) => str(row.paper_id));
}

/** A saved attempt at a paper, as re-scoring needs it. */
export interface PaperAttemptLink {
  attemptId: string;
  paperId: string;
  userId: string;
  testId: string;
  answers: Answer[];
  timeSpentSec: number[];
  score: number;
  correct: number;
  wrong: number;
  unattempted: number;
  tiebreak: number[] | null;
}

/** Bound parameters per `IN (…)` list: far below SQLite's limit whatever the number of papers. */
const LINK_CHUNK = 400;

/** Saved attempts at the given papers (answers included; server-side re-scoring only). */
export function listPaperAttemptLinks(paperIds?: readonly string[], db: DatabaseSync = mocktestDb()): PaperAttemptLink[] {
  if (paperIds && paperIds.length > LINK_CHUNK) {
    const out: PaperAttemptLink[] = [];
    for (let i = 0; i < paperIds.length; i += LINK_CHUNK) out.push(...listPaperAttemptLinks(paperIds.slice(i, i + LINK_CHUNK), db));
    return out;
  }
  const where = paperIds ? `WHERE ap.paper_id IN (${paperIds.map(() => "?").join(", ") || "NULL"})` : "";
  return db
    .prepare(
      `SELECT ap.attempt_id, ap.paper_id, ap.tiebreak, a.user_id, a.test_id, a.answers, a.time_spent, a.score, a.correct, a.wrong, a.unattempted
         FROM qb_attempt_papers ap JOIN mocktest_attempts a ON a.id = ap.attempt_id ${where}
        ORDER BY ap.paper_id, ap.attempt_id`,
    )
    .all(...(paperIds ?? []))
    .map((row) => ({
      attemptId: str(row.attempt_id),
      paperId: str(row.paper_id),
      userId: str(row.user_id),
      testId: str(row.test_id),
      answers: parseJsonArray<Answer>(row.answers),
      timeSpentSec: parseJsonArray<number>(row.time_spent),
      score: num(row.score),
      correct: num(row.correct),
      wrong: num(row.wrong),
      unattempted: num(row.unattempted),
      tiebreak: row.tiebreak === null || row.tiebreak === undefined ? null : parseJsonArray<number>(row.tiebreak),
    }));
}

/**
 * After an answer-key correction (plan §B10.4): re-scores the saved attempts at `paperIds` with
 * `rescore` (the paper's key with corrections applied) and, in ONE transaction, updates the stored
 * score, correct, wrong and unattempted plus the tie-break vector, and stamps `rescored_at` — so
 * boards, summaries and verification pages follow. Attempts whose figures did not change are left
 * alone. Returns how many attempts changed.
 */
export function rescoreAttemptsForCorrection(
  input: {
    paperIds: readonly string[];
    now: number;
    rescore: (link: PaperAttemptLink) => { result: Pick<ScoreResult<string>, "score" | "correct" | "wrong" | "unattempted">; tiebreak: number[] | null } | null;
  },
  db: DatabaseSync = mocktestDb(),
): { updated: number } {
  if (input.paperIds.length === 0) return { updated: 0 };
  return withTransaction(db, () => {
    let updated = 0;
    for (const link of listPaperAttemptLinks(input.paperIds, db)) {
      const next = input.rescore(link);
      if (!next) continue;
      const { result, tiebreak } = next;
      const same =
        result.score === link.score &&
        result.correct === link.correct &&
        result.wrong === link.wrong &&
        result.unattempted === link.unattempted &&
        JSON.stringify(tiebreak) === JSON.stringify(link.tiebreak);
      if (same) continue;
      db.prepare("UPDATE mocktest_attempts SET score = ?, correct = ?, wrong = ?, unattempted = ? WHERE id = ?").run(
        result.score,
        result.correct,
        result.wrong,
        result.unattempted,
        link.attemptId,
      );
      db.prepare("UPDATE qb_attempt_papers SET tiebreak = ?, rescored_at = ? WHERE attempt_id = ?").run(
        tiebreak ? JSON.stringify(tiebreak) : null,
        input.now,
        link.attemptId,
      );
      updated += 1;
    }
    return { updated };
  });
}

/** Newest-first summaries of a learner's saved attempts (no answers). */
export function listAttemptsForStudent(userId: string, db: DatabaseSync = mocktestDb()): SavedAttemptSummary[] {
  return db
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM ${WITH_META} WHERE a.user_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 200`)
    .all(userId)
    .map(toSummary);
}

/**
 * One saved attempt with answers, only when it belongs to `userId`. Attempts saved before server
 * timing existed get their (practice) meta row here, so every saved attempt has a verification id.
 */
export function getAttemptForStudent(userId: string, attemptId: string, db: DatabaseSync = mocktestDb()): SavedAttempt | null {
  const row = findOwnAttemptRow(db, "a.user_id = ? AND a.id = ?", userId, attemptId);
  if (!row) return null;
  if (row.meta_verify === null || row.meta_verify === undefined) {
    db.prepare(
      `INSERT OR IGNORE INTO mocktest_attempt_meta (attempt_id, verify_id, leaderboard, practice_reason, server_started_at, server_submitted_at, duration_sec)
       VALUES (?, ?, 0, 'no_start', NULL, ?, NULL)`,
    ).run(attemptId, verifyIdFor(attemptId), num(row.created_at));
    return toAttempt(findOwnAttemptRow(db, "a.user_id = ? AND a.id = ?", userId, attemptId) as Row);
  }
  return toAttempt(row);
}

/** Score as a share of its own maximum (a best-of comparison across papers of different lengths). */
function scoreShare(score: number, maxScore: number): number {
  return maxScore > 0 ? score / maxScore : Number.NEGATIVE_INFINITY;
}

/**
 * Totals, best score per test, longest streak and badges for one learner. The best attempt per test
 * is the highest share of its OWN maximum, and its score and maximum come from that same row: the
 * practice papers of one exam-pattern test ("bp-<slot>") can differ in length (a shorter set while
 * the bank is thin), so "70 / 300" from two different papers is never reported.
 */
export function summariseAttempts(userId: string, db: DatabaseSync = mocktestDb()): AttemptsSummary {
  const rows = db
    .prepare("SELECT test_id, window_id, score, max_score, correct, wrong, created_at FROM mocktest_attempts WHERE user_id = ? ORDER BY created_at, id")
    .all(userId);
  const best = new Map<string, { testId: string; bestScore: number; maxScore: number; attempts: number }>();
  let correct = 0;
  let attempted = 0;
  let last: number | null = null;
  const times: number[] = [];
  for (const row of rows) {
    const testId = str(row.test_id);
    const score = num(row.score);
    const maxScore = num(row.max_score);
    const entry = best.get(testId);
    if (!entry) best.set(testId, { testId, bestScore: score, maxScore, attempts: 1 });
    else {
      entry.attempts += 1;
      const share = scoreShare(score, maxScore);
      const bestShare = scoreShare(entry.bestScore, entry.maxScore);
      if (share > bestShare || (share === bestShare && score > entry.bestScore)) {
        entry.bestScore = score;
        entry.maxScore = maxScore;
      }
    }
    correct += num(row.correct);
    attempted += num(row.correct) + num(row.wrong);
    const created = num(row.created_at);
    times.push(created);
    last = last === null ? created : Math.max(last, created);
  }
  return {
    totalAttempts: rows.length,
    testsTaken: best.size,
    lastAttemptAt: last,
    averageAccuracy: attempted > 0 ? correct / attempted : null,
    bestByTest: [...best.values()],
    longestStreakDays: longestStreakDays(times),
    badges: computeBadges({ attemptTimes: times, leaderboardPositions: leaderboardPositions(userId, db) }),
  };
}

// ---------------------------------------------------------------------------------------------
// Profiles

function toProfile(row: Row): MocktestProfile {
  return {
    nickname: str(row.nickname),
    district: nullableStr(row.district),
    school: nullableStr(row.school),
    showSchool: num(row.show_school) === 1,
    leaderboardOptIn: num(row.leaderboard_opt_in) === 1,
  };
}

export function getProfile(userId: string, db: DatabaseSync = mocktestDb()): MocktestProfile | null {
  const row = db.prepare("SELECT * FROM mocktest_profiles WHERE user_id = ?").get(userId);
  return row ? toProfile(row) : null;
}

export function saveProfile(userId: string, input: ProfileInput, now: number, db: DatabaseSync = mocktestDb()): MocktestProfile {
  db.prepare(
    `INSERT INTO mocktest_profiles (user_id, nickname, district, school, show_school, leaderboard_opt_in, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET nickname = excluded.nickname, district = excluded.district, school = excluded.school,
       show_school = excluded.show_school, leaderboard_opt_in = excluded.leaderboard_opt_in, updated_at = excluded.updated_at`,
  ).run(userId, input.nickname, input.district, input.school, input.showSchool ? 1 : 0, input.leaderboardOptIn ? 1 : 0, now, now);
  return getProfile(userId, db) as MocktestProfile;
}

/**
 * Admin moderation (QA-SEC-M6 L6): deletes the student's leaderboard profile (nickname, district,
 * school, opt-in), which takes them off every board. Their attempts stay. The caller audits.
 */
export function deleteProfile(userId: string, db: DatabaseSync = mocktestDb()): { removed: boolean; wasOptedIn: boolean } {
  const profile = getProfile(userId, db);
  if (!profile) return { removed: false, wasOptedIn: false };
  db.prepare("DELETE FROM mocktest_profiles WHERE user_id = ?").run(userId);
  return { removed: true, wasOptedIn: profile.leaderboardOptIn };
}

// ---------------------------------------------------------------------------------------------
// Leaderboards (weekly tests only; opt-in profiles of enabled student accounts only)

interface BoardRow {
  /** Never sent: joins the tie-break vector of a ranked paper's attempt. */
  attemptId: string;
  userId: string;
  nickname: string;
  district: string | null;
  /** Only for the aggregate schools table — never sent with a student row. */
  school: string | null;
  score: number;
  /** Server-measured duration (seconds). */
  timeTakenSec: number;
  /** Server save time (epoch ms). */
  submittedAt: number;
}

/**
 * One window's board. A student's entry is the FIRST attempt of this test they saved since the
 * window opened — and only if it is a server-timed leaderboard attempt of this window. Saving any
 * attempt shows its solutions, so a later attempt in the same window never counts. Nicknames that
 * reveal the account's name or login id are left out (defence in depth for older profiles).
 */
function boardRows(testId: string, window: TestWindow, db: DatabaseSync): BoardRow[] {
  const rows = db
    .prepare(
      `SELECT a.user_id, a.score, a.window_id, a.created_at, a.id,
              m.leaderboard AS meta_leaderboard, m.duration_sec AS meta_duration, m.server_submitted_at AS meta_submitted,
              p.nickname, p.district, p.school, p.show_school, u.display_name, u.login_id
         FROM mocktest_attempts a
         JOIN mocktest_profiles p ON p.user_id = a.user_id AND p.leaderboard_opt_in = 1
         JOIN users u ON u.id = a.user_id AND u.disabled = 0 AND u.role = 'student'
         LEFT JOIN mocktest_attempt_meta m ON m.attempt_id = a.id
        WHERE a.test_id = ? AND a.created_at >= ?
        ORDER BY a.user_id, a.created_at, a.id`,
    )
    .all(testId, Date.parse(window.startsAt));
  const seen = new Set<string>();
  const out: BoardRow[] = [];
  for (const row of rows) {
    const userId = str(row.user_id);
    if (seen.has(userId)) continue;
    seen.add(userId);
    if (str(row.window_id) !== window.id || num(row.meta_leaderboard) !== 1) continue;
    const nickname = str(row.nickname);
    if (nicknameIdentityIssue(nickname, { displayName: str(row.display_name), loginId: str(row.login_id) })) continue;
    out.push({
      attemptId: str(row.id),
      userId,
      nickname,
      district: nullableStr(row.district),
      school: num(row.show_school) === 1 ? nullableStr(row.school) : null,
      score: num(row.score),
      timeTakenSec: num(row.meta_duration),
      submittedAt: num(row.meta_submitted),
    });
  }
  return out;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function groupBoard(
  rows: BoardRow[],
  keyOf: (row: BoardRow) => { key: string; name: string } | null,
  minParticipants = 1,
): LeaderboardGroup[] {
  const groups = new Map<string, { name: string; scores: number[] }>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const group = groups.get(key.key) ?? { name: key.name, scores: [] };
    group.scores.push(row.score);
    groups.set(key.key, group);
  }
  const list = [...groups.values()]
    .filter((g) => g.scores.length >= minParticipants)
    .map((g) => ({
      name: g.name,
      participants: g.scores.length,
      bestScore: Math.max(...g.scores),
      averageScore: round1(g.scores.reduce((s, x) => s + x, 0) / g.scores.length),
    }));
  list.sort((a, b) => b.averageScore - a.averageScore || b.participants - a.participants || a.name.localeCompare(b.name));
  let rank = 0;
  return list.map((g, i) => {
    const prev = list[i - 1];
    if (!prev || prev.averageScore !== g.averageScore || prev.participants !== g.participants) rank = i + 1;
    return { rank, ...g };
  });
}

export const LEADERBOARD_LIMIT = 100;

interface LeaderboardInput {
  testId: string;
  window: TestWindow;
  district: string | null;
  view: LeaderboardData["view"];
  maxScore: number;
  viewerId?: string | null;
  limit?: number;
}

export function getLeaderboard(input: LeaderboardInput, db: DatabaseSync = mocktestDb()): LeaderboardData {
  return assembleBoard(input, boardRows(input.testId, input.window, db), rankEntries);
}

/** Ranked papers: each board row with its stored tie-break vector. */
function rankedBoardRows(testId: string, window: TestWindow, db: DatabaseSync): (BoardRow & { tiebreak: number[] | null })[] {
  const rows = boardRows(testId, window, db);
  if (rows.length === 0) return [];
  const vectors = new Map(
    db
      .prepare("SELECT ap.attempt_id, ap.tiebreak FROM qb_attempt_papers ap JOIN mocktest_attempts a ON a.id = ap.attempt_id WHERE a.test_id = ?")
      .all(testId)
      .map((row) => [str(row.attempt_id), row.tiebreak === null || row.tiebreak === undefined ? null : parseJsonArray<number>(row.tiebreak)] as const),
  );
  return rows.map((row) => ({ ...row, tiebreak: vectors.get(row.attemptId) ?? null }));
}

/**
 * The board of a generated mock's monthly ranked paper ("bp-<slot>-ranked", plan §B10.3): the same
 * paper for everyone in the month, so entries rank by score and then the official tie-break vector
 * (no time criterion; entries equal on every criterion share a rank and are listed by save time).
 * Same privacy rules as the weekly boards (opt-in nicknames only; schools only in the aggregate).
 */
export function getRankedLeaderboard(input: LeaderboardInput, db: DatabaseSync = mocktestDb()): LeaderboardData {
  return { ...assembleBoard(input, rankedBoardRows(input.testId, input.window, db), rankRankedEntries), ranked: true };
}

function assembleBoard<R extends BoardRow>(
  input: LeaderboardInput,
  all: R[],
  rank: (rows: R[]) => (R & { rank: number })[],
): LeaderboardData {
  const filtered = input.district ? all.filter((r) => r.district === input.district) : all;
  const ranked = rank(filtered);
  const mine = input.viewerId ? ranked.find((r) => r.userId === input.viewerId) : undefined;
  const entries: LeaderboardEntry[] = ranked.slice(0, input.limit ?? LEADERBOARD_LIMIT).map((r) => ({
    rank: r.rank,
    nickname: r.nickname,
    district: r.district,
    score: r.score,
    timeTakenSec: r.timeTakenSec,
  }));
  let groups: LeaderboardGroup[] = [];
  if (input.view === "districts") groups = groupBoard(filtered, (r) => (r.district ? { key: r.district, name: r.district } : null));
  if (input.view === "schools") {
    groups = groupBoard(filtered, (r) => (r.school ? { key: schoolKey(r.school), name: r.school } : null), SCHOOL_MIN_PARTICIPANTS);
  }
  return {
    testId: input.testId,
    view: input.view,
    windowId: input.window.id,
    district: input.district,
    maxScore: input.maxScore,
    total: ranked.length,
    entries: input.view === "students" ? entries : [],
    groups,
    me: mine ? { rank: mine.rank, total: ranked.length } : null,
  };
}

/** The student's positions on every board they appear on (for the top-10 % badge). */
export function leaderboardPositions(userId: string, db: DatabaseSync = mocktestDb()): { testId: string; windowId: string | null; rank: number; total: number }[] {
  const profile = getProfile(userId, db);
  if (!profile?.leaderboardOptIn) return [];
  const boards = db
    .prepare(
      `SELECT DISTINCT a.test_id, a.window_id FROM ${WITH_META}
        WHERE a.user_id = ? AND m.leaderboard = 1 AND a.window_id IS NOT NULL`,
    )
    .all(userId)
    .map((row) => ({ testId: str(row.test_id), windowId: str(row.window_id) }));
  const positions: { testId: string; windowId: string | null; rank: number; total: number }[] = [];
  for (const board of boards) {
    // Monthly ranked papers of generated mocks ("bp-<slot>-ranked"): official tie-breaks, monthly windows.
    if (parseBlueprintTest(board.testId)?.mode === "ranked") {
      const month = monthWindowFromId(board.windowId);
      if (!month) continue;
      const rankedBoard = rankRankedEntries(rankedBoardRows(board.testId, month, db));
      const own = rankedBoard.find((r) => r.userId === userId);
      if (own) positions.push({ ...board, rank: own.rank, total: rankedBoard.length });
      continue;
    }
    const window = getVisibleMockTest(board.testId)?.windows?.find((w) => w.id === board.windowId);
    if (!window) continue;
    const ranked = rankEntries(boardRows(board.testId, window, db));
    const mine = ranked.find((r) => r.userId === userId);
    if (mine) positions.push({ ...board, rank: mine.rank, total: ranked.length });
  }
  return positions;
}

// ---------------------------------------------------------------------------------------------
// Certificate verification (L7)

export interface VerificationRecord {
  testId: string;
  savedAt: number;
  score: number;
  maxScore: number;
  /** Only when the student opted into leaderboards (D-034) and the nickname reveals no identity. */
  nickname: string | null;
  /** Server-side only (never sent): the attempt, to find a generated paper's link. */
  attemptId?: string;
}

/** A saved attempt by its public verification id: test, date, score — never the student's name. */
export function findVerification(verifyId: string, db: DatabaseSync = mocktestDb()): VerificationRecord | null {
  const row = db
    .prepare(
      `SELECT a.id AS attempt_id, a.test_id, a.score, a.max_score, m.server_submitted_at,
              p.nickname, p.leaderboard_opt_in, u.display_name, u.login_id, u.disabled, u.role
         FROM mocktest_attempt_meta m
         JOIN mocktest_attempts a ON a.id = m.attempt_id
         JOIN users u ON u.id = a.user_id
         LEFT JOIN mocktest_profiles p ON p.user_id = a.user_id
        WHERE m.verify_id = ?`,
    )
    .get(verifyId);
  if (!row) return null;
  const optedIn = num(row.leaderboard_opt_in) === 1 && num(row.disabled) === 0 && str(row.role) === "student";
  const nickname = optedIn ? str(row.nickname) : null;
  const safe = nickname && !nicknameIdentityIssue(nickname, { displayName: str(row.display_name), loginId: str(row.login_id) });
  return {
    testId: str(row.test_id),
    savedAt: num(row.server_submitted_at),
    score: num(row.score),
    maxScore: num(row.max_score),
    nickname: safe ? nickname : null,
    attemptId: str(row.attempt_id),
  };
}
