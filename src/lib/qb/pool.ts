import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getChapter, chapterMap } from "./taxonomy";
import { examRowsFor, getQuestionRecord, loadSnapshot } from "./repo/questions";
import { placeholders } from "./repo/json";
import { bankRevision, syllabusRevisionYear } from "./settings";
import { computeChapterWeights, computeFormatTargets, type OfficialQuestionRecord } from "./weights";
import type { QbBlueprint, QbChapterWeights, QbExam, QbFormatTargets, QbLevel, QbPoolItem, QbSubject } from "./types";
import { NEAR_CLUSTER_THRESHOLD } from "./fingerprint";

/**
 * The generator's pool (owner: QB-CORE-B; §B4, §B9.1).
 *
 * `qb_pool` is the ONLY table the generator reads. A question's rows are rewritten on approval,
 * suspension, retirement and every live label change, always FROM THE APPROVED SNAPSHOT (content,
 * type, the integer rule, passage, source) plus the live labels (chapter of the same subject, per-exam
 * difficulty, eligibility, cross-exam). A pending working-copy edit never changes what is served.
 * Only (question, exam) pairs that are eligible, have a difficulty and a `current` syllabus check get
 * a row. At load time the chapter must be active and current for the exam.
 *
 * Loaded pools are cached per (connection, exam, bank.revision), refreshed every 10 minutes for
 * exposure counts.
 */

