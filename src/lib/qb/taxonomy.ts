import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { qbCan } from "./access";
import { qbDb } from "./db";
import { isOfficialSourceUrl, OFFICIAL_HOSTS_HINT } from "./official-hosts";
import { parseJson } from "./repo/json";
import { conflict, forbidden, invalid, notFound, ok, type QbResult } from "./result";
import { bumpBankRevision, isTaxonomyConfirmed, readSetting, taxonomyStatus, writeTaxonomyConfirmation, type QbTaxonomyStatus } from "./settings";
import type { Bilingual, QbChapter, QbChapterExamStatus, QbExam, QbLevel, QbSubject, QbUnit, QbViewer } from "./types";
import { QB_EXAMS, QB_LEVELS, QB_SUBJECTS } from "./types";

/**
 * Taxonomy (owner: QB-CORE-B; §B3): official syllabus units (names only, cited) and Aspire's teaching
 * chapters. A question's subject is DERIVED from its chapter. An admin confirms each exam's taxonomy
 * before any import for that exam can run and before its blueprint can be published.
 */

export { isOfficialSourceUrl };

// ---------------------------------------------------------------------------------------------
// Reads

function mapChapter(row: Record<string, unknown>): QbChapter {
  return {
    id: String(row.id),
    subject: row.subject as QbSubject,
    level: row.level as QbLevel,
    label: { en: String(row.label_en), hi: String(row.label_hi ?? "") },
    units: parseJson(row.units, {}),
    examStatus: parseJson(row.exam_status, {}),
    origin: row.origin === "staff" ? "staff" : "seed",
    sort: Number(row.sort ?? 0),
    active: Number(row.active) === 1,
  };
}

function mapUnit(row: Record<string, unknown>): QbUnit {
  return {
    id: String(row.id),
    exam: row.exam as QbExam,
    syllabusYear: Number(row.syllabus_year),
    subject: row.subject as QbSubject,
    code: row.code === null || row.code === undefined ? null : String(row.code),
    label: { en: String(row.label_en), hi: String(row.label_hi ?? "") },
    sourceUrl: String(row.source_url),
    sourceRef: String(row.source_ref ?? ""),
    status: row.status === "removed" ? "removed" : "current",
    sort: Number(row.sort ?? 0),
  };
}

export function getChapter(db: DatabaseSync, id: string): QbChapter | null {
  const row = db.prepare("SELECT * FROM qb_chapters WHERE id = ?").get(id);
  return row ? mapChapter(row) : null;
}

export function allChapters(db: DatabaseSync): QbChapter[] {
  return db
    .prepare("SELECT * FROM qb_chapters ORDER BY subject, sort, id")
    .all()
    .map(mapChapter);
}

/** id → chapter (all chapters, active or not). */
export function chapterMap(db: DatabaseSync): Map<string, QbChapter> {
  return new Map(allChapters(db).map((c) => [c.id, c]));
}

/** Active chapters current for `exam`. */
export function chaptersForExam(db: DatabaseSync, exam: QbExam): QbChapter[] {
  return allChapters(db).filter((c) => c.active && c.examStatus[exam] === "current");
}

/**
 * The chapter list the AI may suggest from (import prompt), and the confirmed list staff choose from:
 * active chapters current for the exam. Labels in English for the prompt.
 */
export function chapterListFor(exam: QbExam, db: DatabaseSync = qbDb()): { id: string; subject: QbSubject; label: string; level: QbLevel }[] {
  return chaptersForExam(db, exam).map((c) => ({ id: c.id, subject: c.subject, label: c.label.en, level: c.level }));
}

/** The subject a chapter gives its questions, or null for an unknown chapter. */
export function chapterSubject(db: DatabaseSync, chapterId: string | null | undefined): QbSubject | null {
  if (!chapterId) return null;
  const row = db.prepare("SELECT subject FROM qb_chapters WHERE id = ?").get(chapterId);
  return row ? (row.subject as QbSubject) : null;
}

export function unitsFor(db: DatabaseSync, exam: QbExam): QbUnit[] {
  return db
    .prepare("SELECT * FROM qb_units WHERE exam = ? ORDER BY syllabus_year DESC, subject, sort, id")
    .all(exam)
    .map(mapUnit);
}

// ---------------------------------------------------------------------------------------------
// Views (staff)

export type QbUnitView = QbUnit;

export interface QbUnitsView {
  exam: QbExam;
  status: QbTaxonomyStatus;
  units: QbUnitView[];
  /** Gaps the seed could not fill from an official source ("not transcribed yet"). */
  gaps: string[];
}

