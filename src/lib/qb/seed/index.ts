import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { showPlaceholderContent } from "@/lib/content-mode";
import { withTransaction } from "@/lib/db/connection";
import { qbDb } from "@/lib/qb/db";
import { fingerprintOf, minhashOf, minhashToBlob } from "@/lib/qb/fingerprint";
import { rewritePoolFor } from "@/lib/qb/pool";
import { addEvent, insertQuestionRow, insertVersion, nextQuestionNumber, writeExamRow, type QbSnapshot } from "@/lib/qb/repo/questions";
import { indexQuestion } from "@/lib/qb/search";
import { bumpBankRevision, hasSetting, writeSetting } from "@/lib/qb/settings";
import { chapterMap } from "@/lib/qb/taxonomy";
import type { QbExam } from "@/lib/qb/types";

import { seedBlueprints } from "./blueprints";
import { BIOLOGY_BLOCK_UNVERIFIED, chapterExamStatus, chapterUnits, SEED_CHAPTERS } from "./chapters";
import { RESERVED_QUESTION_IDS, SAMPLE_SOLUTION_REVIEW, seedSamples, type SeedSample } from "./samples";
import { SEED_UNITS, UNIT_GAPS } from "./units";

/**
 * Question-bank seed (owner: QB-SEED; docs/question-bank-plan.md §B14.3).
 *
 * `ensureQbSeeded(db?)` writes, once per database:
 * 1. the official syllabus units (names only, cited; ./units.ts);
 * 2. Aspire's teaching chapters (./chapters.ts), mapped to those units;
 * 3. the four default blueprints as v1 DRAFTS (./blueprints.ts; nothing is published);
 * 4. ONLY while showPlaceholderContent() is on: the demo SAMPLE questions of src/content/mocktest as
 *    approved v1 `source_kind: "sample"` questions plus their `qb_pool` rows (./samples.ts).
 * It never creates an official or "past year" question, never confirms a taxonomy
 * (`taxonomy.<EXAM>.confirmed` stays unset/false: an admin confirms it) and never publishes anything.
 *
 * Idempotent and safe to call on every request: memoized per connection, and each part is guarded by
 * a marker in `qb_settings` (`seed.units.v1`, `seed.chapters.v1`, `seed.blueprints.v1`,
 * `seed.samples.v1`). A part whose marker exists is never re-run, so rows staff edited, retired or
 * removed are not brought back. Rows are inserted with INSERT OR IGNORE, so an existing row (for
 * example a chapter staff created with the same id) is never overwritten. Everything runs in one
 * BEGIN IMMEDIATE transaction, so concurrent first requests seed once.
 *
 * Re-seeding a part: delete its `seed.*` marker, then restart the server (or call `resetQbSeedMemo()`).
 * The per-connection memo answers before any marker is read, so deleting a marker alone does nothing
 * in a running process (`qbDb()` is one long-lived connection).
 *
 * Cache Components: this WRITES to the database. Call it only from route handlers or after
 * `await connection()` — never from a static shell, `generateStaticParams` or `generateMetadata`.
 */

export const SEED_MARKERS = {
  units: "seed.units.v1",
  chapters: "seed.chapters.v1",
  blueprints: "seed.blueprints.v1",
  samples: "seed.samples.v1",
  /** JSON string[]: biology chapters whose Botany / Zoology block must be verified against a booklet. */
  blockUnverified: "seed.chapters.blockUnverified",
  /** JSON string[]: question ids that must never be created (withdrawn samples). */
  reservedIds: "seed.reservedIds",
  /** JSON QbSeedReport of the last run that changed something. */
  report: "seed.report",
} as const;

export interface QbSeedReport {
  units: { inserted: number; total: number; skipped: boolean };
  chapters: { inserted: number; total: number; skipped: boolean };
  blueprints: { inserted: string[]; skipped: boolean };
  samples: {
    inserted: number;
    total: number;
    /** "placeholder_off": samples are only seeded while showPlaceholderContent() is on. */
    skipped: false | "already_seeded" | "placeholder_off";
    /** Samples whose chapter is not current for their exam (kept out of the pool). */
    notCurrent: string[];
    /** Samples not seeded because their chapter row is missing or has another subject. */
    noChapter: string[];
  };
  /** Exams without seeded official units, and why (their taxonomy stays unconfirmed). */
  gaps: { exam: QbExam; reason: string }[];
}

let seeded = new WeakMap<DatabaseSync, Map<string, QbSeedReport>>();

function changes(result: { changes: number | bigint }): number {
  return Number(result.changes);
}

