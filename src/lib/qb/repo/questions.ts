import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type {
  Bilingual,
  QbAnswer,
  QbDifficulty,
  QbDifficultySource,
  QbExam,
  QbFidelity,
  QbFigureRef,
  QbFlag,
  QbFormat,
  QbKeyStage,
  QbKeyStatus,
  QbMarking,
  QbQuestionContent,
  QbQuestionExam,
  QbQuestionType,
  QbSource,
  QbSourceKind,
  QbStatus,
  QbSubject,
} from "../types";
import { QB_FLAGS } from "../types";
import { deflateJson, inflateJson, num, parseJson, placeholders, str } from "./json";

/**
 * SQL for `qb_questions`, `qb_question_exams`, `qb_question_versions` and `qb_events` (owner:
 * QB-CORE-B). No rules here: services in questions.ts / exams.ts / pool.ts decide.
 */

/** The original extraction of an imported question (deflated in `imported`), for the fidelity diff. */
export interface ImportedOriginal {
  stem: Bilingual;
  options: Bilingual[];
  answer: QbAnswer | null;
  /** The official key's answer once a key was matched, and its stage. */
  officialAnswer?: QbAnswer | null;
  officialKeyStage?: "provisional" | "final" | null;
  /** Figures the import saw on the page (the draft needs them before approval). */
  figureHints?: number;
  notes?: string[];
}

/** An approved version, as stored in `qb_question_versions.snapshot` (immutable). */
export interface QbSnapshot {
  content: QbQuestionContent;
  passage: { id: string; stem: Bilingual; figures: QbFigureRef[] } | null;
  subject: QbSubject;
  chapterId: string | null;
  source: QbSource;
  fidelity: QbFidelity | null;
  adaptedNote: Bilingual | null;
}

export interface QuestionRecord {
  id: string;
  n: number;
  status: QbStatus;
  suspended: boolean;
  subject: QbSubject;
  chapterId: string | null;
  aiChapterId: string | null;
  type: QbQuestionType;
  format: QbFormat;
  content: QbQuestionContent;
  version: number;
  approvedVersion: number | null;
  sourceKind: QbSourceKind;
  source: QbSource;
  sourceExam: QbExam | null;
  sourceYear: number | null;
  sourcePaperKey: string | null;
  alsoIn: QbSource[];
  fidelity: QbFidelity | null;
  adaptedNote: Bilingual | null;
  imported: ImportedOriginal | null;
  importId: string | null;
  sourceKey: string | null;
  patternTag: string | null;
  originalMarking: QbMarking | null;
  keyStatus: QbKeyStatus;
  keyStage: QbKeyStage | null;
  confidence: number | null;
  flags: QbFlag[];
  fingerprint: string | null;
  minhash: Uint8Array | null;
  clusterId: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedBy: string | null;
  updatedAt: number;
  approvedBy: string | null;
  approvedAt: number | null;
  retiredBy: string | null;
  retiredAt: number | null;
  retireReason: string | null;
}

const EMPTY_CONTENT: QbQuestionContent = {
  type: "single",
  format: "standard",
  passageId: null,
  passageOrder: null,
  stem: { en: "", hi: "" },
  options: [],
  answer: null,
  solution: { en: "", hi: "" },
  solutionSource: "none",
  hiSource: "none",
  figures: [],
  topics: [],
};

function cleanFlags(raw: unknown): QbFlag[] {
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.filter((f): f is QbFlag => typeof f === "string" && (QB_FLAGS as readonly string[]).includes(f)))];
}

