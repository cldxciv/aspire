import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { inSubjectScope, qbCan } from "./access";
import { createBulkSession, deleteBulkSession, issueViewToken, loadBulkSession, verifySpotChecks, type QbBulkOp } from "./bulk";
import { correctionsFor } from "./corrections";
import { qbDb } from "./db";
import { duplicateViews, pairsFor, refreshDuplicateSignals } from "./dedupe";
import { addVersionFigureRefs, existingFigureIds, setWorkingFigureRefs } from "./figures";
import { sourceLabel, sourceLabelStaff } from "./labels";
import { listItemOf } from "./list-item";
import { contentMathProblems } from "./math-check";
import { originalMarkingFor, patternTagFor } from "./patterns";
import { rewritePoolFor } from "./pool";
import {
  bulkExcludedFlagsOf,
  blockingFlagsOf,
  derivedFlags,
  mergeFlags,
  nextFidelity,
  paperKeyOf,
  questionChanged,
  answersEqual,
  STICKY_FLAGS,
} from "./question-rules";
import { parseJson, placeholders } from "./repo/json";
import {
  addEvent,
  deleteExamRow,
  examRowsFor,
  examRowsForMany,
  getQuestionRecord,
  getQuestionRecords,
  insertQuestionRow,
  insertVersion,
  listEvents,
  listVersions,
  loadSnapshot,
  nextQuestionNumber,
  updateQuestionRow,
  writeExamRow,
  type QbSnapshot,
  type QuestionColumns,
  type QuestionRecord,
} from "./repo/questions";
import { newQuestionId } from "./repo/json";
import { conflict, forbidden, invalid, notFound, ok, type QbResult } from "./result";
import { contentSchema } from "./schemas";
import { indexQuestion, searchQuestionIds } from "./search";
import { approvalSelfPolicy, bumpBankRevision, syllabusRevisionYear } from "./settings";
import { acceptCalibration, dismissCalibration, itemStatsFor } from "./stats";
import { chapterSubject, isOfficialSourceUrl } from "./taxonomy";
import type {
  Bilingual,
  QbDifficulty,
  QbExam,
  QbFlag,
  QbImportMeta,
  QbQuestion,
  QbQuestionContent,
  QbQuestionExam,
  QbSource,
  QbStatus,
  QbSubject,
  QbViewer,
} from "./types";
import { QB_BLOCKING_FLAGS, QB_EXAMS } from "./types";
import {
  QB_CHECKLIST_KEYS,
  type QbBulkCommitResult,
  type QbBulkStartResult,
  type QbDuplicateView,
  type QbQuestionAction,
  type QbQuestionDetail,
  type QbQuestionExamInput,
  type QbQuestionInput,
  type QbQuestionPage,
  type QbQuestionPatch,
} from "./views";

/**
 * Questions (owner: QB-CORE-B; §B2, §B7): drafts, versions, the fidelity diff, flags, the approval
 * checklist, spot-checked bulk approval, suspend / retire / restore. Every service takes the viewer
 * first and re-checks capability and subject scope; writes record a `qb_events` row. Core audit rows
 * are written by the routes (audit.ts).
 *
 * Versioning: `content` is the working copy. A draft keeps version 1 while it is edited. Approval
 * stores an immutable snapshot of the current version and sets `approved_version`. A later content
 * edit opens version n + 1 as a pending edit; papers keep using `approved_version` until that edit is
 * approved. Label edits (chapter within the same subject, per-exam difficulty, syllabus, eligibility)
 * apply live, are evented and rewrite `qb_pool`.
 */

export const QB_QUESTION_QUEUES = ["to_review", "flagged", "calibration", "wrong_key", "hindi"] as const;
export type QbQuestionQueue = (typeof QB_QUESTION_QUEUES)[number];
export type QbQuestionSort = "updated_desc" | "updated_asc" | "number_asc" | "number_desc";

