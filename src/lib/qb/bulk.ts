import "server-only";

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { deleteSetting, readSetting, writeSetting } from "./settings";
import type { QbExam } from "./types";

/**
 * Spot-checked bulk actions (owner: QB-CORE-B; §B7): bulk approval and the bulk label actions.
 *
 * 1. `start` keeps a session (in `qb_settings` under `bulk:<id>`, 2 hours) with the eligible ids and a
 *    random sample of max(3, ceil(5 % of N)), at most 10 (never more than N).
 * 2. The reviewer must OPEN each sampled item: the question detail request names the batch and gets a
 *    one-time view token (only its SHA-256 is stored).
 * 3. `commit` needs a valid token for every sampled id; one failed item aborts the whole batch. The
 *    session is deleted on commit, abort or cancel, so tokens are single-use.
 */

export type QbBulkOp = "approve" | "accept_ai_labels" | "confirm_syllabus";

export interface BulkSession {
  id: string;
  op: QbBulkOp;
  exam: QbExam | null;
  viewerId: string;
  eligible: string[];
  sample: string[];
  /** questionId → SHA-256 of the issued view token. */
  views: Record<string, string>;
  createdAt: number;
  expiresAt: number;
}

export const BULK_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const KEY = (id: string) => `bulk:${id}`;
const BULK_ID = /^[A-Za-z0-9_-]{16,32}$/;

export function spotCheckSampleSize(n: number): number {
  if (n <= 0) return 0;
  return Math.min(n, 10, Math.max(3, Math.ceil(n * 0.05)));
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function pruneExpired(db: DatabaseSync, now: number): void {
  for (const row of db.prepare("SELECT key, value FROM qb_settings WHERE key LIKE 'bulk:%'").all()) {
    try {
      const session = JSON.parse(String(row.value)) as BulkSession;
      if (!(session.expiresAt > now)) deleteSetting(db, String(row.key));
    } catch {
      deleteSetting(db, String(row.key));
    }
  }
}

export function createBulkSession(
  db: DatabaseSync,
  input: { op: QbBulkOp; exam: QbExam | null; viewerId: string; eligible: string[]; now: number },
): BulkSession {
  pruneExpired(db, input.now);
  const pool = [...input.eligible];
  const sample: string[] = [];
  const size = spotCheckSampleSize(pool.length);
  while (sample.length < size) sample.push(pool.splice(randomInt(pool.length), 1)[0]);
  const session: BulkSession = {
    id: randomBytes(16).toString("base64url"),
    op: input.op,
    exam: input.exam,
    viewerId: input.viewerId,
    eligible: [...input.eligible],
    sample,
    views: {},
    createdAt: input.now,
    expiresAt: input.now + BULK_SESSION_TTL_MS,
  };
  writeSetting(db, KEY(session.id), session, input.viewerId, input.now);
  return session;
}

/** The viewer's live session, or null (unknown, someone else's, or expired — expired ones are deleted). */
export function loadBulkSession(db: DatabaseSync, id: string, viewerId: string, now: number): BulkSession | null {
  if (!BULK_ID.test(id)) return null;
  const session = readSetting<BulkSession>(db, KEY(id));
  if (!session || typeof session !== "object" || session.viewerId !== viewerId) return null;
  if (!(session.expiresAt > now)) {
    deleteSetting(db, KEY(id));
    return null;
  }
  return session;
}

/** Issues a fresh one-time view token when `questionId` is in the session's sample; null otherwise. */
export function issueViewToken(db: DatabaseSync, sessionId: string, viewerId: string, questionId: string, now: number): string | null {
  const session = loadBulkSession(db, sessionId, viewerId, now);
  if (!session || !session.sample.includes(questionId)) return null;
  const token = randomBytes(24).toString("base64url");
  session.views[questionId] = sha256(token);
  writeSetting(db, KEY(session.id), session, viewerId, now);
  return token;
}

export type SpotCheckVerdict =
  | { ok: true }
  | { ok: false; reason: "incomplete"; missing: string[] }
  | { ok: false; reason: "failed"; failedId: string };

function tokenMatches(stored: string | undefined, token: string): boolean {
  if (!stored) return false;
  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(sha256(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Every sampled id needs a valid token; a sampled item marked not-OK fails the batch. */
export function verifySpotChecks(session: BulkSession, checks: readonly { id: string; token: string; ok: boolean }[]): SpotCheckVerdict {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const missing: string[] = [];
  for (const id of session.sample) {
    const check = byId.get(id);
    const opened = check !== undefined && tokenMatches(session.views[id], check.token);
    // An opened item the reviewer failed aborts the batch, whatever else is missing.
    if (opened && check.ok !== true) return { ok: false, reason: "failed", failedId: id };
    if (!opened) missing.push(id);
  }
  return missing.length > 0 ? { ok: false, reason: "incomplete", missing } : { ok: true };
}

export function deleteBulkSession(db: DatabaseSync, id: string): void {
  deleteSetting(db, KEY(id));
}