export function mapQuestionRow(row: Record<string, unknown>): QuestionRecord {
  return {
    id: String(row.id),
    n: Number(row.n),
    status: row.status as QbStatus,
    suspended: Number(row.suspended) === 1,
    subject: row.subject as QbSubject,
    chapterId: str(row.chapter_id),
    aiChapterId: str(row.ai_chapter_id),
    type: row.type as QbQuestionType,
    format: row.format as QbFormat,
    content: { ...EMPTY_CONTENT, ...parseJson<Partial<QbQuestionContent>>(row.content, {}) },
    version: Number(row.version),
    approvedVersion: num(row.approved_version),
    sourceKind: row.source_kind as QbSourceKind,
    source: parseJson<QbSource>(row.source, { kind: row.source_kind as QbSourceKind }),
    sourceExam: (str(row.source_exam) as QbExam | null) ?? null,
    sourceYear: num(row.source_year),
    sourcePaperKey: str(row.source_paper_key),
    alsoIn: parseJson<QbSource[]>(row.also_in, []),
    fidelity: (str(row.fidelity) as QbFidelity | null) ?? null,
    adaptedNote: parseJson<Bilingual | null>(row.adapted_note, null),
    imported: row.imported instanceof Uint8Array ? inflateJson<ImportedOriginal | null>(row.imported, null) : null,
    importId: str(row.import_id),
    sourceKey: str(row.source_key),
    patternTag: str(row.pattern_tag),
    originalMarking: parseJson<QbMarking | null>(row.original_marking, null),
    keyStatus: (str(row.key_status) as QbKeyStatus | null) ?? "none",
    keyStage: (str(row.key_stage) as QbKeyStage | null) ?? null,
    confidence: num(row.confidence),
    flags: cleanFlags(parseJson<unknown>(row.flags, [])),
    fingerprint: str(row.fingerprint),
    minhash: row.minhash instanceof Uint8Array ? row.minhash : null,
    clusterId: str(row.cluster_id),
    createdBy: str(row.created_by),
    createdAt: Number(row.created_at),
    updatedBy: str(row.updated_by),
    updatedAt: Number(row.updated_at),
    approvedBy: str(row.approved_by),
    approvedAt: num(row.approved_at),
    retiredBy: str(row.retired_by),
    retiredAt: num(row.retired_at),
    retireReason: str(row.retire_reason),
  };
}

export function getQuestionRecord(db: DatabaseSync, id: string): QuestionRecord | null {
  const row = db.prepare("SELECT * FROM qb_questions WHERE id = ?").get(id);
  return row ? mapQuestionRow(row) : null;
}

export function getQuestionRecords(db: DatabaseSync, ids: readonly string[]): Map<string, QuestionRecord> {
  const out = new Map<string, QuestionRecord>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    if (chunk.length === 0) continue;
    for (const row of db.prepare(`SELECT * FROM qb_questions WHERE id IN (${placeholders(chunk.length)})`).all(...chunk)) {
      const record = mapQuestionRow(row);
      out.set(record.id, record);
    }
  }
  return out;
}

/** id, n, cluster and status by question number (paper items store `n`). */
export function questionsByN(db: DatabaseSync, ns: readonly number[]): Map<number, { id: string; clusterId: string | null; subject: QbSubject }> {
  const out = new Map<number, { id: string; clusterId: string | null; subject: QbSubject }>();
  const unique = [...new Set(ns)];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    if (chunk.length === 0) continue;
    for (const row of db.prepare(`SELECT id, n, cluster_id, subject FROM qb_questions WHERE n IN (${placeholders(chunk.length)})`).all(...chunk)) {
      out.set(Number(row.n), { id: String(row.id), clusterId: str(row.cluster_id), subject: row.subject as QbSubject });
    }
  }
  return out;
}

export function nextQuestionNumber(db: DatabaseSync): number {
  return Number(db.prepare("SELECT COALESCE(MAX(n), 0) + 1 AS n FROM qb_questions").get()?.n ?? 1);
}

/** The `qb_questions` columns written by services (snake_case → value). */
export type QuestionColumns = Partial<Record<
  | "status"
  | "suspended"
  | "subject"
  | "chapter_id"
  | "ai_chapter_id"
  | "type"
  | "format"
  | "content"
  | "version"
  | "approved_version"
  | "source_kind"
  | "source"
  | "source_exam"
  | "source_year"
  | "source_paper_key"
  | "also_in"
  | "fidelity"
  | "adapted_note"
  | "imported"
  | "import_id"
  | "source_key"
  | "pattern_tag"
  | "original_marking"
  | "key_status"
  | "key_stage"
  | "confidence"
  | "flags"
  | "fingerprint"
  | "minhash"
  | "cluster_id"
  | "updated_by"
  | "updated_at"
  | "approved_by"
  | "approved_at"
  | "retired_by"
  | "retired_at"
  | "retire_reason",
  SQLInputValue
>>;