function seedUnits(db: DatabaseSync, now: number): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO qb_units
       (id, exam, syllabus_year, subject, code, label_en, label_hi, source_url, source_ref, status, sort, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, 'current', ?, ?, ?, NULL)`,
  );
  let inserted = 0;
  for (const u of SEED_UNITS) {
    inserted += changes(
      insert.run(u.id, u.exam, u.syllabusYear, u.subject, u.code, u.labelEn, u.sourceUrl, u.sourceRef, u.sort, now, now),
    );
  }
  return inserted;
}

function seedChapters(db: DatabaseSync, now: number): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO qb_chapters
       (id, subject, level, label_en, label_hi, units, exam_status, origin, sort, active, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'seed', ?, 1, ?, ?, NULL, NULL)`,
  );
  const sortBySubject = new Map<string, number>();
  let inserted = 0;
  for (const chapter of SEED_CHAPTERS) {
    const sort = (sortBySubject.get(chapter.subject) ?? 0) + 1;
    sortBySubject.set(chapter.subject, sort);
    inserted += changes(
      insert.run(
        chapter.id,
        chapter.subject,
        chapter.level,
        chapter.label.en,
        chapter.label.hi,
        JSON.stringify(chapterUnits(chapter)),
        JSON.stringify(chapterExamStatus(chapter)),
        sort,
        now,
        now,
      ),
    );
  }
  return inserted;
}

function seedBlueprintDrafts(db: DatabaseSync, now: number): string[] {
  const exists = db.prepare("SELECT 1 AS found FROM qb_blueprints WHERE slot = ? LIMIT 1");
  const insert = db.prepare(
    `INSERT OR IGNORE INTO qb_blueprints
       (id, slot, version, status, definition, created_by, created_at, updated_by, updated_at, published_by, published_at)
     VALUES (?, ?, ?, 'draft', ?, NULL, ?, NULL, ?, NULL, NULL)`,
  );
  const inserted: string[] = [];
  for (const blueprint of seedBlueprints()) {
    if (exists.get(blueprint.slot)) continue; // staff already have a version of this slot
    if (changes(insert.run(blueprint.id, blueprint.slot, blueprint.version, JSON.stringify(blueprint), now, now)) > 0) {
      inserted.push(blueprint.id);
    }
  }
  return inserted;
}

/** The approved v1 snapshot of a sample (`qb_question_versions.snapshot`, §B4). */
export function sampleSnapshot(sample: SeedSample): QbSnapshot {
  return {
    content: sample.content,
    passage: null,
    subject: sample.subject,
    chapterId: sample.chapterId,
    source: sample.source,
    fidelity: null,
    adaptedNote: null,
  };
}

/**
 * Writes the samples through QB-CORE-B's repository helpers, so a seeded sample is stored exactly like
 * an approved question: row, per-exam row, immutable v1 snapshot, event, pool rows (rewritten from the
 * snapshot by `rewritePoolFor`) and the search index.
 */
function seedSampleQuestions(
  db: DatabaseSync,
  now: number,
): { inserted: number; total: number; notCurrent: string[]; noChapter: string[] } {
  const samples = seedSamples();
  const chapters = chapterMap(db);
  const exists = db.prepare("SELECT 1 AS found FROM qb_questions WHERE id = ?");

  let inserted = 0;
  const notCurrent: string[] = [];
  const noChapter: string[] = [];
  for (const sample of samples) {
    if (RESERVED_QUESTION_IDS.includes(sample.id) || exists.get(sample.id)) continue;
    const chapter = chapters.get(sample.chapterId);
    // The subject is derived from the chapter (§B3): never seed a sample under a chapter of another subject.
    if (!chapter || chapter.subject !== sample.subject) {
      noChapter.push(sample.id);
      continue;
    }
    // Only a chapter current for the exam gets a checked ("current") syllabus and a pool row (§B9.1).
    const current = chapter.examStatus[sample.exam] === "current";
    if (!current) notCurrent.push(sample.id);
    const flags = sample.content.hiSource === "machine_draft" ? ["hi_machine"] : [];

    insertQuestionRow(db, {
      id: sample.id,
      n: nextQuestionNumber(db),
      created_by: null,
      created_at: now,
      status: "approved",
      suspended: 0,
      subject: sample.subject,
      chapter_id: sample.chapterId,
      type: sample.content.type,
      format: sample.content.format,
      content: JSON.stringify(sample.content),
      version: 1,
      approved_version: 1,
      source_kind: "sample",
      source: JSON.stringify(sample.source),
      also_in: "[]",
      key_status: "staff_entered",
      key_stage: "aspire",
      flags: JSON.stringify(flags),
      fingerprint: fingerprintOf(sample.content),
      minhash: minhashToBlob(minhashOf(sample.content.stem)),
      approved_by: null,
      approved_at: now,
    });
    writeExamRow(
      db,
      sample.id,
      sample.exam,
      {
        eligible: true,
        crossExam: false,
        difficulty: sample.difficulty,
        difficultySource: "sample",
        difficultyBy: null,
        syllabus: current ? "current" : "unchecked",
        syllabusBy: null,
      },
      now,
    );
    insertVersion(db, sample.id, 1, sampleSnapshot(sample), null, now);
    addEvent(
      db,
      sample.id,
      null,
      "seeded",
      {
        from: "src/content/mocktest",
        sourceKind: "sample",
        exam: sample.exam,
        solutionReviewedBy: SAMPLE_SOLUTION_REVIEW.reviewedBy,
        solutionNote: SAMPLE_SOLUTION_REVIEW.note,
      },
      now,
    );
    rewritePoolFor(db, sample.id);
    indexQuestion(db, { id: sample.id, content: sample.content, source: sample.source, fidelity: null });
    inserted += 1;
  }
  return { inserted, total: samples.length, notCurrent, noChapter };
}