export interface QbChapterView extends QbChapter {
  verifyNote: string | null;
  questionCount: number;
}

export interface QbUnitInput {
  id?: string;
  exam: QbExam;
  syllabusYear: number;
  subject: QbSubject;
  code?: string | null;
  label: Bilingual;
  sourceUrl: string;
  sourceRef: string;
  status?: "current" | "removed";
  sort?: number;
}

export interface QbChapterInput {
  id?: string;
  subject: QbSubject;
  level: QbLevel;
  label: Bilingual;
  units?: Partial<Record<QbExam, string[]>>;
  examStatus?: Partial<Record<QbExam, QbChapterExamStatus>>;
  sort?: number;
  active?: boolean;
}

function seedGaps(db: DatabaseSync, exam: QbExam): string[] {
  const report = readSetting<{ gaps?: { exam: string; reason: string }[] }>(db, "seed.report");
  return (report?.gaps ?? []).filter((g) => g.exam === exam).map((g) => g.reason);
}

function blockUnverified(db: DatabaseSync): Set<string> {
  const list = readSetting<unknown>(db, "seed.chapters.blockUnverified");
  return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
}

export function listUnits(viewer: QbViewer, exam: QbExam, db: DatabaseSync = qbDb()): QbResult<QbUnitsView> {
  if (!qbCan(viewer, "view")) return forbidden();
  return ok({ exam, status: taxonomyStatus(db, exam), units: unitsFor(db, exam), gaps: seedGaps(db, exam) });
}

