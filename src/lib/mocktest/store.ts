import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { MockTestDefinition, TestWindow } from "@/content/mocktest/types";
import { getDb, withTransaction } from "@/lib/db/connection";
import { schema as MOCKTEST_SCHEMA } from "@/lib/db/features/mocktest";
import { computeBadges, longestStreakDays } from "./badges";
import { getVisibleMockTest } from "./catalog";
import { rankEntries, SCHOOL_MIN_PARTICIPANTS, schoolKey } from "./leaderboard";
import { nicknameIdentityIssue, type ProfileInput } from "./schemas";
import type { Answer, ScoreResult } from "./scoring";
import { evaluateAttempt, isPracticeReason, maxDurationMs, openWindowAt, type AttemptTiming, type StartCheck } from "./timing";
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
  result: ScoreResult;
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

/** Totals, best score per test, longest streak and badges for one learner. */
export function summariseAttempts(userId: string, db: DatabaseSync = mocktestDb()): AttemptsSummary {
  const rows = db
    .prepare("SELECT test_id, window_id, score, max_score, correct, wrong, created_at FROM mocktest_attempts WHERE user_id = ?")
    .all(userId);
  const best = new Map<string, { testId: string; bestScore: number; maxScore: number; attempts: number }>();
  let correct = 0;
  let attempted = 0;
  let last: number | null = null;
  const times: number[] = [];
  for (const row of rows) {
    const testId = str(row.test_id);
    const entry = best.get(testId) ?? { testId, bestScore: Number.NEGATIVE_INFINITY, maxScore: num(row.max_score), attempts: 0 };
    entry.bestScore = Math.max(entry.bestScore, num(row.score));
    entry.maxScore = num(row.max_score);
    entry.attempts += 1;
    best.set(testId, entry);
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

export function getLeaderboard(
  input: {
    testId: string;
    window: TestWindow;
    district: string | null;
    view: LeaderboardData["view"];
    maxScore: number;
    viewerId?: string | null;
    limit?: number;
  },
  db: DatabaseSync = mocktestDb(),
): LeaderboardData {
  const all = boardRows(input.testId, input.window, db);
  const filtered = input.district ? all.filter((r) => r.district === input.district) : all;
  const ranked = rankEntries(filtered);
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
}

/** A saved attempt by its public verification id: test, date, score — never the student's name. */
export function findVerification(verifyId: string, db: DatabaseSync = mocktestDb()): VerificationRecord | null {
  const row = db
    .prepare(
      `SELECT a.test_id, a.score, a.max_score, m.server_submitted_at,
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
  };
}
