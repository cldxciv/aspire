import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { qbCan } from "./access";
import { qbDb } from "./db";
import { fingerprintOf, jaccardEstimate, minhashFromBlob, minhashOf, minhashToBlob, NEAR_DUPLICATE_THRESHOLD } from "./fingerprint";
import { rewritePoolForMany } from "./pool";
import { listItemOf } from "./list-item";
import { addEvent, examRowsForMany, getQuestionRecord, getQuestionRecords, setFlag, updateQuestionRow } from "./repo/questions";
import { conflict, forbidden, invalid, notFound, ok, type QbResult } from "./result";
import { bumpBankRevision } from "./settings";
import type { QbSource, QbSubject, QbViewer } from "./types";
import type { QbDuplicateView, QbPage } from "./views";

/**
 * Duplicates (owner: QB-CORE-B; §B7).
 * - An EXACT fingerprint match opens an `exact` pair and sets the blocking flag `exact_duplicate`.
 * - A NEAR match (MinHash Jaccard ≥ 0.8 within the subject, compared in memory) opens a `near` pair
 *   and sets the non-blocking `near_duplicate`. The pool treats open near pairs ≥ 0.9 as one cluster.
 * - A reviewer decides: duplicate (merge: the newer row is rejected or retired; on an exact pair its
 *   source is added to the kept question's `also_in`), variant (one cluster forever, both kept) or
 *   distinct. Decided pairs are never reopened by later saves.
 */

export interface DuplicateSignals {
  exact: string[];
  near: string[];
}

function orderPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/** Recomputes a question's fingerprint and MinHash, opens pairs, and refreshes both sides' flags. */
export function refreshDuplicateSignals(db: DatabaseSync, id: string): DuplicateSignals {
  const record = getQuestionRecord(db, id);
  if (!record) return { exact: [], near: [] };
  const fingerprint = fingerprintOf(record.content);
  const signature = minhashOf(record.content.stem);
  updateQuestionRow(db, id, { fingerprint, minhash: minhashToBlob(signature) });
  if (record.status === "rejected" || record.status === "retired") {
    syncDuplicateFlags(db, id);
    return { exact: [], near: [] };
  }
  const exact = db
    .prepare("SELECT id FROM qb_questions WHERE fingerprint = ? AND id <> ? AND status NOT IN ('rejected', 'retired')")
    .all(fingerprint, id)
    .map((r) => String(r.id));
  const near: string[] = [];
  const candidates = db
    .prepare("SELECT id, minhash FROM qb_questions WHERE subject = ? AND id <> ? AND status NOT IN ('rejected', 'retired') AND minhash IS NOT NULL")
    .all(record.subject, id);
  for (const row of candidates) {
    const other = String(row.id);
    if (exact.includes(other)) continue;
    const sig = minhashFromBlob(row.minhash as Uint8Array);
    if (!sig) continue;
    const score = jaccardEstimate(signature, sig);
    if (score >= NEAR_DUPLICATE_THRESHOLD) near.push(other);
    if (score >= NEAR_DUPLICATE_THRESHOLD) {
      const [a, b] = orderPair(id, other);
      db.prepare("INSERT OR IGNORE INTO qb_dup_pairs (a, b, score, kind, status) VALUES (?, ?, ?, 'near', 'open')").run(a, b, score);
      db.prepare("UPDATE qb_dup_pairs SET score = ? WHERE a = ? AND b = ? AND status = 'open' AND kind = 'near'").run(score, a, b);
    }
  }
  for (const other of exact) {
    const [a, b] = orderPair(id, other);
    db.prepare(
      `INSERT INTO qb_dup_pairs (a, b, score, kind, status) VALUES (?, ?, 1, 'exact', 'open')
       ON CONFLICT (a, b) DO UPDATE SET kind = 'exact', score = 1 WHERE qb_dup_pairs.status = 'open'`,
    ).run(a, b);
  }
  // Open pairs that no longer match (the text changed) are dropped.
  const open = db.prepare("SELECT a, b, kind FROM qb_dup_pairs WHERE status = 'open' AND (a = ? OR b = ?)").all(id, id);
  for (const pair of open) {
    const other = String(pair.a) === id ? String(pair.b) : String(pair.a);
    const still = pair.kind === "exact" ? exact.includes(other) : near.includes(other) || exact.includes(other);
    if (!still) {
      db.prepare("DELETE FROM qb_dup_pairs WHERE a = ? AND b = ? AND status = 'open'").run(pair.a, pair.b);
      syncDuplicateFlags(db, other);
    }
  }
  syncDuplicateFlags(db, id);
  for (const other of [...exact, ...near]) syncDuplicateFlags(db, other);
  return { exact, near };
}