export interface QbQuestionFilters {
  status?: QbStatus | "open";
  subject?: QbSubject;
  chapterId?: string;
  exam?: QbExam;
  difficulty?: QbDifficulty;
  sourceKind?: QbQuestion["source"]["kind"];
  sourceYear?: number;
  paperKey?: string;
  importId?: string;
  flag?: QbFlag;
  flagged?: "with" | "blocking";
  queue?: QbQuestionQueue;
  suspended?: boolean;
  q?: string;
  sort?: QbQuestionSort;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------------------------
// Reads

export function toQbQuestion(db: DatabaseSync, record: QuestionRecord, exams?: QbQuestionExam[]): QbQuestion {
  return {
    id: record.id,
    n: record.n,
    status: record.status,
    suspended: record.suspended,
    version: record.version,
    approvedVersion: record.approvedVersion,
    subject: record.subject,
    chapterId: record.chapterId,
    content: record.content,
    exams: exams ?? examRowsFor(db, record.id),
    source: record.source,
    alsoIn: record.alsoIn,
    fidelity: record.fidelity,
    adaptedNote: record.adaptedNote,
    patternTag: record.patternTag,
    originalMarking: record.originalMarking,
    keyStatus: record.keyStatus,
    keyStage: record.keyStage,
    confidence: record.confidence,
    flags: record.flags,
    clusterId: record.clusterId,
    importId: record.importId,
    stats: itemStatsFor(db, record.id),
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
    approvedBy: record.approvedBy,
    approvedAt: record.approvedAt,
    aiChapterId: record.aiChapterId,
    sourceKey: record.sourceKey,
    retiredAt: record.retiredAt,
    retireReason: record.retireReason,
  };
}

/** The full question (staff shape), or null. */
export function getQuestion(db: DatabaseSync, id: string): QbQuestion | null {
  const record = getQuestionRecord(db, id);
  return record ? toQbQuestion(db, record) : null;
}

export { listItemOf };

function hasPendingEdit(record: QuestionRecord): boolean {
  return record.status === "approved" && record.approvedVersion !== null && record.version > record.approvedVersion;
}

// ---------------------------------------------------------------------------------------------
// Derived state

/**
 * Recomputes a question's derived flags (sticky flags kept), its duplicate signals, the search index
 * and the working copy's figure refs. Returns the fresh record.
 */
export function refreshQuestionState(db: DatabaseSync, id: string, options: { skipDuplicates?: boolean } = {}): QuestionRecord {
  const record = getQuestionRecord(db, id);
  if (!record) throw new Error(`qb: no question ${id}`);
  const exams = examRowsFor(db, id);
  const derived = derivedFlags({
    content: record.content,
    sourceKind: record.sourceKind,
    source: record.source,
    importId: record.importId,
    chapterId: record.chapterId,
    exams,
    keyStatus: record.keyStatus,
    keyStage: record.keyStage,
    fidelity: record.fidelity,
    imported: record.imported,
    mathError: contentMathProblems(record.content).length > 0,
  });
  updateQuestionRow(db, id, { flags: JSON.stringify(mergeFlags(record.flags, derived)) });
  if (!options.skipDuplicates) refreshDuplicateSignals(db, id);
  setWorkingFigureRefs(
    db,
    id,
    record.content.figures.map((f) => f.id),
  );
  const fresh = getQuestionRecord(db, id)!;
  indexQuestion(db, fresh);
  return fresh;
}

// ---------------------------------------------------------------------------------------------
// Approval

function passageFor(db: DatabaseSync, passageId: string | null): QbSnapshot["passage"] {
  if (!passageId) return null;
  const row = db.prepare("SELECT id, content FROM qb_passages WHERE id = ?").get(passageId);
  if (!row) return null;
  const content = parseJson<{ stem?: Bilingual; figures?: QbSnapshot["content"]["figures"] }>(row.content, {});
  return { id: String(row.id), stem: content.stem ?? { en: "", hi: "" }, figures: content.figures ?? [] };
}

function licenceAcknowledged(db: DatabaseSync, importId: string | null): boolean {
  if (!importId) return true;
  const row = db.prepare("SELECT licence_ack_by, licence_ack_at FROM qb_imports WHERE id = ?").get(importId);
  return Boolean(row && row.licence_ack_by && row.licence_ack_at);
}

/** Edits that make a reviewer an author of what is being approved (labels and flag clears do not). */
const AUTHORING_FIELDS = ["content", "source", "adapted_note"];

/**
 * Whether approving would be self-approval: the viewer created the question, made its latest change,
 * or edited its content, source or adapted note at any point since its last approval (an edit by
 * someone else afterwards does not hide it).
 */
/** Stem and option figures need a short English description (alt text) before approval. */
export function figureAltMissing(content: Pick<QbQuestionContent, "figures">): boolean {
  return content.figures.some((f) => f.slot !== "solution" && f.alt.en.trim().length < 3);
}

function isSelfApproval(db: DatabaseSync, record: QuestionRecord, viewer: QbViewer): boolean {
  if (record.createdBy === viewer.userId || record.updatedBy === viewer.userId) return true;
  const last = db.prepare("SELECT MAX(id) AS id FROM qb_events WHERE question_id = ? AND action = 'approved'").get(record.id);
  const since = last?.id === null || last?.id === undefined ? 0 : Number(last.id);
  const rows = db
    .prepare("SELECT action, details FROM qb_events WHERE question_id = ? AND id > ? AND actor_id = ? AND action IN ('created', 'edited')")
    .all(record.id, since, viewer.userId);
  return rows.some((row) => {
    if (row.action === "created") return true;
    const fields = String(parseJson<{ fields?: unknown }>(row.details, {}).fields ?? "").split(",");
    return fields.some((f) => AUTHORING_FIELDS.includes(f));
  });
}

/** The server's own approval check (blocking flags, status, labels, licence, scope, self-approval). */
export function approvalCheck(db: DatabaseSync, record: QuestionRecord, viewer: QbViewer | null): { allowed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!(record.status === "draft" || record.status === "in_review" || hasPendingEdit(record))) blockers.push("status");
  for (const flag of blockingFlagsOf(record.flags)) blockers.push(`flag:${flag}`);
  if (!record.chapterId) blockers.push("chapter");
  if (!licenceAcknowledged(db, record.importId)) blockers.push("licence");
  if (figureAltMissing(record.content)) blockers.push("figure_alt");
  if (viewer) {
    if (!qbCan(viewer, "approve")) blockers.push("role");
    else if (!inSubjectScope(viewer, record.subject)) blockers.push("subject_scope");
    if (approvalSelfPolicy(db) === "second_reviewer" && isSelfApproval(db, record, viewer)) blockers.push("self_approval");
  }
  return { allowed: blockers.length === 0, blockers };
}

function approveRecord(
  db: DatabaseSync,
  viewer: QbViewer,
  record: QuestionRecord,
  now: number,
  details: Record<string, string | number | boolean | null>,
): void {
  const self = isSelfApproval(db, record, viewer);
  let version = record.version;
  const taken = db.prepare("SELECT MAX(version) AS v FROM qb_question_versions WHERE question_id = ?").get(record.id);
  const maxStored = taken?.v === null || taken?.v === undefined ? 0 : Number(taken.v);
  if (version <= maxStored) version = maxStored + 1; // versions are immutable: never overwrite one
  const snapshot: QbSnapshot = {
    content: record.content,
    passage: passageFor(db, record.content.passageId),
    subject: record.subject,
    chapterId: record.chapterId,
    source: record.source,
    fidelity: record.fidelity,
    adaptedNote: record.adaptedNote,
  };
  insertVersion(db, record.id, version, snapshot, viewer.userId, now);
  updateQuestionRow(db, record.id, {
    status: "approved",
    version,
    approved_version: version,
    approved_by: viewer.userId,
    approved_at: now,
    flags: JSON.stringify(record.flags.filter((f) => f !== "low_confidence")),
    updated_at: now,
    updated_by: viewer.userId,
  });
  addVersionFigureRefs(
    db,
    record.id,
    version,
    [...record.content.figures, ...(snapshot.passage?.figures ?? [])].map((f) => f.id),
  );
  rewritePoolFor(db, record.id);
  addEvent(db, record.id, viewer.userId, "approved", { version, self, ...details }, now);
}