/**
 * Seeds the question bank once (see the module comment). Returns what this call (or, when memoized,
 * the first call on this connection) did. `now` is injectable for tests.
 */
export function ensureQbSeeded(handle?: DatabaseSync, options: { now?: number; placeholder?: boolean } = {}): QbSeedReport {
  const db = qbDb(handle);
  const placeholder = options.placeholder ?? showPlaceholderContent();
  const memoKey = placeholder ? "placeholder" : "public";
  const memo = seeded.get(db)?.get(memoKey);
  if (memo) return memo;

  const now = options.now ?? Date.now();
  const required: string[] = [SEED_MARKERS.units, SEED_MARKERS.chapters, SEED_MARKERS.blueprints];
  if (placeholder) required.push(SEED_MARKERS.samples);
  // Fast path without a write lock: everything this mode needs is already seeded.
  const report = required.every((key) => hasSetting(db, key))
    ? emptyReport(placeholder)
    : withTransaction(db, () => runSeed(db, placeholder, now)); // markers are re-read inside the lock

  let perDb = seeded.get(db);
  if (!perDb) seeded.set(db, (perDb = new Map()));
  perDb.set(memoKey, report);
  return report;
}

function emptyReport(placeholder: boolean): QbSeedReport {
  return {
    units: { inserted: 0, total: SEED_UNITS.length, skipped: true },
    chapters: { inserted: 0, total: SEED_CHAPTERS.length, skipped: true },
    blueprints: { inserted: [], skipped: true },
    samples: { inserted: 0, total: 0, skipped: placeholder ? "already_seeded" : "placeholder_off", notCurrent: [], noChapter: [] },
    gaps: UNIT_GAPS.map((gap) => ({ ...gap })),
  };
}

function runSeed(db: DatabaseSync, placeholder: boolean, now: number): QbSeedReport {
  const result = emptyReport(placeholder);
  let changed = false;

  if (!hasSetting(db, SEED_MARKERS.units)) {
    result.units = { inserted: seedUnits(db, now), total: SEED_UNITS.length, skipped: false };
    writeSetting(db, SEED_MARKERS.units, { at: now, count: result.units.inserted }, null, now);
    changed = true;
  }
  if (!hasSetting(db, SEED_MARKERS.chapters)) {
    result.chapters = { inserted: seedChapters(db, now), total: SEED_CHAPTERS.length, skipped: false };
    writeSetting(db, SEED_MARKERS.chapters, { at: now, count: result.chapters.inserted }, null, now);
    writeSetting(db, SEED_MARKERS.blockUnverified, BIOLOGY_BLOCK_UNVERIFIED, null, now);
    writeSetting(db, SEED_MARKERS.reservedIds, RESERVED_QUESTION_IDS, null, now);
    changed = true;
  }
  if (!hasSetting(db, SEED_MARKERS.blueprints)) {
    result.blueprints = { inserted: seedBlueprintDrafts(db, now), skipped: false };
    writeSetting(db, SEED_MARKERS.blueprints, { at: now, ids: result.blueprints.inserted }, null, now);
    changed = true;
  }
  if (placeholder && !hasSetting(db, SEED_MARKERS.samples)) {
    const samples = seedSampleQuestions(db, now);
    result.samples = { ...samples, skipped: false };
    writeSetting(db, SEED_MARKERS.samples, { at: now, count: samples.inserted }, null, now);
    if (samples.inserted > 0) bumpBankRevision(db, now);
    changed = true;
  }
  if (changed) writeSetting(db, SEED_MARKERS.report, result, null, now);
  return result;
}

/**
 * Forgets the per-connection memo (the qb_settings markers stay), so the next `ensureQbSeeded` re-reads
 * the markers: after deleting `seed.*` keys, call this (server-only, e.g. from admin tooling) instead of
 * restarting the server. With a connection, only that connection's memo is forgotten; without, all.
 */
export function resetQbSeedMemo(db?: DatabaseSync): void {
  if (db) seeded.delete(db);
  else seeded = new WeakMap();
}

/** Test helper (kept for existing callers): same as `resetQbSeedMemo`. */
export const resetQbSeedMemoForTests = resetQbSeedMemo;
