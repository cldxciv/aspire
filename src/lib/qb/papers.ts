import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { ATTEMPT_TIMING, minDurationMs } from "@/lib/mocktest/timing";

import { getBlueprintById, getPublishedBlueprint, publishedBlueprints } from "./blueprints";
import { correctionsFor, effectiveKey } from "./corrections";
import { qbDb } from "./db";
import { compositionOf, eligibleForBlueprint, generatePaper, readiness as computeReadiness, type GeneratedPart } from "./generator";
import { unpackItems, type PackedItem } from "./items-pack";
import { sourceLabelBilingual } from "./labels";
import { blueprintTestId, blueprintTotals } from "./patterns";
import { loadExamPool, weightsFor } from "./pool";
import { parseJson, placeholders } from "./repo/json";
import { loadSnapshot, questionsByN, type QbSnapshot } from "./repo/questions";
import { recordStudentReport } from "./reports";
import { bankRevision } from "./settings";
import { accumulateOutcome, addExposures, type QbOutcome } from "./stats";
import type {
  Bilingual,
  QbBlueprint,
  QbBlueprintSection,
  QbDifficulty,
  QbExam,
  QbPaperComposition,
  QbPaperKind,
  QbPaperRef,
  QbPaperView,
  QbPoolItem,
  QbReadiness,
  QbReportKind,
  QbReviewItem,
  QbServedQuestion,
  QbServedSection,
  QbSlot,
  QbTieBreakStep,
} from "./types";
import { QB_SLOT_EXAM } from "./types";
import { getOrCreateWindow, getWindow, istIso, istMonthWindow, packParts, practicePool, rankedStatus, rankedWindowsFor, reservationKey } from "./windows";

/**
 * Papers (owner: QB-CORE-B; §B10.1): generation, sets (the JEE Advanced pair), loading with the
 * runner-payload whitelist, key corrections, the answer lock, outcome recording and pruning.
 *
 * - A paper id is 22 base64url characters (128 bits); its bearer token is 32 random bytes (43
 *   characters) of which only the SHA-256 is stored (shared by the parts of a set). The owning
 *   student needs no token. Ranked papers open with the owner's session only.
 * - Served questions are built from the APPROVED SNAPSHOTS (immutable; LRU of 2,000 per connection).
 *   The runner payload never carries answers, solutions, sources, difficulty, staff fields or import
 *   ids. Keys, solutions and public source labels come only from `paperReviewItems` (the mock-test
 *   side decides when to release them).
 * - Expiry: 14 days for guests (`QB_PAPER_GUEST_RETENTION_DAYS`), 30 days for students; a paper
 *   linked to a saved attempt is never pruned. Pruning is lazy (200 at a time).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LRU_LIMIT = 2000;

export interface QbPaperRecord {
  view: QbPaperView;
  userId: string | null;
  tieBreak: QbTieBreakStep[] | null;
  /** The real exam's question count for this paper's part. */
  fullQuestionCount: number;
}

export type QbCreatePaperResult =
  | { ok: true; papers: QbPaperRecord[]; token: string | null; resumed: boolean }
  | {
      ok: false;
      reason: "no_blueprint" | "thin" | "ranked_off" | "ranked_unavailable" | "language" | "signed_out";
      readiness?: QbReadiness;
    };

export interface QbCreatePaperInput {
  slot: QbSlot;
  mode: "practice" | "ranked";
  userId: string | null;
  language: "en" | "hi";
  compensatory: boolean;
  recent: QbPaperRef[];
  placeholderMode: boolean;
  now: number;
}

// ---------------------------------------------------------------------------------------------
// Ids, tokens, retention