// ---------------------------------------------------------------------------------------------
// List

function scopeSubjects(viewer: QbViewer): QbSubject[] {
  if (viewer.role === "admin" || viewer.subjects.length === 0) return [];
  const subjects = new Set<QbSubject>(viewer.subjects);
  if (subjects.has("biology")) {
    subjects.add("botany");
    subjects.add("zoology");
  }
  return [...subjects];
}

const flagLike = (flag: QbFlag) => `%"${flag}"%`;

export function listQuestions(viewer: QbViewer, filters: QbQuestionFilters = {}, db: DatabaseSync = qbDb()): QbResult<QbQuestionPage> {
  if (!qbCan(viewer, "view")) return forbidden();
  const where: string[] = [];
  const values: SQLInputValue[] = [];
  const add = (clause: string, ...params: SQLInputValue[]) => {
    where.push(clause);
    values.push(...params);
  };
  const scope = scopeSubjects(viewer);
  if (scope.length > 0) add(`q.subject IN (${placeholders(scope.length)})`, ...scope);
  if (filters.status === "open") add("q.status IN ('draft', 'in_review')");
  else if (filters.status) add("q.status = ?", filters.status);
  if (filters.subject) add("q.subject = ?", filters.subject);
  if (filters.chapterId) add("q.chapter_id = ?", filters.chapterId);
  if (filters.sourceKind) add("q.source_kind = ?", filters.sourceKind);
  if (filters.sourceYear) add("q.source_year = ?", filters.sourceYear);
  if (filters.paperKey) add("q.source_paper_key = ?", filters.paperKey);
  if (filters.importId) add("q.import_id = ?", filters.importId);
  if (filters.suspended !== undefined) add("q.suspended = ?", filters.suspended ? 1 : 0);
  if (filters.flag) add("q.flags LIKE ?", flagLike(filters.flag));
  if (filters.flagged === "with") add("q.flags <> '[]'");
  if (filters.flagged === "blocking") add(`(${QB_BLOCKING_FLAGS.map(() => "q.flags LIKE ?").join(" OR ")})`, ...QB_BLOCKING_FLAGS.map(flagLike));
  if (filters.exam) {
    if (filters.difficulty) {
      add("EXISTS (SELECT 1 FROM qb_question_exams e WHERE e.question_id = q.id AND e.exam = ? AND e.difficulty = ?)", filters.exam, filters.difficulty);
    } else add("EXISTS (SELECT 1 FROM qb_question_exams e WHERE e.question_id = q.id AND e.exam = ?)", filters.exam);
  }
  switch (filters.queue) {
    case "to_review":
      add("(q.status IN ('draft', 'in_review') OR (q.status = 'approved' AND q.version > q.approved_version))");
      break;
    case "flagged":
      add("q.flags <> '[]' AND q.status NOT IN ('rejected', 'retired')");
      break;
    case "calibration":
      add("EXISTS (SELECT 1 FROM qb_item_stats s WHERE s.question_id = q.id AND s.state = 'suggested')");
      break;
    case "wrong_key":
      add(
        "(q.flags LIKE ? OR EXISTS (SELECT 1 FROM qb_reports r WHERE r.question_id = q.id AND r.status = 'open' AND r.kind = 'wrong_answer'))",
        flagLike("negative_discrimination"),
      );
      break;
    case "hindi":
      add("(q.flags LIKE ? OR q.flags LIKE ?) AND q.status NOT IN ('rejected', 'retired')", flagLike("hi_missing"), flagLike("hi_machine"));
      break;
    default:
      break;
  }
  let search: "fts" | "like" | null = null;
  if (filters.q && filters.q.trim() !== "") {
    const found = searchQuestionIds(db, filters.q, { subjects: filters.subject ? [filters.subject] : scope });
    search = found.mode;
    if (found.ids.length === 0) add("0");
    else add(`q.id IN (${placeholders(found.ids.length)})`, ...found.ids);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const order =
    filters.sort === "updated_asc"
      ? "q.updated_at ASC, q.n ASC"
      : filters.sort === "number_asc"
        ? "q.n ASC"
        : filters.sort === "number_desc"
          ? "q.n DESC"
          : "q.updated_at DESC, q.n DESC";
  const pageSize = Math.max(1, Math.min(100, Math.trunc(filters.pageSize ?? 25)));
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM qb_questions q ${whereSql}`).get(...values)?.n ?? 0);
  const ids = db
    .prepare(`SELECT q.id FROM qb_questions q ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...values, pageSize, (page - 1) * pageSize)
    .map((r) => String(r.id));
  const records = getQuestionRecords(db, ids);
  const exams = examRowsForMany(db, ids);
  const items = ids.map((id) => records.get(id)).filter((r): r is QuestionRecord => r !== undefined).map((r) => listItemOf(r, exams.get(r.id) ?? []));
  return ok({ items, total, page, pageSize, search });
}

// ---------------------------------------------------------------------------------------------
// Detail

function detailOf(db: DatabaseSync, record: QuestionRecord, viewer: QbViewer, spotToken: string | null): QbQuestionDetail {
  const exams = examRowsFor(db, record.id);
  const duplicates: QbDuplicateView[] = duplicateViews(db, pairsFor(db, record.id));
  const versions = listVersions(db, record.id).map((v) => ({ ...v, approved: v.version === record.approvedVersion }));
  const openReports = Number(
    db.prepare("SELECT COUNT(*) AS n FROM qb_reports WHERE question_id = ? AND status = 'open'").get(record.id)?.n ?? 0,
  );
  return {
    question: toQbQuestion(db, record, exams),
    sourceLabel: sourceLabelStaff({ source: record.source, fidelity: record.fidelity, adaptedNote: record.adaptedNote }, "en"),
    publicSourceLabel: sourceLabel({ source: record.source, fidelity: record.fidelity }, "en"),
    passage: passageFor(db, record.content.passageId),
    imported: record.imported ? { stem: record.imported.stem, options: record.imported.options, answer: record.imported.answer } : null,
    events: listEvents(db, record.id),
    versions,
    duplicates,
    corrections: correctionsFor(db, [record.id]).get(record.id) ?? [],
    openReports,
    spotToken,
    approval: approvalCheck(db, record, viewer),
  };
}

