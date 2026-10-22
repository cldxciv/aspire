import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb } from "@/lib/db/connection";
import { schema as qbSchema } from "@/lib/db/features/qb";

/**
 * The question bank's database handle (owner: QB-CORE-B; §B4, §B13).
 *
 * `qbDb()` returns the process-wide connection (or the one a test passes) after making sure, once per
 * connection, that the qb schema exists (it is also applied by the feature-schema registry) and that
 * the FTS5 search table is there. The search table is created lazily inside try/catch, so a SQLite
 * build without FTS5 (or without the trigram tokenizer) can never break start-up: search then falls
 * back to `LIKE` (src/lib/qb/search.ts). Which mode is in use is logged once per connection.
 */

export type QbSearchMode = "fts" | "like";

interface ConnectionState {
  search: QbSearchMode;
}

const prepared = new WeakMap<DatabaseSync, ConnectionState>();

function createSearchTable(db: DatabaseSync): QbSearchMode {
  try {
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS qb_search USING fts5(question_id UNINDEXED, text, tokenize = 'trigram')");
    return "fts";
  } catch {
    return "like";
  }
}

/** Applies the qb schema and the lazy FTS5 table once per connection. */
export function ensureQbSchema(db: DatabaseSync): ConnectionState {
  const existing = prepared.get(db);
  if (existing) return existing;
  db.exec(qbSchema);
  const state: ConnectionState = { search: createSearchTable(db) };
  prepared.set(db, state);
  if (process.env.NODE_ENV !== "test") {
    console.info(JSON.stringify({ ts: new Date().toISOString(), level: "info", event: "qb", outcome: "db_ready", search: state.search }));
  }
  return state;
}

/** The connection QB services use (the shared one unless a test passes its own). */
export function qbDb(db?: DatabaseSync): DatabaseSync {
  const handle = db ?? getDb();
  ensureQbSchema(handle);
  return handle;
}

export function qbSearchMode(db: DatabaseSync): QbSearchMode {
  return ensureQbSchema(db).search;
}

/** Tests only: pretend FTS5 is missing on this connection (exercises the LIKE fallback). */
export function forceQbSearchModeForTests(db: DatabaseSync, mode: QbSearchMode): void {
  ensureQbSchema(db).search = mode;
}