/** `exact_duplicate` / `near_duplicate` mirror the question's open pairs. */
export function syncDuplicateFlags(db: DatabaseSync, id: string): void {
  const rows = db.prepare("SELECT kind FROM qb_dup_pairs WHERE status = 'open' AND (a = ? OR b = ?)").all(id, id);
  setFlag(db, id, "exact_duplicate", rows.some((r) => r.kind === "exact"));
  setFlag(db, id, "near_duplicate", rows.some((r) => r.kind === "near"));
}

// ---------------------------------------------------------------------------------------------
// Review

export type QbDuplicateDecision = "duplicate" | "variant" | "distinct";

export interface QbDuplicatePair {
  a: string;
  b: string;
  score: number;
  kind: "exact" | "near";
  status: "open" | QbDuplicateDecision;
  decidedBy: string | null;
  decidedAt: number | null;
}

function mapPair(row: Record<string, unknown>): QbDuplicatePair {
  return {
    a: String(row.a),
    b: String(row.b),
    score: Number(row.score),
    kind: row.kind === "exact" ? "exact" : "near",
    status: row.status as QbDuplicatePair["status"],
    decidedBy: row.decided_by === null ? null : String(row.decided_by),
    decidedAt: row.decided_at === null ? null : Number(row.decided_at),
  };
}

export function pairsFor(db: DatabaseSync, id: string): QbDuplicatePair[] {
  return db
    .prepare("SELECT * FROM qb_dup_pairs WHERE a = ? OR b = ? ORDER BY status = 'open' DESC, score DESC")
    .all(id, id)
    .map(mapPair);
}

/** Pairs with both questions as list rows (for side-by-side review). */
export function duplicateViews(db: DatabaseSync, pairs: readonly QbDuplicatePair[]): QbDuplicateView[] {
  const ids = [...new Set(pairs.flatMap((p) => [p.a, p.b]))];
  const records = getQuestionRecords(db, ids);
  const exams = examRowsForMany(db, ids);
  return pairs.map((p) => {
    const a = records.get(p.a);
    const b = records.get(p.b);
    const questions: QbDuplicateView["questions"] = [
      a ? listItemOf(a, exams.get(a.id) ?? []) : null,
      b ? listItemOf(b, exams.get(b.id) ?? []) : null,
    ];
    return { ...p, questions };
  });
}

export function listDuplicatePairs(
  viewer: QbViewer,
  input: { status: "open" | QbDuplicateDecision; subject?: QbSubject; page: number; pageSize: number },
  db: DatabaseSync = qbDb(),
): QbResult<QbPage<QbDuplicateView>> {
  if (!qbCan(viewer, "view")) return forbidden();
  const subjects = input.subject ? [input.subject] : viewer.role === "admin" ? [] : viewer.subjects;
  const subjectClause = subjects.length > 0 ? ` AND q.subject IN (${subjects.map(() => "?").join(", ")})` : "";
  const base = `FROM qb_dup_pairs p JOIN qb_questions q ON q.id = p.a WHERE p.status = ?${subjectClause}`;
  const total = Number(db.prepare(`SELECT COUNT(*) AS n ${base}`).get(input.status, ...subjects)?.n ?? 0);
  const pageSize = Math.max(1, Math.min(100, input.pageSize));
  const page = Math.max(1, input.page);
  const rows = db
    .prepare(`SELECT p.* ${base} ORDER BY p.kind = 'exact' DESC, p.score DESC, p.a LIMIT ? OFFSET ?`)
    .all(input.status, ...subjects, pageSize, (page - 1) * pageSize)
    .map(mapPair);
  return ok({ items: duplicateViews(db, rows), total, page, pageSize });
}

function sameSource(x: QbSource, y: QbSource): boolean {
  return JSON.stringify({ ...x, page: undefined, importId: undefined }) === JSON.stringify({ ...y, page: undefined, importId: undefined });
}