/** The question with its history; naming a spot-check batch that sampled it issues a one-time view token. */
export function getQuestionDetail(
  viewer: QbViewer,
  id: string,
  options: { spotCheckBatchId?: string; now?: number } = {},
  db: DatabaseSync = qbDb(),
): QbResult<QbQuestionDetail> {
  if (!qbCan(viewer, "view")) return forbidden();
  const record = getQuestionRecord(db, id);
  if (!record) return notFound("No such question.");
  if (!inSubjectScope(viewer, record.subject)) return forbidden("This question is outside your subjects.");
  const spotToken = options.spotCheckBatchId
    ? issueViewToken(db, options.spotCheckBatchId, viewer.userId, id, options.now ?? Date.now())
    : null;
  return ok(detailOf(db, record, viewer, spotToken));
}

// ---------------------------------------------------------------------------------------------
// Create and edit

function validateContent(content: unknown): { ok: true; content: QbQuestionContent } | { ok: false; fieldErrors: Record<string, string[]> } {
  const parsed = contentSchema.safeParse(content);
  if (parsed.success) return { ok: true, content: parsed.data as QbQuestionContent };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = ["content", ...issue.path.map(String)].join(".");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}

function validateFigures(db: DatabaseSync, content: QbQuestionContent): string[] {
  const ids = content.figures.map((f) => f.id);
  const known = existingFigureIds(db, ids);
  return ids.filter((id) => !known.has(id));
}

function defaultSyllabus(db: DatabaseSync, source: QbSource, exam: QbExam): QbQuestionExam["syllabus"] {
  if (source.kind !== "official" || !source.year || source.exam !== exam) return "unchecked";
  const revision = syllabusRevisionYear(db, exam);
  return revision !== null && source.year >= revision ? "current" : "unchecked";
}

function applyExamInputs(
  db: DatabaseSync,
  id: string,
  inputs: readonly QbQuestionExamInput[],
  options: { viewer: QbViewer; now: number; source: QbSource; replaceAll: boolean; keepRows: boolean },
): boolean {
  const before = JSON.stringify(examRowsFor(db, id));
  const seen = new Set<QbExam>();
  for (const input of inputs) {
    if (!(QB_EXAMS as readonly string[]).includes(input.exam) || seen.has(input.exam)) continue;
    seen.add(input.exam);
    const existing = examRowsFor(db, id).find((e) => e.exam === input.exam);
    writeExamRow(
      db,
      id,
      input.exam,
      {
        eligible: input.eligible,
        crossExam: input.crossExam ?? existing?.crossExam ?? false,
        ...(existing?.difficulty !== input.difficulty || !existing
          ? { difficulty: input.difficulty, difficultySource: "staff" as const, difficultyBy: options.viewer.userId }
          : {}),
        ...(input.syllabus !== undefined && input.syllabus !== existing?.syllabus
          ? { syllabus: input.syllabus, syllabusBy: options.viewer.userId }
          : !existing
            ? { syllabus: defaultSyllabus(db, options.source, input.exam), syllabusBy: null }
            : {}),
        ...(input.expectedTimeSec !== undefined ? { expectedTimeSec: input.expectedTimeSec } : {}),
      },
      options.now,
    );
  }
  if (options.replaceAll) {
    for (const row of examRowsFor(db, id)) {
      if (seen.has(row.exam)) continue;
      if (options.keepRows) writeExamRow(db, id, row.exam, { eligible: false }, options.now);
      else deleteExamRow(db, id, row.exam);
    }
  }
  return JSON.stringify(examRowsFor(db, id)) !== before;
}

/** A source as one comparable line: the paper key (or kind) and the question number. */
function sourceRef(source: QbSource): string {
  const paper = paperKeyOf(source) ?? (source.kind === "aspire" ? `aspire|${source.aspireRef ?? ""}` : source.kind);
  return `${paper}#${source.qno ?? source.questionRef ?? ""}`.slice(0, 200);
}

/** The paper an import was declared for (its metadata), or null for a bank import / unknown import. */
function importPaperKey(db: DatabaseSync, importId: string): string | null {
  const row = db.prepare("SELECT meta FROM qb_imports WHERE id = ?").get(importId);
  if (!row) return null;
  const meta = parseJson<Partial<QbImportMeta>>(row.meta, {});
  if (meta.sourceKind !== "official") return null;
  return paperKeyOf({
    kind: "official",
    exam: meta.exam,
    year: meta.year,
    date: meta.date,
    session: meta.session,
    shift: meta.shift,
    paper: meta.paper,
    booklet: meta.booklet,
  });
}

function cleanSource(source: QbSource): QbSource {
  const out: QbSource = { kind: source.kind };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === "") continue;
    (out as unknown as Record<string, unknown>)[key] = value;
  }
  return out;
}