/** Admin: official units only, each citing an official source. */
export function upsertUnit(viewer: QbViewer, input: QbUnitInput, now: number, db: DatabaseSync = qbDb()): QbResult<QbUnitView> {
  if (!qbCan(viewer, "confirm_taxonomy")) return forbidden();
  if (!isOfficialSourceUrl(input.sourceUrl)) {
    return invalid(`Units must cite an official source (${OFFICIAL_HOSTS_HINT}).`, {
      sourceUrl: ["official_only"],
    });
  }
  const sort = input.sort ?? 0;
  const id = input.id ?? `${input.exam}:${input.syllabusYear}:${input.subject}:${String(sort).padStart(2, "0")}`;
  db.prepare(
    `INSERT INTO qb_units (id, exam, syllabus_year, subject, code, label_en, label_hi, source_url, source_ref, status, sort, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET exam = excluded.exam, syllabus_year = excluded.syllabus_year, subject = excluded.subject,
       code = excluded.code, label_en = excluded.label_en, label_hi = excluded.label_hi, source_url = excluded.source_url,
       source_ref = excluded.source_ref, status = excluded.status, sort = excluded.sort, updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).run(
    id,
    input.exam,
    input.syllabusYear,
    input.subject,
    input.code ?? null,
    input.label.en,
    input.label.hi,
    input.sourceUrl,
    input.sourceRef,
    input.status ?? "current",
    sort,
    now,
    now,
    viewer.userId,
  );
  const row = db.prepare("SELECT * FROM qb_units WHERE id = ?").get(id);
  return row ? ok(mapUnit(row)) : notFound();
}

function questionCounts(db: DatabaseSync): Map<string, number> {
  const rows = db.prepare("SELECT chapter_id, COUNT(*) AS n FROM qb_questions WHERE chapter_id IS NOT NULL GROUP BY chapter_id").all();
  return new Map(rows.map((r) => [String(r.chapter_id), Number(r.n)]));
}

export function listChapters(
  viewer: QbViewer,
  filter: { exam?: QbExam; subject?: QbSubject; includeInactive?: boolean } = {},
  db: DatabaseSync = qbDb(),
): QbResult<QbChapterView[]> {
  if (!qbCan(viewer, "view")) return forbidden();
  const counts = questionCounts(db);
  const unverified = blockUnverified(db);
  const chapters = allChapters(db).filter(
    (c) =>
      (filter.includeInactive || c.active) &&
      (!filter.subject || c.subject === filter.subject) &&
      (!filter.exam || c.examStatus[filter.exam] !== undefined),
  );
  return ok(
    chapters.map((c) => ({
      ...c,
      verifyNote: unverified.has(c.id) ? "Verify the Botany / Zoology block against a NEET booklet." : null,
      questionCount: counts.get(c.id) ?? 0,
    })),
  );
}

const CHAPTER_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

function cleanStatus(value: Partial<Record<QbExam, QbChapterExamStatus>> | undefined): Partial<Record<QbExam, QbChapterExamStatus>> {
  const out: Partial<Record<QbExam, QbChapterExamStatus>> = {};
  for (const exam of QB_EXAMS) {
    const v = value?.[exam];
    if (v === "current" || v === "removed") out[exam] = v;
  }
  return out;
}

export function createChapter(viewer: QbViewer, input: QbChapterInput, now: number, db: DatabaseSync = qbDb()): QbResult<QbChapterView> {
  if (!qbCan(viewer, "manage_chapters")) return forbidden();
  if (!input.id || !CHAPTER_ID.test(input.id)) return invalid("Use lower-case letters, digits and hyphens for the id.", { id: ["format"] });
  if (!(QB_SUBJECTS as readonly string[]).includes(input.subject) || !(QB_LEVELS as readonly string[]).includes(input.level)) {
    return invalid("Choose a subject and a level.");
  }
  if (getChapter(db, input.id)) return conflict("duplicate_id", "A chapter with this id already exists.");
  db.prepare(
    `INSERT INTO qb_chapters (id, subject, level, label_en, label_hi, units, exam_status, origin, sort, active, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'staff', ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.subject,
    input.level,
    input.label.en,
    input.label.hi,
    JSON.stringify(input.units ?? {}),
    JSON.stringify(cleanStatus(input.examStatus)),
    input.sort ?? 0,
    input.active === false ? 0 : 1,
    now,
    now,
    viewer.userId,
    viewer.userId,
  );
  bumpBankRevision(db, now);
  return ok({ ...getChapter(db, input.id)!, verifyNote: null, questionCount: 0 });
}

/**
 * Edits a chapter. Its subject cannot change while questions use it (their subject is derived from
 * it). Status and level changes apply to new papers at once (the pool filters on them).
 */
export function updateChapter(
  viewer: QbViewer,
  id: string,
  patch: Partial<Omit<QbChapterInput, "id">>,
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbChapterView> {
  if (!qbCan(viewer, "manage_chapters")) return forbidden();
  const chapter = getChapter(db, id);
  if (!chapter) return notFound("No such chapter.");
  const counts = questionCounts(db);
  if (patch.subject && patch.subject !== chapter.subject && (counts.get(id) ?? 0) > 0) {
    return conflict("chapter_in_use", "Questions use this chapter, so its subject cannot change. Create a new chapter instead.");
  }
  const next: QbChapter = {
    ...chapter,
    subject: patch.subject ?? chapter.subject,
    level: patch.level ?? chapter.level,
    label: patch.label ?? chapter.label,
    units: patch.units ?? chapter.units,
    examStatus: patch.examStatus ? { ...chapter.examStatus, ...cleanStatus(patch.examStatus) } : chapter.examStatus,
    sort: patch.sort ?? chapter.sort,
    active: patch.active ?? chapter.active,
  };
  db.prepare(
    `UPDATE qb_chapters SET subject = ?, level = ?, label_en = ?, label_hi = ?, units = ?, exam_status = ?, sort = ?, active = ?,
       updated_at = ?, updated_by = ? WHERE id = ?`,
  ).run(
    next.subject,
    next.level,
    next.label.en,
    next.label.hi,
    JSON.stringify(next.units),
    JSON.stringify(next.examStatus),
    next.sort,
    next.active ? 1 : 0,
    now,
    viewer.userId,
    id,
  );
  bumpBankRevision(db, now);
  return ok({ ...next, verifyNote: blockUnverified(db).has(id) ? "Verify the Botany / Zoology block against a NEET booklet." : null, questionCount: counts.get(id) ?? 0 });
}

/** Admin: confirms (or withdraws) an exam's taxonomy and its syllabus revision year. Audited by the route. */
export function confirmTaxonomy(
  viewer: QbViewer,
  exam: QbExam,
  input: { syllabusRevisionYear: number | null; note?: string; confirm?: boolean },
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbTaxonomyStatus> {
  if (!qbCan(viewer, "confirm_taxonomy")) return forbidden();
  if (input.confirm !== false && chaptersForExam(db, exam).length === 0) {
    return invalid("This exam has no current chapters yet, so its taxonomy cannot be confirmed.");
  }
  const status = writeTaxonomyConfirmation(db, exam, {
    confirm: input.confirm !== false,
    syllabusRevisionYear: input.syllabusRevisionYear,
    actorId: viewer.userId,
    now,
  });
  bumpBankRevision(db, now);
  return ok(status);
}

/** The taxonomy gate: imports and publishing need a confirmed taxonomy. */
export function taxonomyGate(db: DatabaseSync, exam: QbExam): QbResult<true> {
  return isTaxonomyConfirmed(db, exam)
    ? ok(true)
    : conflict("taxonomy_unconfirmed", "An admin must confirm this exam's syllabus list (taxonomy) first.");
}
