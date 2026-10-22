import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { qbSearchMode } from "./db";
import { sourceLabelStaff } from "./labels";
import { getQuestionRecords, type QuestionRecord } from "./repo/questions";
import { plainTextOf } from "./rich-text";
import type { QbSubject } from "./types";

/**
 * Question search (owner: QB-CORE-B; §B13). With FTS5 (trigram tokenizer): an index of the English
 * stem with LaTeX stripped, the question number and the staff source label. Without FTS5 (or for
 * queries under three characters): `LIKE` over the stored content, filtered by subject first.
 */

export function searchText(record: Pick<QuestionRecord, "content" | "source" | "fidelity" | "id">): string {
  const stem = plainTextOf(record.content.stem.en || record.content.stem.hi);
  const label = sourceLabelStaff({ source: record.source, fidelity: record.fidelity }, "en");
  return `${stem} ${record.source.qno ? `Q ${record.source.qno}` : ""} ${label} ${record.id}`.replace(/\s+/g, " ").trim();
}

export function indexQuestion(db: DatabaseSync, record: Pick<QuestionRecord, "content" | "source" | "fidelity" | "id">): void {
  if (qbSearchMode(db) !== "fts") return;
  try {
    db.prepare("DELETE FROM qb_search WHERE question_id = ?").run(record.id);
    db.prepare("INSERT INTO qb_search (question_id, text) VALUES (?, ?)").run(record.id, searchText(record));
  } catch {
    // The index is a convenience: a failure never blocks a save.
  }
}

export function removeFromSearch(db: DatabaseSync, id: string): void {
  if (qbSearchMode(db) !== "fts") return;
  try {
    db.prepare("DELETE FROM qb_search WHERE question_id = ?").run(id);
  } catch {
    // ignore
  }
}

const backfilled = new WeakSet<DatabaseSync>();

/**
 * Indexes questions written without the hooks (QB-SEED's samples, rows from before FTS5 existed):
 * once per connection, before the first FTS search.
 */
export function backfillSearchIndex(db: DatabaseSync): number {
  if (backfilled.has(db) || qbSearchMode(db) !== "fts") return 0;
  backfilled.add(db);
  try {
    const missing = db
      .prepare("SELECT id FROM qb_questions WHERE id NOT IN (SELECT question_id FROM qb_search)")
      .all()
      .map((r) => String(r.id));
    for (let i = 0; i < missing.length; i += 500) {
      for (const record of getQuestionRecords(db, missing.slice(i, i + 500)).values()) indexQuestion(db, record);
    }
    return missing.length;
  } catch {
    return 0;
  }
}

function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** Ids matching `q` (at most `limit`), and which search ran. */
export function searchQuestionIds(
  db: DatabaseSync,
  q: string,
  options: { subjects?: readonly QbSubject[]; limit?: number } = {},
): { ids: string[]; mode: "fts" | "like" } {
  const query = q.trim().slice(0, 100);
  const limit = Math.max(1, Math.min(2000, options.limit ?? 1000));
  if (query === "") return { ids: [], mode: qbSearchMode(db) };
  if (qbSearchMode(db) === "fts" && query.length >= 3) {
    backfillSearchIndex(db);
    try {
      const rows = db
        .prepare("SELECT question_id FROM qb_search WHERE qb_search MATCH ? LIMIT ?")
        .all(`"${query.replace(/"/g, '""')}"`, limit);
      return { ids: rows.map((r) => String(r.question_id)), mode: "fts" };
    } catch {
      // fall through to LIKE
    }
  }
  const subjects = options.subjects ?? [];
  const subjectClause = subjects.length > 0 ? `subject IN (${subjects.map(() => "?").join(", ")}) AND ` : "";
  const pattern = likePattern(query);
  const rows = db
    .prepare(
      `SELECT id FROM qb_questions WHERE ${subjectClause}(content LIKE ? ESCAPE '\\' OR source LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')
        ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(...subjects, pattern, pattern, pattern, limit);
  return { ids: rows.map((r) => String(r.id)), mode: "like" };
}