export function createDraft(viewer: QbViewer, input: QbQuestionInput, now: number, db: DatabaseSync = qbDb()): QbResult<QbQuestionDetail> {
  if (!qbCan(viewer, "edit_draft")) return forbidden();
  const checked = validateContent(input.content);
  if (!checked.ok) return invalid("Please check the highlighted fields.", checked.fieldErrors);
  const content = checked.content;
  if (input.source.kind !== "official" && input.source.kind !== "aspire") {
    return invalid("Choose an official paper or Aspire's own bank as the source.", { "source.kind": ["kind"] });
  }
  const source = cleanSource(input.source);
  let subject: QbSubject | null = null;
  if (input.chapterId) {
    subject = chapterSubject(db, input.chapterId);
    if (!subject) return invalid("Choose an existing chapter.", { chapterId: ["unknown"] });
  } else subject = input.subject ?? null;
  if (!subject) return invalid("Choose a chapter (or at least a subject).", { chapterId: ["required"] });
  if (!inSubjectScope(viewer, subject)) return conflict("subject_scope", "This subject is outside your question-bank subjects.");
  if (!input.exams || input.exams.length === 0) return invalid("Choose at least one exam.", { exams: ["required"] });
  const missingFigures = validateFigures(db, content);
  if (missingFigures.length > 0) return invalid("A figure was not uploaded.", { "content.figures": missingFigures });
  if (source.kind === "official" && source.evidenceUrl && !/^https:\/\//.test(source.evidenceUrl)) {
    return invalid("Use an https link as evidence.", { "source.evidenceUrl": ["https"] });
  }

  const id = newQuestionId();
  const official = source.kind === "official";
  const exam = official ? (source.exam ?? null) : null;
  const columns: QuestionColumns = {
    chapter_id: input.chapterId ?? null,
    approved_version: null,
    source_exam: exam,
    source_year: official ? (source.year ?? null) : null,
    source_paper_key: paperKeyOf(source),
    also_in: "[]",
    fidelity: null,
    adapted_note: input.adaptedNote ? JSON.stringify(input.adaptedNote) : null,
    imported: null,
    import_id: null,
    source_key: null,
    pattern_tag: official && exam ? patternTagFor(exam, source.year) : null,
    original_marking: official && exam ? JSON.stringify(originalMarkingFor(exam, source.year, content.type)) : null,
    key_status: content.answer ? "staff_entered" : "missing",
    key_stage: official ? null : "aspire",
    confidence: null,
    flags: "[]",
  };
  withTx(db, () => {
    insertQuestionRow(db, {
      ...columns,
      id,
      n: nextQuestionNumber(db),
      created_by: viewer.userId,
      created_at: now,
      status: "draft",
      subject: subject!,
      type: content.type,
      format: content.format,
      content: JSON.stringify(content),
      source_kind: source.kind,
      source: JSON.stringify(source),
      version: 1,
    });
    applyExamInputs(db, id, input.exams, { viewer, now, source, replaceAll: false, keepRows: false });
    addEvent(db, id, viewer.userId, "created", { sourceKind: source.kind }, now);
    refreshQuestionState(db, id);
  });
  return ok(detailOf(db, getQuestionRecord(db, id)!, viewer, null));
}

function withTx<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