/**
 * Records a reviewer's decision on a pair. `keep` (duplicate only) names the question to keep. By
 * default an OFFICIAL question is kept over a bank one (so a past-year question copied into an Aspire
 * file never ends up labelled "Aspire question bank"); otherwise the older one. Returns the decided pair.
 */
export function decideDuplicate(
  viewer: QbViewer,
  input: { a: string; b: string; decision: QbDuplicateDecision; keep?: string },
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbDuplicateView> {
  const [a, b] = orderPair(input.a, input.b);
  const row = db.prepare("SELECT * FROM qb_dup_pairs WHERE a = ? AND b = ?").get(a, b);
  if (!row) return notFound("No such pair.");
  const pair = mapPair(row);
  const qa = getQuestionRecord(db, a);
  const qb = getQuestionRecord(db, b);
  if (!qa || !qb) return notFound("No such question.");
  if (!qbCan(viewer, "merge_duplicates", qa.subject) || !qbCan(viewer, "merge_duplicates", qb.subject)) return forbidden();
  if (pair.status !== "open") return conflict("stale", "This pair was already decided.");

  if (input.decision === "duplicate") {
    const officialA = qa.sourceKind === "official";
    const officialB = qb.sourceKind === "official";
    const keepId = input.keep ?? (officialA !== officialB ? (officialA ? a : b) : qa.createdAt <= qb.createdAt ? a : b);
    if (keepId !== a && keepId !== b) return invalid("Keep one of the two questions.");
    const kept = keepId === a ? qa : qb;
    const dropped = keepId === a ? qb : qa;
    if (pair.kind === "exact" && dropped.sourceKind === "official") {
      const alsoIn = [...kept.alsoIn, dropped.source, ...dropped.alsoIn].filter(
        (s, i, all) => s.kind === "official" && !sameSource(s, kept.source) && all.findIndex((t) => sameSource(t, s)) === i,
      );
      updateQuestionRow(db, kept.id, { also_in: JSON.stringify(alsoIn), updated_at: now, updated_by: viewer.userId });
    }
    if (dropped.status === "approved") {
      updateQuestionRow(db, dropped.id, {
        status: "retired",
        retired_by: viewer.userId,
        retired_at: now,
        retire_reason: `duplicate of ${kept.id}`,
        updated_at: now,
        updated_by: viewer.userId,
      });
    } else if (dropped.status !== "retired" && dropped.status !== "rejected") {
      updateQuestionRow(db, dropped.id, { status: "rejected", updated_at: now, updated_by: viewer.userId });
    }
    addEvent(db, dropped.id, viewer.userId, "merged_duplicate", { into: kept.id, kind: pair.kind }, now);
    addEvent(db, kept.id, viewer.userId, "kept_duplicate", { merged: dropped.id, alsoIn: pair.kind === "exact" }, now);
  } else if (input.decision === "variant") {
    const cluster = qa.clusterId ?? qb.clusterId ?? a;
    db.prepare("UPDATE qb_questions SET cluster_id = ? WHERE id IN (?, ?) OR (cluster_id IS NOT NULL AND cluster_id IN (?, ?))").run(
      cluster,
      a,
      b,
      qa.clusterId ?? a,
      qb.clusterId ?? b,
    );
    addEvent(db, a, viewer.userId, "variant_of", { other: b, cluster }, now);
    addEvent(db, b, viewer.userId, "variant_of", { other: a, cluster }, now);
  } else {
    addEvent(db, a, viewer.userId, "distinct_from", { other: b }, now);
    addEvent(db, b, viewer.userId, "distinct_from", { other: a }, now);
  }
  db.prepare("UPDATE qb_dup_pairs SET status = ?, decided_by = ?, decided_at = ? WHERE a = ? AND b = ?").run(
    input.decision,
    viewer.userId,
    now,
    a,
    b,
  );
  syncDuplicateFlags(db, a);
  syncDuplicateFlags(db, b);
  rewritePoolForMany(db, [a, b]);
  bumpBankRevision(db, now);
  return ok(duplicateViews(db, [mapPair(db.prepare("SELECT * FROM qb_dup_pairs WHERE a = ? AND b = ?").get(a, b)!)])[0]);
}