/** Rewrites one question's pool rows; returns how many rows it now has. */
export function rewritePoolFor(db: DatabaseSync, questionId: string): number {
  db.prepare("DELETE FROM qb_pool WHERE question_id = ?").run(questionId);
  const record = getQuestionRecord(db, questionId);
  if (!record || record.status !== "approved" || record.suspended || record.approvedVersion === null) return 0;
  const snapshot = loadSnapshot(db, questionId, record.approvedVersion);
  if (!snapshot || !record.chapterId) return 0;
  const chapter = getChapter(db, record.chapterId);
  if (!chapter || chapter.subject !== snapshot.subject) return 0;
  const content = snapshot.content;
  const answer = content.answer;
  const integer = answer?.kind === "numerical" && answer.integer ? 1 : 0;
  const hiOk = (content.hiSource === "official" || content.hiSource === "staff") && content.stem.hi.trim() !== "" ? 1 : 0;
  const sourceExam = snapshot.source.exam ?? null;
  const insert = db.prepare(
    `INSERT OR REPLACE INTO qb_pool (question_id, exam, n, version, subject, chapter_id, level, type, format, answer_integer,
       passage_id, passage_order, difficulty, source_kind, source_year, cross_exam, hi_ok, cluster_id, has_figures, adapted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let rows = 0;
  for (const exam of examRowsFor(db, questionId)) {
    if (!exam.eligible || !exam.difficulty || exam.syllabus !== "current") continue;
    const cross = exam.crossExam || (snapshot.source.kind === "official" && sourceExam !== null && sourceExam !== exam.exam);
    insert.run(
      questionId,
      exam.exam,
      record.n,
      record.approvedVersion,
      snapshot.subject,
      chapter.id,
      chapter.level,
      content.type,
      content.format,
      integer,
      content.passageId,
      content.passageOrder,
      exam.difficulty,
      snapshot.source.kind,
      snapshot.source.year ?? null,
      cross ? 1 : 0,
      hiOk,
      record.clusterId ?? questionId,
      content.figures.length > 0 ? 1 : 0,
      snapshot.fidelity === "adapted" ? 1 : 0,
    );
    rows += 1;
  }
  return rows;
}

export function rewritePoolForMany(db: DatabaseSync, ids: readonly string[]): void {
  for (const id of new Set(ids)) rewritePoolFor(db, id);
}

// ---------------------------------------------------------------------------------------------
// Clusters

/**
 * Effective clusters: a question's own cluster (or its id), merged with every question it has an
 * OPEN exact pair with, or an open near pair at or above 0.9 (§B7), until a reviewer decides.
 */
export function clusterResolver(db: DatabaseSync): (questionId: string, clusterId: string) => string {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.has(cur) && parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  const clusterOf = new Map<string, string>();
  for (const row of db.prepare("SELECT id, cluster_id FROM qb_questions WHERE cluster_id IS NOT NULL").all()) {
    clusterOf.set(String(row.id), String(row.cluster_id));
  }
  const key = (id: string) => clusterOf.get(id) ?? id;
  const pairs = db
    .prepare("SELECT a, b, kind, score FROM qb_dup_pairs WHERE status = 'open' AND (kind = 'exact' OR score >= ?)")
    .all(NEAR_CLUSTER_THRESHOLD);
  for (const pair of pairs) union(key(String(pair.a)), key(String(pair.b)));
  return (questionId, clusterId) => find(clusterOf.get(questionId) ?? clusterId);
}

// ---------------------------------------------------------------------------------------------
// Loading

interface CacheEntry {
  key: string;
  items: QbPoolItem[];
}

const poolCache = new WeakMap<DatabaseSync, Map<QbExam, CacheEntry>>();
const EXPOSURE_REFRESH_MS = 10 * 60 * 1000;

export function clearPoolCacheForTests(db?: DatabaseSync): void {
  if (db) poolCache.delete(db);
}

function readPool(db: DatabaseSync, exam: QbExam): QbPoolItem[] {
  const chapters = chapterMap(db);
  const exposures = new Map<string, number>();
  for (const row of db.prepare("SELECT question_id, exposures FROM qb_item_stats WHERE exam = ?").all(exam)) {
    exposures.set(String(row.question_id), Number(row.exposures));
  }
  const resolve = clusterResolver(db);
  const items: QbPoolItem[] = [];
  for (const row of db.prepare("SELECT * FROM qb_pool WHERE exam = ? ORDER BY n").all(exam)) {
    const chapter = chapters.get(String(row.chapter_id));
    if (!chapter || !chapter.active || chapter.examStatus[exam] !== "current") continue;
    const id = String(row.question_id);
    items.push({
      id,
      n: Number(row.n),
      version: Number(row.version),
      subject: row.subject as QbSubject,
      chapterId: chapter.id,
      level: chapter.level as QbLevel,
      type: row.type as QbPoolItem["type"],
      format: row.format as QbPoolItem["format"],
      integer: Number(row.answer_integer) === 1,
      difficulty: row.difficulty as QbPoolItem["difficulty"],
      sourceKind: row.source_kind as QbPoolItem["sourceKind"],
      sourceYear: row.source_year === null ? null : Number(row.source_year),
      crossExam: Number(row.cross_exam) === 1,
      hiOk: Number(row.hi_ok) === 1,
      clusterId: resolve(id, String(row.cluster_id)),
      passageId: row.passage_id === null ? null : String(row.passage_id),
      passageOrder: row.passage_order === null ? null : Number(row.passage_order),
      exposures: exposures.get(id) ?? 0,
      adapted: Number(row.adapted) === 1,
    });
  }
  return items;
}

/** Every servable pool item of an exam (before blueprint rules), cached per bank revision. */
export function loadExamPool(db: DatabaseSync, exam: QbExam, now: number): QbPoolItem[] {
  const key = `${bankRevision(db)}|${Math.floor(now / EXPOSURE_REFRESH_MS)}`;
  let perDb = poolCache.get(db);
  if (!perDb) poolCache.set(db, (perDb = new Map()));
  const cached = perDb.get(exam);
  if (cached && cached.key === key) return cached.items;
  const items = readPool(db, exam);
  perDb.set(exam, { key, items });
  return items;
}

// ---------------------------------------------------------------------------------------------
// Weights (cached per revision and blueprint)

export interface BlueprintWeights {
  weights: QbChapterWeights;
  formatTargets: QbFormatTargets;
  meta: ReturnType<typeof computeChapterWeights>["meta"];
}

const weightCache = new WeakMap<DatabaseSync, Map<string, BlueprintWeights>>();

/** Official questions of an exam with a chapter (staff chapter, else the AI suggestion), rejected rows excluded. */
export function officialRecords(db: DatabaseSync, exam: QbExam): OfficialQuestionRecord[] {
  const chapters = chapterMap(db);
  const rows = db
    .prepare(
      `SELECT chapter_id, ai_chapter_id, source_paper_key, source_year, type, format, content FROM qb_questions
        WHERE source_kind = 'official' AND source_exam = ? AND status <> 'rejected'
          AND source_paper_key IS NOT NULL AND source_year IS NOT NULL`,
    )
    .all(exam);
  const records: OfficialQuestionRecord[] = [];
  for (const row of rows) {
    const staffChapter = row.chapter_id === null ? null : String(row.chapter_id);
    const chapterId = staffChapter ?? (row.ai_chapter_id === null ? null : String(row.ai_chapter_id));
    if (!chapterId) continue;
    const chapter = chapters.get(chapterId);
    if (!chapter) continue;
    let integer: boolean | undefined;
    try {
      const answer = (JSON.parse(String(row.content)) as { answer?: { kind?: string; integer?: boolean } | null }).answer;
      if (answer?.kind === "numerical") integer = Boolean(answer.integer);
    } catch {
      integer = undefined;
    }
    records.push({
      subject: chapter.subject,
      chapterId,
      paperKey: String(row.source_paper_key),
      year: Number(row.source_year),
      fromAi: staffChapter === null,
      type: row.type as OfficialQuestionRecord["type"],
      format: row.format as OfficialQuestionRecord["format"],
      integer,
    });
  }
  return records;
}

export function weightsFor(db: DatabaseSync, blueprint: QbBlueprint, now: number): BlueprintWeights {
  const key = `${blueprint.id}|${bankRevision(db)}|${JSON.stringify(blueprint.chapterWeights)}`;
  let perDb = weightCache.get(db);
  if (!perDb) weightCache.set(db, (perDb = new Map()));
  const cached = perDb.get(key);
  if (cached) return cached;
  const pool = loadExamPool(db, blueprint.exam, now);
  const eligibleChapters: Partial<Record<QbSubject, string[]>> = {};
  for (const item of pool) {
    if (!blueprint.chapterLevels.includes(item.level)) continue;
    const list = (eligibleChapters[item.subject] ??= []);
    if (!list.includes(item.chapterId)) list.push(item.chapterId);
  }
  const records = officialRecords(db, blueprint.exam);
  const revisionYear = syllabusRevisionYear(db, blueprint.exam);
  const currentYear = new Date(now).getUTCFullYear();
  const result = computeChapterWeights({
    records,
    eligibleChapters,
    settings: blueprint.chapterWeights,
    syllabusRevisionYear: revisionYear,
    currentYear,
  });
  const formatTargets = computeFormatTargets({ blueprint, records, syllabusRevisionYear: revisionYear, currentYear });
  const value = { weights: result.weights, formatTargets, meta: result.meta };
  if (perDb.size > 50) perDb.clear();
  perDb.set(key, value);
  return value;
}

/** Ids of pool rows by question number (paper items → questions). */
export function poolQuestionIds(db: DatabaseSync, exam: QbExam, ns: readonly number[]): Map<number, string> {
  const out = new Map<number, string>();
  if (ns.length === 0) return out;
  for (const row of db.prepare(`SELECT n, question_id FROM qb_pool WHERE exam = ? AND n IN (${placeholders(ns.length)})`).all(exam, ...ns)) {
    out.set(Number(row.n), String(row.question_id));
  }
  return out;
}