export type NewQuestionColumns = QuestionColumns & {
  id: string;
  n: number;
  created_by: string | null;
  created_at: number;
  status: QbStatus;
  subject: QbSubject;
  type: QbQuestionType;
  format: QbFormat;
  content: string;
  source_kind: QbSourceKind;
  source: string;
};

export function insertQuestionRow(db: DatabaseSync, columns: NewQuestionColumns): void {
  const values: Record<string, SQLInputValue> = { updated_at: columns.created_at, updated_by: columns.created_by };
  for (const [key, value] of Object.entries(columns)) if (value !== undefined) values[key] = value as SQLInputValue;
  const keys = Object.keys(values);
  db.prepare(`INSERT INTO qb_questions (${keys.join(", ")}) VALUES (${placeholders(keys.length)})`).run(...keys.map((k) => values[k]));
}

export function updateQuestionRow(db: DatabaseSync, id: string, columns: QuestionColumns): void {
  const entries = Object.entries(columns).filter(([, v]) => v !== undefined) as [string, SQLInputValue][];
  if (entries.length === 0) return;
  db.prepare(`UPDATE qb_questions SET ${entries.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...entries.map(([, v]) => v), id);
}

export function encodeImported(value: ImportedOriginal | null): Uint8Array | null {
  return value ? deflateJson(value) : null;
}

// ---------------------------------------------------------------------------------------------
// Per-exam labels

function mapExamRow(row: Record<string, unknown>): QbQuestionExam {
  return {
    exam: row.exam as QbExam,
    eligible: Number(row.eligible) === 1,
    crossExam: Number(row.cross_exam) === 1,
    difficulty: (str(row.difficulty) as QbDifficulty | null) ?? null,
    difficultySource: (str(row.difficulty_source) as QbDifficultySource | null) ?? null,
    aiDifficulty: (str(row.ai_difficulty) as QbDifficulty | null) ?? null,
    aiReason: str(row.ai_reason),
    syllabus: (row.syllabus as QbQuestionExam["syllabus"]) ?? "unchecked",
    expectedTimeSec: num(row.expected_time_sec),
  };
}

export function examRowsFor(db: DatabaseSync, id: string): QbQuestionExam[] {
  return db.prepare("SELECT * FROM qb_question_exams WHERE question_id = ? ORDER BY exam").all(id).map(mapExamRow);
}

export function examRowsForMany(db: DatabaseSync, ids: readonly string[]): Map<string, QbQuestionExam[]> {
  const out = new Map<string, QbQuestionExam[]>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    if (chunk.length === 0) continue;
    for (const row of db
      .prepare(`SELECT * FROM qb_question_exams WHERE question_id IN (${placeholders(chunk.length)}) ORDER BY exam`)
      .all(...chunk)) {
      const id = String(row.question_id);
      const list = out.get(id) ?? [];
      list.push(mapExamRow(row));
      out.set(id, list);
    }
  }
  return out;
}

export interface ExamRowWrite {
  eligible?: boolean;
  crossExam?: boolean;
  difficulty?: QbDifficulty | null;
  difficultySource?: QbDifficultySource | null;
  difficultyBy?: string | null;
  aiDifficulty?: QbDifficulty | null;
  aiReason?: string | null;
  syllabus?: QbQuestionExam["syllabus"];
  syllabusBy?: string | null;
  expectedTimeSec?: number | null;
}

/** Inserts or updates one (question, exam) row; fields left undefined keep their value. */
export function writeExamRow(db: DatabaseSync, id: string, exam: QbExam, fields: ExamRowWrite, now: number): void {
  db.prepare("INSERT OR IGNORE INTO qb_question_exams (question_id, exam) VALUES (?, ?)").run(id, exam);
  const sets: string[] = [];
  const values: SQLInputValue[] = [];
  const put = (column: string, value: SQLInputValue) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (fields.eligible !== undefined) put("eligible", fields.eligible ? 1 : 0);
  if (fields.crossExam !== undefined) put("cross_exam", fields.crossExam ? 1 : 0);
  if (fields.difficulty !== undefined) {
    put("difficulty", fields.difficulty);
    put("difficulty_source", fields.difficulty === null ? null : fields.difficultySource ?? "staff");
    put("difficulty_by", fields.difficultyBy ?? null);
    put("difficulty_at", now);
  }
  if (fields.aiDifficulty !== undefined) put("ai_difficulty", fields.aiDifficulty);
  if (fields.aiReason !== undefined) put("ai_reason", fields.aiReason);
  if (fields.syllabus !== undefined) {
    put("syllabus", fields.syllabus);
    put("syllabus_by", fields.syllabusBy ?? null);
    put("syllabus_at", now);
  }
  if (fields.expectedTimeSec !== undefined) put("expected_time_sec", fields.expectedTimeSec);
  if (sets.length === 0) return;
  db.prepare(`UPDATE qb_question_exams SET ${sets.join(", ")} WHERE question_id = ? AND exam = ?`).run(...values, id, exam);
}

export function deleteExamRow(db: DatabaseSync, id: string, exam: QbExam): void {
  db.prepare("DELETE FROM qb_question_exams WHERE question_id = ? AND exam = ?").run(id, exam);
}

// ---------------------------------------------------------------------------------------------
// Versions (immutable)

export function insertVersion(db: DatabaseSync, id: string, version: number, snapshot: QbSnapshot, actorId: string | null, now: number): void {
  db.prepare("INSERT INTO qb_question_versions (question_id, version, snapshot, created_by, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    version,
    deflateJson(snapshot),
    actorId,
    now,
  );
}

export function loadSnapshot(db: DatabaseSync, id: string, version: number): QbSnapshot | null {
  const row = db.prepare("SELECT snapshot FROM qb_question_versions WHERE question_id = ? AND version = ?").get(id, version);
  if (!row) return null;
  const snapshot = inflateJson<QbSnapshot | null>(row.snapshot, null);
  if (!snapshot) return null;
  return { ...snapshot, content: { ...EMPTY_CONTENT, ...snapshot.content }, passage: snapshot.passage ?? null };
}

export function listVersions(db: DatabaseSync, id: string): { version: number; createdAt: number; createdBy: string | null }[] {
  return db
    .prepare("SELECT version, created_at, created_by FROM qb_question_versions WHERE question_id = ? ORDER BY version")
    .all(id)
    .map((row) => ({ version: Number(row.version), createdAt: Number(row.created_at), createdBy: str(row.created_by) }));
}

// ---------------------------------------------------------------------------------------------
// Events

export type QbEventDetails = Record<string, string | number | boolean | null>;

export function addEvent(db: DatabaseSync, id: string, actorId: string | null, action: string, details: QbEventDetails, now: number): void {
  db.prepare("INSERT INTO qb_events (question_id, at, actor_id, action, details) VALUES (?, ?, ?, ?, ?)").run(
    id,
    now,
    actorId,
    action,
    JSON.stringify(details),
  );
}

export interface QbEventRow {
  id: number;
  at: number;
  actorId: string | null;
  actorName: string | null;
  action: string;
  details: QbEventDetails;
}

export function listEvents(db: DatabaseSync, id: string, limit = 200): QbEventRow[] {
  return db
    .prepare(
      `SELECT e.id, e.at, e.actor_id, e.action, e.details, u.display_name FROM qb_events e
         LEFT JOIN users u ON u.id = e.actor_id WHERE e.question_id = ? ORDER BY e.at DESC, e.id DESC LIMIT ?`,
    )
    .all(id, limit)
    .map((row) => ({
      id: Number(row.id),
      at: Number(row.at),
      actorId: str(row.actor_id),
      actorName: str(row.display_name),
      action: String(row.action),
      details: parseJson<QbEventDetails>(row.details, {}),
    }));
}

// ---------------------------------------------------------------------------------------------
// Sticky flags

/** Adds or removes one flag; returns true when the stored list changed. */
export function setFlag(db: DatabaseSync, id: string, flag: QbFlag, on: boolean): boolean {
  const row = db.prepare("SELECT flags FROM qb_questions WHERE id = ?").get(id);
  if (!row) return false;
  const flags = cleanFlags(parseJson<unknown>(row.flags, []));
  const has = flags.includes(flag);
  if (has === on) return false;
  const next = on ? [...flags, flag] : flags.filter((f) => f !== flag);
  db.prepare("UPDATE qb_questions SET flags = ? WHERE id = ?").run(JSON.stringify(next), id);
  return true;
}