/** Edits the working copy and / or labels (see the module comment for what applies live). */
export function updateQuestion(
  viewer: QbViewer,
  id: string,
  patch: QbQuestionPatch,
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbQuestionDetail> {
  const record = getQuestionRecord(db, id);
  if (!record) return notFound("No such question.");
  if (!qbCan(viewer, "edit_draft")) return forbidden();
  if (!inSubjectScope(viewer, record.subject)) return conflict("subject_scope", "This question is outside your question-bank subjects.");
  if (record.status === "rejected" || record.status === "retired") {
    return conflict("not_allowed_in_status", "Restore the question before editing it.");
  }
  const base = patch.baseUpdatedAt ?? patch.expectedUpdatedAt;
  if (base !== undefined && base !== record.updatedAt) return conflict("stale", "Someone changed this question meanwhile. Reload it.");
  if (patch.baseVersion !== undefined && patch.baseVersion !== record.version) return conflict("stale", "Someone changed this question meanwhile. Reload it.");
  const live = record.status === "approved";
  const labelsChanging = patch.chapterId !== undefined || patch.exams !== undefined;
  if (live && labelsChanging && !qbCan(viewer, "set_labels", record.subject)) return forbidden("Only reviewers change the labels of approved questions.");
  if (patch.source && record.sourceKind === "official" && viewer.role === "author") {
    return forbidden("Authors cannot change an official question's source.");
  }

  let content = record.content;
  if (patch.content) {
    const checked = validateContent(patch.content);
    if (!checked.ok) return invalid("Please check the highlighted fields.", checked.fieldErrors);
    content = checked.content;
    const missingFigures = validateFigures(db, content);
    if (missingFigures.length > 0) return invalid("A figure was not uploaded.", { "content.figures": missingFigures });
  }
  const contentChanged = patch.content !== undefined && JSON.stringify(content) !== JSON.stringify(record.content);
  const studentVisibleChange = contentChanged && questionChanged(record.content, content);

  let subject = record.subject;
  let chapterId = record.chapterId;
  if (patch.chapterId !== undefined) {
    chapterId = patch.chapterId;
    if (chapterId) {
      const derived = chapterSubject(db, chapterId);
      if (!derived) return invalid("Choose an existing chapter.", { chapterId: ["unknown"] });
      if (live) {
        const snapshot = record.approvedVersion ? loadSnapshot(db, id, record.approvedVersion) : null;
        if (snapshot && snapshot.subject !== derived) {
          return conflict("subject_mismatch", "An approved question can only move to a chapter of the same subject.");
        }
      }
      subject = derived;
      if (!inSubjectScope(viewer, subject)) return conflict("subject_scope", "That chapter is outside your question-bank subjects.");
    }
  }

  let source = record.source;
  let sourceTrail: Record<string, string> = {};
  let importSourceMismatch = false;
  if (patch.source) {
    if (patch.source.kind !== record.sourceKind) return invalid("The source kind cannot change.", { "source.kind": ["fixed"] });
    source = cleanSource({ ...patch.source, importId: record.source.importId });
    // Every re-attribution leaves a trace: the paper and question number before and after.
    const before = sourceRef(record.source);
    const after = sourceRef(source);
    if (before !== after) sourceTrail = { sourceBefore: before, sourceAfter: after };
    // An imported official question keeps the paper its import was declared for: pointing it at another
    // paper sets the blocking `source_mismatch` until a reviewer clears it with a note.
    if (record.sourceKind === "official" && record.importId) {
      const declared = importPaperKey(db, record.importId);
      if (declared !== null && paperKeyOf(source) !== declared && !record.flags.includes("source_mismatch")) importSourceMismatch = true;
    }
  }

  const columns: QuestionColumns = { updated_at: now, updated_by: viewer.userId };
  let version = record.version;
  if (contentChanged) {
    if (live && record.approvedVersion === record.version) version = record.version + 1;
    columns.content = JSON.stringify(content);
    columns.type = content.type;
    columns.format = content.format;
    columns.version = version;
    if (record.sourceKind !== "official") columns.key_status = content.answer ? "staff_entered" : "missing";
    else if (!answersEqual(content.answer, record.content.answer)) {
      // A hand-changed official key is no longer the matched official key.
      if (record.keyStage === "final" || record.keyStage === "staff_verified" || record.keyStage === "provisional") columns.key_stage = null;
      columns.key_status = content.answer ? "staff_entered" : "missing";
    }
  }
  if (patch.chapterId !== undefined) {
    columns.chapter_id = chapterId;
    columns.subject = subject;
  }
  if (patch.source) {
    columns.source = JSON.stringify(source);
    if (record.sourceKind === "official") {
      columns.source_exam = source.exam ?? null;
      columns.source_year = source.year ?? null;
      columns.source_paper_key = paperKeyOf(source);
      if (source.exam) {
        columns.pattern_tag = patternTagFor(source.exam, source.year);
        columns.original_marking = JSON.stringify(originalMarkingFor(source.exam, source.year, content.type));
      }
    }
  }
  if (patch.adaptedNote !== undefined) columns.adapted_note = patch.adaptedNote ? JSON.stringify(patch.adaptedNote) : null;
  if (importSourceMismatch) columns.flags = JSON.stringify([...record.flags, "source_mismatch"]);
  const fidelity = nextFidelity({
    official: record.sourceKind === "official",
    previous: record.fidelity,
    content,
    imported: record.imported,
    questionChangedNow: studentVisibleChange,
  });
  if (fidelity !== record.fidelity) columns.fidelity = fidelity;

  let labelsChanged = false;
  withTx(db, () => {
    updateQuestionRow(db, id, columns);
    if (patch.exams) {
      labelsChanged = applyExamInputs(db, id, patch.exams, { viewer, now, source, replaceAll: true, keepRows: live });
    }
    labelsChanged = labelsChanged || (patch.chapterId !== undefined && chapterId !== record.chapterId);
    const fields = [
      contentChanged ? "content" : null,
      patch.chapterId !== undefined && chapterId !== record.chapterId ? "chapter" : null,
      patch.exams ? "exams" : null,
      patch.source ? "source" : null,
      patch.adaptedNote !== undefined ? "adapted_note" : null,
    ].filter(Boolean);
    addEvent(
      db,
      id,
      viewer.userId,
      "edited",
      {
        fields: fields.join(","),
        version,
        ...(fidelity !== record.fidelity ? { fidelity: fidelity ?? "undecided" } : {}),
        ...sourceTrail,
        ...(importSourceMismatch ? { sourceMismatch: true } : {}),
      },
      now,
    );
    refreshQuestionState(db, id, { skipDuplicates: !contentChanged });
    if (live && labelsChanged) {
      rewritePoolFor(db, id);
      bumpBankRevision(db, now);
    }
  });
  return ok(detailOf(db, getQuestionRecord(db, id)!, viewer, null));
}

// ---------------------------------------------------------------------------------------------
// Actions

function checklistComplete(checklist: Partial<Record<string, boolean>> | undefined): string[] {
  return QB_CHECKLIST_KEYS.filter((key) => checklist?.[key] !== true);
}

export function questionAction(
  viewer: QbViewer,
  id: string,
  action: QbQuestionAction,
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbQuestionDetail> {
  const record = getQuestionRecord(db, id);
  if (!record) return notFound("No such question.");
  if (!inSubjectScope(viewer, record.subject)) return conflict("subject_scope", "This question is outside your question-bank subjects.");
  const done = () => ok(detailOf(db, getQuestionRecord(db, id)!, viewer, null));
  const status = (s: QbStatus) => updateQuestionRow(db, id, { status: s, updated_at: now, updated_by: viewer.userId });

  switch (action.action) {
    case "submit": {
      if (!qbCan(viewer, "edit_draft", record.subject)) return forbidden();
      if (record.status !== "draft") return conflict("not_allowed_in_status", "Only drafts can be sent for review.");
      status("in_review");
      addEvent(db, id, viewer.userId, "submitted", {}, now);
      return done();
    }
    case "return_to_draft": {
      if (!qbCan(viewer, "approve", record.subject)) return forbidden();
      if (record.status !== "in_review") return conflict("not_allowed_in_status", "Only questions in review can go back to draft.");
      status("draft");
      addEvent(db, id, viewer.userId, "returned_to_draft", { note: action.note?.slice(0, 200) ?? null }, now);
      return done();
    }
    case "approve": {
      if (!qbCan(viewer, "approve", record.subject)) return forbidden();
      const missing = checklistComplete(action.checklist);
      if (missing.length > 0) return invalid("Tick every item of the approval checklist.", { checklist: missing });
      return withTxResult(db, () => {
        // The checklist's "in the current syllabus" tick confirms each eligible exam.
        for (const exam of examRowsFor(db, id)) {
          if (exam.eligible && exam.syllabus === "unchecked") writeExamRow(db, id, exam.exam, { syllabus: "current", syllabusBy: viewer.userId }, now);
        }
        const fresh = refreshQuestionState(db, id, { skipDuplicates: true });
        const check = approvalCheck(db, fresh, viewer);
        if (!check.allowed) {
          if (check.blockers.includes("self_approval")) {
            throw new ApprovalRefused(conflict("self_approval", "A second reviewer must approve questions you wrote or edited."));
          }
          throw new ApprovalRefused(conflict("blocking_flags", `Approval is blocked: ${check.blockers.join(", ")}.`));
        }
        approveRecord(db, viewer, fresh, now, { note: action.note?.slice(0, 200) ?? null });
        bumpBankRevision(db, now);
        return done();
      });
    }
    case "reject": {
      if (!qbCan(viewer, "approve", record.subject)) return forbidden();
      if (hasPendingEdit(record)) {
        // Rejecting a pending edit restores the approved version as the working copy.
        const snapshot = loadSnapshot(db, id, record.approvedVersion!);
        if (!snapshot) return conflict("stale", "The approved version is missing.");
        updateQuestionRow(db, id, {
          content: JSON.stringify(snapshot.content),
          type: snapshot.content.type,
          format: snapshot.content.format,
          version: record.approvedVersion!,
          fidelity: snapshot.fidelity,
          adapted_note: snapshot.adaptedNote ? JSON.stringify(snapshot.adaptedNote) : null,
          updated_at: now,
          updated_by: viewer.userId,
        });
        addEvent(db, id, viewer.userId, "edit_rejected", { version: record.version, reason: action.reason.slice(0, 200) }, now);
        refreshQuestionState(db, id);
        return done();
      }
      if (record.status !== "draft" && record.status !== "in_review") return conflict("not_allowed_in_status", "Only drafts and questions in review can be rejected.");
      status("rejected");
      addEvent(db, id, viewer.userId, "rejected", { reason: action.reason.slice(0, 200) }, now);
      refreshQuestionState(db, id);
      return done();
    }
    case "restore": {
      if (!qbCan(viewer, "approve", record.subject)) return forbidden();
      if (record.status !== "rejected") return conflict("not_allowed_in_status", "Only rejected questions can be restored (retirement is permanent).");
      status("draft");
      addEvent(db, id, viewer.userId, "restored", {}, now);
      refreshQuestionState(db, id);
      return done();
    }
    case "suspend":
    case "unsuspend": {
      if (!qbCan(viewer, "retire", record.subject)) return forbidden();
      if (record.status !== "approved") return conflict("not_allowed_in_status", "Only approved questions can be suspended.");
      const suspend = action.action === "suspend";
      if (record.suspended === suspend) return conflict("stale", suspend ? "Already suspended." : "Not suspended.");
      updateQuestionRow(db, id, { suspended: suspend ? 1 : 0, updated_at: now, updated_by: viewer.userId });
      addEvent(db, id, viewer.userId, action.action === "suspend" ? "suspended" : "unsuspended", action.action === "suspend" ? { reason: action.reason.slice(0, 200) } : {}, now);
      rewritePoolFor(db, id);
      bumpBankRevision(db, now);
      return done();
    }
    case "retire": {
      if (!qbCan(viewer, "retire", record.subject)) return forbidden();
      if (record.status === "retired") return conflict("not_allowed_in_status", "Already retired.");
      if (!action.reason || action.reason.trim().length < 3) return invalid("Say why the question is retired.", { reason: ["required"] });
      updateQuestionRow(db, id, {
        status: "retired",
        retired_by: viewer.userId,
        retired_at: now,
        retire_reason: action.reason.trim().slice(0, 500),
        updated_at: now,
        updated_by: viewer.userId,
      });
      addEvent(db, id, viewer.userId, "retired", { reason: action.reason.slice(0, 200) }, now);
      rewritePoolFor(db, id);
      bumpBankRevision(db, now);
      refreshQuestionState(db, id);
      return done();
    }
    case "set_fidelity": {
      if (!qbCan(viewer, "approve", record.subject)) return forbidden();
      if (record.sourceKind !== "official" || !record.imported) return invalid("Only imported official questions have a fidelity decision.");
      const finalKey = record.imported.officialKeyStage === "final" ? record.imported.officialAnswer ?? null : null;
      if (action.fidelity === "transcription_fixed" && finalKey && record.content.answer && !answersEqual(record.content.answer, finalKey)) {
        return conflict("fidelity_answer_differs", "The answer differs from the official final key, so the question is adapted.");
      }
      const note = action.adaptedNote ?? action.note;
      if (action.fidelity === "adapted" && !note?.en.trim()) return invalid("Describe how Aspire adapted the question.", { adaptedNote: ["required"] });
      updateQuestionRow(db, id, {
        fidelity: action.fidelity,
        ...(action.fidelity === "adapted" ? { adapted_note: JSON.stringify(note) } : {}),
        updated_at: now,
        updated_by: viewer.userId,
      });
      addEvent(db, id, viewer.userId, "fidelity_set", { fidelity: action.fidelity }, now);
      refreshQuestionState(db, id, { skipDuplicates: true });
      return done();
    }
    case "set_key_stage":
    case "verify_key": {
      if (!qbCan(viewer, "approve", record.subject)) return forbidden();
      if (record.sourceKind !== "official") return invalid("Only official questions have a key stage.");
      if (!record.content.answer) return invalid("Enter the answer first.");
      if (record.keyStatus === "dropped" || record.keyStatus === "multiple_accepted") {
        return conflict("blocking_flags", "Dropped and multiple-answer official questions are never used in mocks.");
      }
      if (!action.note || action.note.trim().length < 3) return invalid("Say how the answer was verified.", { note: ["required"] });
      updateQuestionRow(db, id, {
        key_stage: "staff_verified",
        key_status: record.keyStatus === "matched" ? "matched" : "staff_entered",
        updated_at: now,
        updated_by: viewer.userId,
      });
      addEvent(db, id, viewer.userId, "key_verified", { note: action.note.trim().slice(0, 200) }, now);
      refreshQuestionState(db, id, { skipDuplicates: true });
      return done();
    }
    case "clear_flag": {
      if (!STICKY_FLAGS.includes(action.flag)) return invalid("This flag clears itself when the question is fixed.");
      if (action.flag === "exact_duplicate" || action.flag === "near_duplicate") {
        return invalid("Decide the duplicate pair instead (duplicate, variant or distinct).");
      }
      if (action.flag === "third_party_source") {
        if (viewer.role !== "admin") return forbidden("Only an admin can clear a third-party source flag.");
        if (!action.officialUrl || !isOfficialSourceUrl(action.officialUrl)) {
          return invalid("Give the official URL the file came from.", { officialUrl: ["official_only"] });
        }
      } else if (!qbCan(viewer, "approve", record.subject)) return forbidden();
      if (!action.note || action.note.trim().length < 3) return invalid("Add a note.", { note: ["required"] });
      if (!record.flags.includes(action.flag)) return conflict("stale", "That flag is not set.");
      updateQuestionRow(db, id, { flags: JSON.stringify(record.flags.filter((f) => f !== action.flag)), updated_at: now, updated_by: viewer.userId });
      addEvent(
        db,
        id,
        viewer.userId,
        "flag_cleared",
        { flag: action.flag, note: action.note.trim().slice(0, 200), officialUrl: action.officialUrl ?? null },
        now,
      );
      return done();
    }
    case "accept_calibration":
    case "dismiss_calibration": {
      const result = action.action === "accept_calibration" ? acceptCalibration(viewer, id, action.exam, now, db) : dismissCalibration(viewer, id, action.exam, now, db);
      if (!result.ok) return { ok: false, error: result.error, message: result.message, ...(result.code ? { code: result.code } : {}) };
      return done();
    }
    default:
      return invalid("Unknown action.");
  }
}

class ApprovalRefused extends Error {
  constructor(readonly result: QbResult<never>) {
    super("approval refused");
  }
}

/** A transaction whose refusal (ApprovalRefused) rolls back and becomes the result. */
function withTxResult<T>(db: DatabaseSync, fn: () => QbResult<T>): QbResult<T> {
  try {
    return withTx(db, fn);
  } catch (error) {
    if (error instanceof ApprovalRefused) return error.result as QbResult<T>;
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Bulk approval (spot-checked)

function bulkApproveSkipReason(db: DatabaseSync, viewer: QbViewer, record: QuestionRecord | undefined): string | null {
  if (!record) return "not_found";
  if (!qbCan(viewer, "approve", record.subject)) return "subject_scope";
  if (!(record.status === "draft" || record.status === "in_review" || hasPendingEdit(record))) return "status";
  const excluded = bulkExcludedFlagsOf(record.flags);
  if (excluded.length > 0) return `flag:${excluded[0]}`;
  const check = approvalCheck(db, record, viewer);
  return check.allowed ? null : check.blockers[0] ?? "blocked";
}

export function bulkApproveStart(
  viewer: QbViewer,
  input: { op: QbBulkOp; ids: string[]; exam: QbExam | null },
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbBulkStartResult> {
  if (input.op !== "approve") return invalid("Use the bulk label actions for this operation.");
  if (!qbCan(viewer, "approve")) return forbidden();
  const ids = [...new Set(input.ids)].slice(0, 200);
  if (ids.length === 0) return invalid("Choose questions.", { ids: ["required"] });
  const records = getQuestionRecords(db, ids);
  const eligible: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const reason = bulkApproveSkipReason(db, viewer, records.get(id));
    if (reason) skipped.push({ id, reason });
    else eligible.push(id);
  }
  if (eligible.length === 0) return invalid("None of these questions can be approved in bulk.", { ids: skipped.map((s) => `${s.id}:${s.reason}`) });
  const session = createBulkSession(db, { op: "approve", exam: null, viewerId: viewer.userId, eligible, now });
  return ok({ batchId: session.id, op: "approve", exam: null, eligible, skipped, sample: session.sample, expiresAt: session.expiresAt });
}

export function bulkApproveCommit(
  viewer: QbViewer,
  input: { op: QbBulkOp; batchId: string; checks: { id: string; token: string; ok: boolean }[] },
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbBulkCommitResult> {
  if (!qbCan(viewer, "approve")) return forbidden();
  const session = loadBulkSession(db, input.batchId, viewer.userId, now);
  if (!session || session.op !== "approve") return conflict("batch_expired", "This bulk approval expired or does not exist. Start again.");
  const verdict = verifySpotChecks(session, input.checks);
  if (!verdict.ok && verdict.reason === "failed") {
    deleteBulkSession(db, session.id);
    addEvent(db, verdict.failedId, viewer.userId, "spot_check_failed", { batch: session.id, size: session.eligible.length }, now);
    return ok({ outcome: "aborted", op: "approve", failedId: verdict.failedId, sample: session.sample });
  }
  if (!verdict.ok) return conflict("spot_check_incomplete", `Open and check every sampled question first (${verdict.missing.length} left).`);
  const approved: string[] = [];
  withTx(db, () => {
    const records = getQuestionRecords(db, session.eligible);
    for (const id of session.eligible) {
      const record = records.get(id);
      if (!record) continue;
      const fresh = refreshQuestionState(db, id, { skipDuplicates: true });
      if (bulkApproveSkipReason(db, viewer, fresh) !== null) continue; // changed since the batch started
      approveRecord(db, viewer, fresh, now, { bulk: session.id, sample: session.sample.length });
      addEvent(db, id, viewer.userId, "bulk_approve", { batch: session.id, sampled: session.sample.includes(id) }, now);
      approved.push(id);
    }
    if (approved.length > 0) bumpBankRevision(db, now);
    deleteBulkSession(db, session.id);
  });
  return ok({ outcome: "done", op: "approve", count: approved.length, ids: approved, sample: session.sample });
}

export function bulkCancel(viewer: QbViewer, input: { op: QbBulkOp; batchId: string }, now: number, db: DatabaseSync = qbDb()): QbResult<{ cancelled: true }> {
  const session = loadBulkSession(db, input.batchId, viewer.userId, now);
  if (!session) return notFound("No such bulk action.");
  deleteBulkSession(db, session.id);
  return ok({ cancelled: true });
}

/** Ids of questions whose blocking flags are exactly `flags` (diagnostics). */
export function blockingFlagSummary(record: QuestionRecord): QbFlag[] {
  return blockingFlagsOf(record.flags);
}
