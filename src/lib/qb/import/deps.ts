import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { QbExam } from "@/lib/qb/types";

import type { QbImportClient } from "./client";
import type { QbImportConfig } from "./config";
import type { TimerApi } from "./lease";
import type { PatternTools, TextTools } from "./normalize";
import type { HindiPair, ImportChapter, ImportDraft, ImportQuestionRef, KeyMatch } from "./types";

/**
 * Everything the import jobs need from outside this package, injected. Production wiring is in
 * core.ts (the ONLY file that imports QB-CORE-A / QB-CORE-B runtime code); tests pass fakes, so
 * no test ever calls the Claude API or depends on another package's internals.
 */

/** Bank writes and reads owned by QB-CORE-B (`src/lib/qb/import-hooks.ts`, settings, taxonomy). */
export interface ImportHooks {
  /** Idempotent on `UNIQUE(import_id, source_key)`: a re-run updates its own drafts, never duplicates. */
  upsertImportDrafts(importId: string, drafts: readonly ImportDraft[]): { created: number; updated: number };
  applyAnswerKey(matches: readonly KeyMatch[]): { applied: number };
  applyHindiPairing(pairs: readonly HindiPair[]): { applied: number };
  /** The exam's confirmed chapter list (what the model may suggest). */
  chapterListFor(exam: QbExam): ImportChapter[];
  /** `taxonomy.<EXAM>.confirmed` (admin-confirmed syllabus): imports for other exams are refused. */
  taxonomyConfirmed(exam: QbExam): boolean;
  /** Admin setting `import.enabled` (default off). */
  importSettingEnabled(): boolean;
  /** Read-only view of the bank questions created by these imports (keys, Hindi pairing). */
  listImportQuestions(importIds: readonly string[]): ImportQuestionRef[];
  /**
   * OPTIONAL, not provided yet (asked of QB-CORE-B): sets `third_party_source` on EVERY question of
   * the import whatever its status (suspending approved ones), for marks found after staff touched
   * some drafts. Without it the job shows the `third_party_after_edit` warning instead.
   */
  flagImportThirdParty?(importId: string): { flagged: number };
}

export interface AuditInput {
  actorId: string | null;
  action: string;
  target: string | null;
  details?: Record<string, string | number | boolean | null>;
}

export interface ImportDeps {
  db: DatabaseSync;
  now: () => number;
  config: QbImportConfig;
  /** The Claude client, or null when no API key is configured. */
  client: () => QbImportClient | null;
  hooks: ImportHooks;
  text: TextTools;
  patterns: PatternTools;
  /** This process's runner prefix; every runner invocation adds its own suffix (jobs.ts `startRunner`). */
  runnerId: string;
  timers?: TimerApi;
  audit: (entry: AuditInput) => void;
}

/** Audit actions (`audit_log.action`); details are counts, kinds and amounts only. */
export const IMPORT_AUDIT = {
  upload: "qb.import_upload",
  run: "qb.import_run",
  pause: "qb.import_pause",
  cancel: "qb.import_cancel",
  close: "qb.import_close",
  retry: "qb.import_retry",
  createDrafts: "qb.import_create_drafts",
  snapshotConfirm: "qb.import_snapshot_confirm",
  done: "qb.import_done",
  dailyCap: "qb.import_daily_cap",
} as const;