export function hashPaperToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function tokenMatches(storedHash: string, token: string | null | undefined): boolean {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashPaperToken(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function guestRetentionMs(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const days = Number(env.QB_PAPER_GUEST_RETENTION_DAYS);
  return (Number.isFinite(days) && days >= 1 && days <= 365 ? days : 14) * DAY_MS;
}
export const STUDENT_RETENTION_MS = 30 * DAY_MS;

// ---------------------------------------------------------------------------------------------
// Snapshot LRU (per connection; snapshots are immutable)

const lruByDb = new WeakMap<DatabaseSync, Map<string, QbSnapshot | null>>();

function snapshotOf(db: DatabaseSync, id: string, version: number): QbSnapshot | null {
  let lru = lruByDb.get(db);
  if (!lru) lruByDb.set(db, (lru = new Map()));
  const key = `${id}@${version}`;
  if (lru.has(key)) {
    const value = lru.get(key)!;
    lru.delete(key);
    lru.set(key, value);
    return value;
  }
  const snapshot = loadSnapshot(db, id, version);
  lru.set(key, snapshot);
  if (lru.size > LRU_LIMIT) lru.delete(lru.keys().next().value as string);
  return snapshot;
}

// ---------------------------------------------------------------------------------------------
// Rows

interface PaperRow {
  id: string;
  tokenHash: string;
  kind: QbPaperKind;
  slot: QbSlot;
  testId: string;
  setId: string | null;
  setPart: number | null;
  blueprintId: string;
  blueprintVersion: number;
  userId: string | null;
  windowId: string | null;
  seed: string;
  items: PackedItem[];
  composition: QbPaperComposition;
  language: "en" | "hi";
  durationMinutes: number;
  compensatoryMinutes: number;
  maxScore: number;
  questionCount: number;
  short: boolean;
  sample: boolean;
  createdAt: number;
  expiresAt: number;
  firstScoredAt: number | null;
  answersHash: string | null;
  statsRecordedAt: number | null;
}

function mapPaper(row: Record<string, unknown>): PaperRow {
  return {
    id: String(row.id),
    tokenHash: String(row.token_hash),
    kind: row.kind === "ranked" ? "ranked" : "practice",
    slot: row.slot as QbSlot,
    testId: String(row.test_id),
    setId: row.set_id === null ? null : String(row.set_id),
    setPart: row.set_part === null ? null : Number(row.set_part),
    blueprintId: String(row.blueprint_id),
    blueprintVersion: Number(row.blueprint_version),
    userId: row.user_id === null ? null : String(row.user_id),
    windowId: row.window_id === null ? null : String(row.window_id),
    seed: String(row.seed),
    items: row.items instanceof Uint8Array ? unpackItems(row.items) : [],
    composition: parseJson<QbPaperComposition>(row.composition, null as never),
    language: row.language === "hi" ? "hi" : "en",
    durationMinutes: Number(row.duration_minutes),
    compensatoryMinutes: Number(row.compensatory_minutes),
    maxScore: Number(row.max_score),
    questionCount: Number(row.question_count),
    short: Number(row.short) === 1,
    sample: Number(row.sample) === 1,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    firstScoredAt: row.first_scored_at === null ? null : Number(row.first_scored_at),
    answersHash: row.answers_hash === null ? null : String(row.answers_hash),
    statsRecordedAt: row.stats_recorded_at === null ? null : Number(row.stats_recorded_at),
  };
}

function getPaperRow(db: DatabaseSync, id: string): PaperRow | null {
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const row = db.prepare("SELECT * FROM qb_papers WHERE id = ?").get(id);
  return row ? mapPaper(row) : null;
}

function linkedToAttempt(db: DatabaseSync, id: string): boolean {
  return db.prepare("SELECT 1 AS found FROM qb_attempt_papers WHERE paper_id = ?").get(id) !== undefined;
}

// ---------------------------------------------------------------------------------------------
// Served questions

interface ServedEntry {
  served: QbServedQuestion;
  snapshot: QbSnapshot;
  version: number;
  section: QbBlueprintSection;
}

function flatSections(blueprint: QbBlueprint): { section: QbBlueprintSection; partIndex: number }[] {
  return blueprint.parts.flatMap((part, partIndex) => part.sections.map((section) => ({ section, partIndex })));
}

function servedEntries(db: DatabaseSync, paper: PaperRow, blueprint: QbBlueprint): ServedEntry[] {
  const sections = flatSections(blueprint);
  const byN = questionsByN(
    db,
    paper.items.map((i) => i.n),
  );
  const entries: ServedEntry[] = [];
  paper.items.forEach((item, index) => {
    const question = byN.get(item.n);
    const section = sections[item.section]?.section;
    if (!question || !section) return;
    const snapshot = snapshotOf(db, question.id, item.version);
    if (!snapshot) return;
    const content = snapshot.content;
    const hiAvailable = (content.hiSource === "official" || content.hiSource === "staff") && content.stem.hi.trim() !== "";
    const unit = content.answer?.kind === "numerical" ? content.answer.unit : undefined;
    const served: QbServedQuestion = {
      id: question.id,
      index,
      sectionId: section.id,
      subject: snapshot.subject,
      chapterId: snapshot.chapterId ?? "",
      type: content.type,
      format: content.format,
      answerFormat: section.type === "numerical" ? (section.answerFormat ?? "decimal2") : null,
      stem: content.stem,
      options: content.options,
      ...(unit ? { unit } : {}),
      figures: content.figures.filter((f) => f.slot !== "solution"),
      passage: snapshot.passage ? { id: snapshot.passage.id, stem: snapshot.passage.stem, figures: snapshot.passage.figures } : null,
      marking: { ...section.marking },
      hiAvailable,
      hiMachine: content.hiSource === "machine_draft",
    };
    entries.push({ served, snapshot, version: item.version, section });
  });
  return entries;
}

function buildView(db: DatabaseSync, paper: PaperRow, blueprint: QbBlueprint): { view: QbPaperView; entries: ServedEntry[] } {
  const entries = servedEntries(db, paper, blueprint);
  const partIndex = (paper.setPart ?? 1) - 1;
  const part = blueprint.parts[partIndex] ?? blueprint.parts[0];
  const sections: QbServedSection[] = [];
  for (const section of part.sections) {
    const own = entries.filter((e) => e.served.sectionId === section.id);
    if (own.length === 0) continue;
    sections.push({
      id: section.id,
      subject: section.subject,
      label: section.label,
      type: section.type,
      answerFormat: section.type === "numerical" ? (section.answerFormat ?? "decimal2") : null,
      format: section.format ?? null,
      marking: { ...section.marking },
      instructions: section.instructions,
      start: own[0].served.index,
      count: own.length,
      fullCount: section.count,
    });
  }
  const view: QbPaperView = {
    id: paper.id,
    kind: paper.kind,
    slot: paper.slot,
    testId: paper.testId,
    exam: QB_SLOT_EXAM[paper.slot],
    setId: paper.setId,
    setPart: paper.setPart,
    title: blueprint.title,
    partLabel: blueprint.parts.length > 1 ? part.label : null,
    language: paper.language,
    durationMinutes: paper.durationMinutes,
    compensatoryMinutes: paper.compensatoryMinutes,
    maxScore: paper.maxScore,
    questionCount: entries.length,
    short: paper.short,
    sample: paper.sample,
    windowId: paper.windowId,
    createdAt: paper.createdAt,
    expiresAt: paper.expiresAt,
    scored: paper.answersHash !== null,
    composition: paper.composition,
    sections,
    questions: entries.map((e) => e.served),
    patternNote: blueprint.pattern.note,
  };
  return { view, entries };
}

function recordOf(db: DatabaseSync, paper: PaperRow): QbPaperRecord | null {
  const blueprint = getBlueprintById(db, paper.blueprintId);
  if (!blueprint) return null;
  const { view } = buildView(db, paper, blueprint);
  const part = blueprint.parts[(paper.setPart ?? 1) - 1] ?? blueprint.parts[0];
  return {
    view,
    userId: paper.userId,
    tieBreak: blueprint.tieBreak ? blueprint.tieBreak.map((s) => ({ ...s })) : null,
    fullQuestionCount: part.sections.reduce((sum, s) => sum + s.count, 0),
  };
}

// ---------------------------------------------------------------------------------------------
// Creation

function testIdFor(slot: QbSlot, mode: "practice" | "ranked", part: number | null): string {
  const base = blueprintTestId(slot, mode);
  return part === null ? base : `${base}-p${part}`;
}

/** Clusters this student (or guest browser) saw recently → when (oldest relaxed first). */
function recentClusters(db: DatabaseSync, input: QbCreatePaperInput, blueprint: QbBlueprint, pool: readonly QbPoolItem[]): Map<string, number> {
  const since = input.now - blueprint.recentExclusionDays * DAY_MS;
  const rows: { items: PackedItem[]; createdAt: number }[] = [];
  if (input.userId) {
    for (const row of db
      .prepare("SELECT items, created_at FROM qb_papers WHERE user_id = ? AND slot = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 50")
      .all(input.userId, input.slot, since)) {
      rows.push({ items: row.items instanceof Uint8Array ? unpackItems(row.items) : [], createdAt: Number(row.created_at) });
    }
  } else if (input.recent.length > 0) {
    const refs = input.recent.slice(0, 5).filter((r) => /^[A-Za-z0-9_-]{22}$/.test(r.id));
    if (refs.length > 0) {
      const found = db
        .prepare(`SELECT id, token_hash, items, created_at FROM qb_papers WHERE id IN (${placeholders(refs.length)}) AND user_id IS NULL`)
        .all(...refs.map((r) => r.id));
      for (const row of found) {
        const ref = refs.find((r) => r.id === String(row.id));
        if (!ref || !tokenMatches(String(row.token_hash), ref.token) || Number(row.created_at) < since) continue;
        rows.push({ items: row.items instanceof Uint8Array ? unpackItems(row.items) : [], createdAt: Number(row.created_at) });
      }
    }
  }
  // Pool items carry their resolved cluster (variants and open near pairs merged).
  const byN = new Map(pool.map((i) => [i.n, i]));
  const seen = new Map<string, number>();
  for (const { items, createdAt } of rows) {
    for (const item of items) {
      const cluster = byN.get(item.n)?.clusterId;
      if (cluster) seen.set(cluster, Math.max(seen.get(cluster) ?? 0, createdAt));
    }
  }
  return seen;
}

function compensatoryFor(blueprint: QbBlueprint, duration: number, partDuration: number, requested: boolean): number {
  if (!requested || !blueprint.compensatoryMinutes) return 0;
  const scaled = (blueprint.compensatoryMinutes * duration) / Math.max(1, partDuration);
  return Math.max(5, Math.round(scaled / 5) * 5);
}

function insertPapers(
  db: DatabaseSync,
  input: {
    blueprint: QbBlueprint;
    parts: readonly GeneratedPart[];
    composition: QbPaperComposition;
    kind: QbPaperKind;
    userId: string | null;
    windowId: string | null;
    seed: string;
    language: "en" | "hi";
    compensatory: boolean;
    short: boolean;
    now: number;
    expiresAt: number;
  },
): { ids: string[]; token: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPaperToken(token);
  const multi = input.blueprint.parts.length > 1;
  const setId = multi ? randomBytes(16).toString("base64url") : null;
  const ids: string[] = [];
  const insert = db.prepare(
    `INSERT INTO qb_papers (id, token_hash, kind, slot, test_id, set_id, set_part, blueprint_id, blueprint_version, user_id, window_id,
       seed, items, composition, language, duration_minutes, compensatory_minutes, max_score, question_count, short, sample,
       created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  input.parts.forEach((part, i) => {
    const blueprintPart = input.blueprint.parts.find((p) => p.id === part.partId) ?? input.blueprint.parts[i];
    const items = part.sections.flatMap((s) => s.items);
    const full = blueprintPart.sections.reduce((sum, s) => sum + s.count, 0);
    const composition = multi
      ? compositionOf(items, full, input.language, input.composition.shortfall, input.composition.relaxed)
      : input.composition;
    const id = randomBytes(16).toString("base64url");
    insert.run(
      id,
      tokenHash,
      input.kind,
      input.blueprint.slot,
      testIdFor(input.blueprint.slot, input.kind === "ranked" ? "ranked" : "practice", multi ? i + 1 : null),
      setId,
      multi ? i + 1 : null,
      input.blueprint.id,
      input.blueprint.version,
      input.userId,
      input.windowId,
      input.seed,
      packParts(input.blueprint, [part]),
      JSON.stringify(composition),
      input.language,
      part.durationMinutes,
      compensatoryFor(input.blueprint, part.durationMinutes, blueprintPart.durationMinutes, input.compensatory && input.kind === "practice"),
      part.maxScore,
      items.length,
      input.short ? 1 : 0,
      items.some((it) => it.sourceKind === "sample") ? 1 : 0,
      input.now,
      input.expiresAt,
    );
    ids.push(id);
  });
  return { ids, token };
}

function partsFromTemplate(blueprint: QbBlueprint, items: readonly PackedItem[], db: DatabaseSync, exam: QbExam, now: number): GeneratedPart[] | null {
  const sections = flatSections(blueprint);
  const pool = new Map(loadExamPool(db, exam, now).map((i) => [`${i.n}@${i.version}`, i]));
  const byN = questionsByN(
    db,
    items.map((i) => i.n),
  );
  const parts: GeneratedPart[] = blueprint.parts.map((part) => ({
    partId: part.id,
    sections: part.sections.map((s) => ({ sectionId: s.id, items: [] as QbPoolItem[] })),
    durationMinutes: part.durationMinutes,
    maxScore: part.sections.reduce((sum, s) => sum + s.count * s.marking.correct, 0),
  }));
  for (const item of items) {
    const where = sections[item.section];
    if (!where) return null;
    const poolItem = pool.get(`${item.n}@${item.version}`);
    const q = byN.get(item.n);
    if (!q) return null;
    const synthetic: QbPoolItem = poolItem ?? {
      id: q.id,
      n: item.n,
      version: item.version,
      subject: q.subject,
      chapterId: "",
      level: "general",
      type: where.section.type,
      format: where.section.format ?? "standard",
      integer: where.section.answerFormat === "integer",
      difficulty: "medium",
      sourceKind: "aspire",
      sourceYear: null,
      crossExam: false,
      hiOk: false,
      clusterId: q.clusterId ?? q.id,
      passageId: null,
      passageOrder: null,
      exposures: 0,
    };
    const part = parts[where.partIndex];
    part.sections.find((s) => s.sectionId === where.section.id)!.items.push(synthetic);
  }
  return parts;
}

/** Makes a practice paper (or pair), or returns / makes the student's ranked paper of this month. */
export function createPaper(input: QbCreatePaperInput, db: DatabaseSync = qbDb()): QbCreatePaperResult {
  prunePapers(db, input.now);
  const blueprint = getPublishedBlueprint(db, input.slot);
  if (!blueprint) return { ok: false, reason: "no_blueprint" };
  if (!blueprint.languages.includes(input.language)) return { ok: false, reason: "language" };
  const exam = blueprint.exam;

  if (input.mode === "ranked") {
    if (blueprint.ranked !== "monthly") return { ok: false, reason: "ranked_off" };
    if (!input.userId) return { ok: false, reason: "signed_out" };
    const month = istMonthWindow(input.now);
    const mine = db
      .prepare("SELECT * FROM qb_papers WHERE user_id = ? AND slot = ? AND window_id = ? AND kind = 'ranked' ORDER BY COALESCE(set_part, 0)")
      .all(input.userId, input.slot, month.windowId)
      .map(mapPaper);
    if (mine.length > 0) {
      const records = mine.map((p) => recordOf(db, p)).filter((r): r is QbPaperRecord => r !== null);
      return { ok: true, papers: records, token: null, resumed: true };
    }
    const window = getOrCreateWindow(db, input.slot, input.now);
    if (!window) return { ok: false, reason: "ranked_off" };
    if (window.status !== "open" || !window.blueprintId) {
      return { ok: false, reason: "ranked_unavailable", readiness: slotReadinessCore(db, input.slot, "en", false, input.now).readiness ?? undefined };
    }
    if (input.language === "hi" && !window.composition?.hiOk) return { ok: false, reason: "language" };
    const pinned = getBlueprintById(db, window.blueprintId) ?? blueprint;
    const parts = partsFromTemplate(pinned, window.items, db, exam, input.now);
    if (!parts) return { ok: false, reason: "ranked_unavailable" };
    const composition = (window.composition as QbPaperComposition | null) ?? compositionOf(parts.flatMap((p) => p.sections.flatMap((s) => s.items)), blueprintTotals(pinned).questions, "en");
    try {
      const created = withTx(db, () =>
        insertPapers(db, {
          blueprint: pinned,
          parts,
          composition: { ...composition, language: input.language },
          kind: "ranked",
          userId: input.userId,
          windowId: window.windowId,
          seed: window.seed ?? "",
          language: input.language,
          compensatory: false,
          short: false,
          now: input.now,
          expiresAt: Math.max(input.now + STUDENT_RETENTION_MS, window.endsAt + 7 * DAY_MS),
        }),
      );
      const records = created.ids.map((id) => recordOf(db, getPaperRow(db, id)!)).filter((r): r is QbPaperRecord => r !== null);
      return { ok: true, papers: records, token: null, resumed: false };
    } catch (error) {
      // A concurrent first request made it (UNIQUE per student, slot and window): return that one.
      const again = db
        .prepare("SELECT * FROM qb_papers WHERE user_id = ? AND slot = ? AND window_id = ? AND kind = 'ranked' ORDER BY COALESCE(set_part, 0)")
        .all(input.userId, input.slot, month.windowId)
        .map(mapPaper);
      if (again.length === 0) throw error;
      return { ok: true, papers: again.map((p) => recordOf(db, p)).filter((r): r is QbPaperRecord => r !== null), token: null, resumed: true };
    }
  }

  const pool = practicePool(db, exam, input.now);
  const { weights, formatTargets } = weightsFor(db, blueprint, input.now);
  const softExclude = recentClusters(db, input, blueprint, pool);
  const seed = randomBytes(16).toString("hex");
  const result = generatePaper({
    blueprint,
    pool,
    weights,
    formatTargets,
    softExclude,
    mode: "practice",
    seed,
    language: input.language,
    placeholderMode: input.placeholderMode,
  });
  if (!result.ok) return { ok: false, reason: "thin", readiness: result.readiness };
  const created = withTx(db, () => {
    const out = insertPapers(db, {
      blueprint,
      parts: result.parts,
      composition: result.composition,
      kind: "practice",
      userId: input.userId,
      windowId: null,
      seed,
      language: input.language,
      compensatory: input.compensatory,
      short: result.short,
      now: input.now,
      expiresAt: input.now + (input.userId ? STUDENT_RETENTION_MS : guestRetentionMs()),
    });
    addExposures(
      db,
      exam,
      result.parts.flatMap((p) => p.sections.flatMap((s) => s.items.map((i) => i.id))),
    );
    return out;
  });
  const records = created.ids.map((id) => recordOf(db, getPaperRow(db, id)!)).filter((r): r is QbPaperRecord => r !== null);
  return { ok: true, papers: records, token: created.token, resumed: false };
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

// ---------------------------------------------------------------------------------------------
// Loading

/** A paper the caller may open (token or owner; ranked: owner only). Null when unknown, expired or not theirs. */
export function loadPaper(
  id: string,
  access: { token?: string | null; userId?: string | null },
  now: number,
  db: DatabaseSync = qbDb(),
): QbPaperRecord | null {
  const paper = getPaperRow(db, id);
  if (!paper) return null;
  if (paper.expiresAt < now && !linkedToAttempt(db, id)) return null;
  const owner = paper.userId !== null && access.userId === paper.userId;
  if (paper.kind === "ranked") {
    if (!owner) return null;
  } else if (!owner && !tokenMatches(paper.tokenHash, access.token)) return null;
  return recordOf(db, paper);
}

/** Server-side only: no access check (saved attempts, verification, re-scoring). */
export function loadPaperTrusted(id: string, now: number, db: DatabaseSync = qbDb()): QbPaperRecord | null {
  void now;
  const paper = getPaperRow(db, id);
  return paper ? recordOf(db, paper) : null;
}

/** The other parts of a paper's set (JEE Advanced pair), same access rules. */
export function loadPaperSet(setId: string, access: { token?: string | null; userId?: string | null }, now: number, db: DatabaseSync = qbDb()): QbPaperRecord[] {
  const ids = db
    .prepare("SELECT id FROM qb_papers WHERE set_id = ? ORDER BY set_part")
    .all(setId)
    .map((r) => String(r.id));
  return ids.map((id) => loadPaper(id, access, now, db)).filter((r): r is QbPaperRecord => r !== null);
}

/** Key, solution, public source label and difficulty per question, in paper order, corrections applied. */
export function paperReviewItems(id: string, now: number, db: DatabaseSync = qbDb()): QbReviewItem[] {
  void now;
  const paper = getPaperRow(db, id);
  if (!paper) return [];
  const blueprint = getBlueprintById(db, paper.blueprintId);
  if (!blueprint) return [];
  const entries = servedEntries(db, paper, blueprint);
  const corrections = correctionsFor(
    db,
    entries.map((e) => e.served.id),
  );
  const exam = QB_SLOT_EXAM[paper.slot];
  const difficulties = new Map<string, QbDifficulty | null>();
  if (entries.length > 0) {
    for (const row of db
      .prepare(`SELECT question_id, difficulty FROM qb_question_exams WHERE exam = ? AND question_id IN (${placeholders(entries.length)})`)
      .all(exam, ...entries.map((e) => e.served.id))) {
      difficulties.set(String(row.question_id), (row.difficulty as QbDifficulty | null) ?? null);
    }
  }
  return entries.map((entry) => {
    const key = effectiveKey(entry.snapshot.content.answer, corrections.get(entry.served.id), entry.version);
    return {
      id: entry.served.id,
      index: entry.served.index,
      answer: key.answer,
      dropped: key.dropped,
      correctedAt: key.correctedAt,
      solution: entry.snapshot.content.solution,
      solutionSource: entry.snapshot.content.solutionSource,
      sourceLabel: sourceLabelBilingual({ source: entry.snapshot.source, fidelity: entry.snapshot.fidelity }),
      sourceKind: entry.snapshot.source.kind,
      adapted: entry.snapshot.fidelity === "adapted",
      difficulty: difficulties.get(entry.served.id) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Answer lock and outcomes

export interface QbLockSummary {
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unattempted: number;
}

/** First scoring stores the hash and summary ("first"); the same hash → "same"; a different one → "different". */
export function lockPaperAnswers(
  id: string,
  input: { answersHash: string; summary: QbLockSummary; now: number },
  db: DatabaseSync = qbDb(),
): "first" | "same" | "different" | "not_found" {
  const changed = db
    .prepare("UPDATE qb_papers SET answers_hash = ?, result_summary = ?, first_scored_at = ? WHERE id = ? AND answers_hash IS NULL")
    .run(input.answersHash, JSON.stringify(input.summary), input.now, id);
  if (Number(changed.changes) === 1) return "first";
  const row = db.prepare("SELECT answers_hash FROM qb_papers WHERE id = ?").get(id);
  if (!row) return "not_found";
  return String(row.answers_hash) === input.answersHash ? "same" : "different";
}

/** A break allowed between the parts of a set (JEE Advanced Paper 1 → Paper 2), per earlier part. */
export const QB_PART_BREAK_MS = 60 * 60 * 1000;

/**
 * Whether elapsed time since the paper was made is plausible for statistics. Both parts of a set are
 * made together, so a later part may also take the earlier parts' time (`earlierPartsMs`).
 */
export function plausibleTiming(
  paper: Pick<QbPaperView, "createdAt" | "durationMinutes" | "compensatoryMinutes">,
  now: number,
  earlierPartsMs = 0,
): boolean {
  const elapsed = now - paper.createdAt;
  const limit = (paper.durationMinutes + paper.compensatoryMinutes) * 60 * 1000 + ATTEMPT_TIMING.graceMs + Math.max(0, earlierPartsMs);
  return elapsed >= minDurationMs(paper.durationMinutes) && elapsed <= limit;
}

/** The time the earlier parts of a paper's set may take (their time, grace and a break each); 0 for part 1. */
function earlierPartsMs(db: DatabaseSync, paper: Pick<PaperRow, "setId" | "setPart">): number {
  if (!paper.setId || !paper.setPart || paper.setPart <= 1) return 0;
  const rows = db
    .prepare("SELECT duration_minutes, compensatory_minutes FROM qb_papers WHERE set_id = ? AND set_part < ?")
    .all(paper.setId, paper.setPart);
  return rows.reduce(
    (sum, row) => sum + (Number(row.duration_minutes) + Number(row.compensatory_minutes)) * 60 * 1000 + ATTEMPT_TIMING.graceMs + QB_PART_BREAK_MS,
    0,
  );
}

/**
 * The plausibility check `recordPaperOutcome` applies, for callers that gate on it first (the mock-test
 * side): a later part of a set gets the earlier parts' time. False when the paper is gone.
 */
export function plausiblePaperOutcomeTiming(id: string, now: number, db: DatabaseSync = qbDb()): boolean {
  const paper = getPaperRow(db, id);
  return paper ? plausibleTiming(paper, now, earlierPartsMs(db, paper)) : false;
}

/**
 * Records a scored paper's per-question outcomes ONCE (compare-and-set on `stats_recorded_at`), only
 * when the timing is plausible. Dropped questions are left out. Returns true when recorded now.
 */
export function recordPaperOutcome(
  id: string,
  input: { questions: { id: string; outcome: QbOutcome; timeSec?: number }[]; score: number; maxScore: number; now: number },
  db: DatabaseSync = qbDb(),
): boolean {
  const paper = getPaperRow(db, id);
  if (!paper) return false;
  if (!plausibleTiming(paper, input.now, earlierPartsMs(db, paper))) return false;
  const blueprint = getBlueprintById(db, paper.blueprintId);
  if (!blueprint) return false;
  return withTx(db, () => {
    const claimed = db.prepare("UPDATE qb_papers SET stats_recorded_at = ? WHERE id = ? AND stats_recorded_at IS NULL").run(input.now, id);
    if (Number(claimed.changes) !== 1) return false;
    const entries = servedEntries(db, paper, blueprint);
    const corrections = correctionsFor(
      db,
      entries.map((e) => e.served.id),
    );
    const byId = new Map(entries.map((e) => [e.served.id, e]));
    const questions = input.questions
      .filter((q) => {
        const entry = byId.get(q.id);
        return entry && !effectiveKey(entry.snapshot.content.answer, corrections.get(q.id), entry.version).dropped;
      })
      .map((q) => ({ id: q.id, type: byId.get(q.id)!.served.type, outcome: q.outcome, timeSec: q.timeSec }));
    accumulateOutcome(db, { exam: QB_SLOT_EXAM[paper.slot], slot: paper.slot, questions, score: input.score, maxScore: input.maxScore, now: input.now });
    return true;
  });
}

/** Which of `paperIds` contain the question (any version). */
export function paperIdsContaining(questionId: string, paperIds: readonly string[], db: DatabaseSync = qbDb()): string[] {
  const row = db.prepare("SELECT n FROM qb_questions WHERE id = ?").get(questionId);
  if (!row) return [];
  const n = Number(row.n);
  const out: string[] = [];
  for (const id of paperIds) {
    const paper = getPaperRow(db, id);
    if (paper?.items.some((i) => i.n === n)) out.push(id);
  }
  return out;
}

/** Deletes expired papers that no saved attempt uses (200 at a time). */
export function prunePapers(db: DatabaseSync, now: number): number {
  const ids = db
    .prepare(
      `SELECT id FROM qb_papers p WHERE expires_at < ?
         AND NOT EXISTS (SELECT 1 FROM qb_attempt_papers a WHERE a.paper_id = p.id) LIMIT 200`,
    )
    .all(now)
    .map((r) => String(r.id));
  if (ids.length === 0) return 0;
  db.prepare(`UPDATE qb_reports SET paper_id = NULL WHERE paper_id IN (${placeholders(ids.length)})`).run(...ids);
  db.prepare(`DELETE FROM qb_papers WHERE id IN (${placeholders(ids.length)})`).run(...ids);
  return ids.length;
}

// ---------------------------------------------------------------------------------------------
// Reports

/** "Report a problem" on a question of a paper the caller may open. No account or IP is stored. */
export function reportPaperQuestion(
  input: { paperId: string; token?: string | null; userId?: string | null; questionId: string; kind: QbReportKind; note: string | null; now: number },
  db: DatabaseSync = qbDb(),
): boolean {
  const paper = getPaperRow(db, input.paperId);
  if (!paper) return false;
  const owner = paper.userId !== null && input.userId === paper.userId;
  if (!owner && (paper.kind === "ranked" || !tokenMatches(paper.tokenHash, input.token))) return false;
  const row = db.prepare("SELECT n FROM qb_questions WHERE id = ?").get(input.questionId);
  if (!row) return false;
  const item = paper.items.find((i) => i.n === Number(row.n));
  if (!item) return false;
  recordStudentReport(db, { questionId: input.questionId, version: item.version, paperId: paper.id, kind: input.kind, note: input.note, now: input.now });
  return true;
}

/** Server-side variant for a paper the caller already opened (access checked by the caller). */
export function reportServedQuestion(
  input: { paperId: string; questionId: string; kind: QbReportKind; note: string | null; now: number },
  db: DatabaseSync = qbDb(),
): boolean {
  const paper = getPaperRow(db, input.paperId);
  if (!paper) return false;
  const row = db.prepare("SELECT n FROM qb_questions WHERE id = ?").get(input.questionId);
  const item = row ? paper.items.find((i) => i.n === Number(row.n)) : undefined;
  if (!item) return false;
  recordStudentReport(db, { questionId: input.questionId, version: item.version, paperId: paper.id, kind: input.kind, note: input.note, now: input.now });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Readiness and public lists

export interface QbSlotReadinessView {
  slot: QbSlot;
  exam: QbExam;
  available: boolean;
  reason: "disabled" | "no_blueprint" | null;
  readiness: QbReadiness | null;
  full: { questionCount: number; maxScore: number; durationMinutes: number } | null;
  languages: ("en" | "hi")[];
  compensatoryMinutes: number | null;
  composition: QbPaperComposition | null;
  sample: boolean;
  pattern: { year: number; note: Bilingual; sourceUrls: string[]; verifiedAt: string | null; reviewDueAt: string | null } | null;
  ranked: { mode: "off" | "monthly"; available: boolean; windowId: string | null; closesAt: number | null };
}

const readinessCache = new WeakMap<DatabaseSync, Map<string, QbSlotReadinessView>>();

function slotReadinessCore(db: DatabaseSync, slot: QbSlot, language: "en" | "hi", placeholderMode: boolean, now: number): QbSlotReadinessView {
  const exam = QB_SLOT_EXAM[slot];
  let ranked = rankedStatus(db, slot, now);
  const blueprint = getPublishedBlueprint(db, slot);
  if (!blueprint) {
    return {
      slot,
      exam,
      available: false,
      reason: "no_blueprint",
      readiness: null,
      full: null,
      languages: [],
      compensatoryMinutes: null,
      composition: null,
      sample: false,
      pattern: null,
      ranked,
    };
  }
  // The reservation key changes when a ranked template opens (its clusters leave the practice pool)
  // or its window closes, so readiness never reports the pre-reservation supply.
  const key = `${slot}|${language}|${placeholderMode}|${bankRevision(db)}|${blueprint.id}|${ranked.windowId}|${ranked.available}|${reservationKey(db, exam, now)}`;
  let perDb = readinessCache.get(db);
  if (!perDb) readinessCache.set(db, (perDb = new Map()));
  const cached = perDb.get(key);
  if (cached) return cached;
  const pool = practicePool(db, exam, now);
  const { weights, formatTargets } = weightsFor(db, blueprint, now);
  const readiness = computeReadiness({ blueprint, pool, weights, formatTargets, language, placeholderMode });
  // Before this month's template exists `rankedStatus` is optimistic. A ranked paper is always FULL and
  // never uses sample questions (plan §B10.3), so only offer it when the bank without samples can fill one;
  // the template itself (getOrCreateWindow) stays the authority.
  if (ranked.mode === "monthly" && ranked.available && ranked.windowId && !getWindow(db, slot, ranked.windowId)) {
    const rankedPool = loadExamPool(db, exam, now);
    const fullWithoutSamples = computeReadiness({ blueprint, pool: rankedPool, weights, formatTargets, language: "en", placeholderMode: false }).byLanguage.en === "full";
    if (!fullWithoutSamples) ranked = { ...ranked, available: false };
  }
  readiness.ranked = { available: ranked.available && ranked.mode === "monthly", windowId: ranked.windowId, closesAt: ranked.closesAt };
  const preview =
    readiness.level === "thin"
      ? null
      : generatePaper({ blueprint, pool, weights, formatTargets, softExclude: new Set(), mode: "practice", seed: "readiness-preview", language, placeholderMode });
  const eligible = pool.filter((item) => eligibleForBlueprint(item, blueprint, { language, placeholderMode }));
  const totals = blueprintTotals(blueprint);
  const view: QbSlotReadinessView = {
    slot,
    exam,
    available: true,
    reason: null,
    readiness,
    full: { questionCount: totals.questions, maxScore: totals.marks, durationMinutes: totals.minutes },
    languages: [...blueprint.languages],
    compensatoryMinutes: blueprint.compensatoryMinutes,
    composition: preview && preview.ok ? preview.composition : null,
    sample: eligible.length > 0 && eligible.every((i) => i.sourceKind === "sample"),
    pattern: {
      year: blueprint.pattern.year,
      note: blueprint.pattern.note,
      sourceUrls: [...blueprint.pattern.sourceUrls],
      verifiedAt: blueprint.pattern.verifiedAt,
      reviewDueAt: blueprint.pattern.reviewDueAt,
    },
    ranked,
  };
  if (perDb.size > 100) perDb.clear();
  perDb.set(key, view);
  return view;
}

/** A slot's readiness before anything is made (no paper is stored). */
export function slotReadiness(
  input: { slot: QbSlot; language: "en" | "hi"; placeholderMode: boolean; now: number },
  db: DatabaseSync = qbDb(),
): QbSlotReadinessView {
  return slotReadinessCore(db, input.slot, input.language, input.placeholderMode, input.now);
}

export interface QbPublicMock {
  slot: QbSlot;
  testId: string;
  exam: QbExam;
  title: Bilingual;
  summary: Bilingual;
  durationMinutes: number;
  questionCount: number;
  maxScore: number;
  level: "full" | "short" | "thin";
  sample: boolean;
  ranked: "off" | "monthly";
}

/** Published exam-pattern mocks for lists (dynamic callers only: reads the database). */
export function publicBlueprintMocks(input: { placeholderMode: boolean; now: number }, db: DatabaseSync = qbDb()): QbPublicMock[] {
  return publishedBlueprints(db).map((blueprint) => {
    const view = slotReadinessCore(db, blueprint.slot, "en", input.placeholderMode, input.now);
    const totals = blueprintTotals(blueprint);
    return {
      slot: blueprint.slot,
      testId: blueprintTestId(blueprint.slot, "practice"),
      exam: blueprint.exam,
      title: blueprint.title,
      summary: blueprint.summary,
      durationMinutes: totals.minutes,
      questionCount: totals.questions,
      maxScore: totals.marks,
      level: view.readiness?.level ?? "thin",
      sample: view.sample,
      ranked: blueprint.ranked,
    };
  });
}

/** Monthly ranked boards of a slot: windows that had a template, each with its max score. Null when ranked is off. */
export function rankedBoard(
  slot: QbSlot,
  now: number,
  db: DatabaseSync = qbDb(),
): { windows: { window: { id: string; startsAt: string; endsAt: string }; maxScore: number }[] } | null {
  void now;
  const blueprint = getPublishedBlueprint(db, slot);
  if (!blueprint || blueprint.ranked !== "monthly") return null;
  return {
    windows: rankedWindowsFor(db, slot).map((w) => ({
      window: { id: w.windowId, startsAt: istIso(w.startsAt), endsAt: istIso(w.endsAt) },
      maxScore: w.maxScore,
    })),
  };
}

