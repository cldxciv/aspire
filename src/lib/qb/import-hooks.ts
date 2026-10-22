import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { qbDb } from "./db";
import { paperKeyOf } from "./question-rules";
import { refreshQuestionState } from "./questions";
import {
  addEvent,
  encodeImported,
  getQuestionRecord,
  insertQuestionRow,
  nextQuestionNumber,
  updateQuestionRow,
  writeExamRow,
  type ImportedOriginal,
  type QuestionColumns,
} from "./repo/questions";
import { newQuestionId } from "./repo/json";
import { RICH_TEXT_LIMITS } from "./rich-text";
import { syllabusRevisionYear } from "./settings";
import { chapterListFor, chapterSubject } from "./taxonomy";
import type { Bilingual, QbAnswer, QbDifficulty, QbDraftInput, QbExam, QbFlag, QbQuestionContent, QbSubject } from "./types";
import { QB_FLAGS } from "./types";

/**
 * The bank side of QB-IMPORT (owner: QB-CORE-B; §B8). Every bank WRITE from an import goes through
 * these hooks:
 * - `upsertImportDrafts`: idempotent on UNIQUE(import_id, source_key); a re-run updates only its own
 *   untouched drafts (never a question a reviewer edited, approved, rejected or retired). The AI's
 *   chapter is stored as a SUGGESTION (`ai_chapter_id`); the staff chapter stays empty until a reviewer
 *   accepts it. Source fields come only from the import's metadata (the caller builds `source`).
 * - `applyAnswerKey`: final key → `key_stage: final`; provisional → the answer with `key_provisional`;
 *   dropped / multiple / conflict → their blocking statuses. The official answer is kept with the
 *   imported original, so a later different answer is detected as "adapted".
 * - `applyHindiPairing`: official Hindi into drafts (`hiSource: "official"`).
 * - Solutions from AI-extracted imports (PDF papers, PDF / Word bank files) are stored as `ai_draft`
 *   whatever the caller declared, so they need a reviewer before approval (`solution_unreviewed`).
 * - `chapterListFor`: the exam's confirmed chapter list (what the model may suggest).
 */

export { chapterListFor };

export interface ImportDraftInput extends QbDraftInput {
  exams?: { exam: QbExam; suggestedDifficulty: QbDifficulty | null }[];
  figureHints?: unknown[];
  passage?: { ref: string; text: Bilingual } | null;
  notes?: string[];
}

export interface KeyMatchInput {
  questionId: string;
  keyImportId: string;
  keyStage: "provisional" | "final";
  keyStatus: "matched" | "dropped" | "multiple_accepted" | "conflict";
  answer: QbAnswer | null;
  accepted: number[] | null;
  note: string | null;
}

export interface HindiPairInput {
  questionId: string;
  hindiImportId: string;
  stemHi: string;
  optionsHi: string[];
  solutionHi: string | null;
  hiSource: "official";
}

const STICKY_IMPORT_FLAGS: readonly QbFlag[] = ["low_confidence", "source_mismatch", "third_party_source", "unsupported_type"];
/** Kinds whose text the model extracted (never the tabular templates staff fill in themselves). */
const AI_EXTRACTED_KINDS: ReadonlySet<string> = new Set(["pdf_paper", "pdf_bank", "docx_bank"]);

/**
 * Whether an import's text came through AI extraction. An unknown import (no row) counts as AI
 * extracted: the safe side, since its solutions then need a reviewer.
 */
function importIsAiExtracted(db: DatabaseSync, importId: string): boolean {
  const row = db.prepare("SELECT kind FROM qb_imports WHERE id = ?").get(importId);
  return !row || AI_EXTRACTED_KINDS.has(String(row.kind));
}

/**
 * A solution the model extracted is a DRAFT whatever the caller declared ("official" or "staff"):
 * `ai_draft` raises the blocking `solution_unreviewed` until a reviewer marks it reviewed.
 */
function withSolutionProvenance(content: QbQuestionContent, aiExtracted: boolean): QbQuestionContent {
  const hasSolution = content.solution.en.trim() !== "" || content.solution.hi.trim() !== "";
  if (!hasSolution) return content.solutionSource === "none" ? content : { ...content, solutionSource: "none" };
  if (aiExtracted && content.solutionSource !== "ai_draft") return { ...content, solutionSource: "ai_draft" };
  return content;
}
const FALLBACK_SUBJECT: Record<QbExam, QbSubject> = { JEE_MAIN: "physics", NEET: "botany", JEE_ADV: "physics", BOH: "physics" };

function cap(text: string | undefined | null): string {
  return (text ?? "").slice(0, RICH_TEXT_LIMITS.fieldChars);
}

function capBilingual(value: Bilingual | undefined): Bilingual {
  return { en: cap(value?.en), hi: cap(value?.hi) };
}

function cleanContent(content: QbQuestionContent): QbQuestionContent {
  return {
    ...content,
    stem: capBilingual(content.stem),
    options: (content.options ?? []).slice(0, 6).map(capBilingual),
    solution: capBilingual(content.solution),
    figures: (content.figures ?? []).slice(0, 12),
    topics: (content.topics ?? []).slice(0, 20),
  };
}

function passageId(importId: string, ref: string): string {
  return `p_${importId}_${ref}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
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

export function upsertImportDrafts(
  importId: string,
  drafts: readonly ImportDraftInput[],
  db: DatabaseSync = qbDb(),
  now: number = Date.now(),
): { created: number; updated: number } {
  let created = 0;
  let updated = 0;
  withTx(db, () => {
    const aiExtracted = importIsAiExtracted(db, importId);
    for (const draft of drafts) {
      if (!draft.sourceKey) continue;
      const content = withSolutionProvenance(cleanContent(draft.content), aiExtracted);
      const source = { ...draft.source, importId };
      const official = source.kind === "official";
      const exam = source.exam ?? draft.exams?.[0]?.exam ?? null;
      const allowedChapters = exam ? new Set(chapterListFor(exam, db).map((c) => c.id)) : new Set<string>();
      const aiChapter = draft.chapterId && allowedChapters.has(draft.chapterId) ? draft.chapterId : null;
      const subject: QbSubject = draft.subject ?? chapterSubject(db, aiChapter) ?? (exam ? FALLBACK_SUBJECT[exam] : "physics");

      if (draft.passage?.text) {
        const pid = passageId(importId, draft.passage.ref);
        db.prepare(
          `INSERT INTO qb_passages (id, subject, content, source, created_by, created_at, updated_by, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, NULL, ?)
           ON CONFLICT (id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
        ).run(pid, subject, JSON.stringify({ stem: capBilingual(draft.passage.text), figures: [] }), JSON.stringify(source), now, now);
        content.passageId = pid;
      }

      const imported: ImportedOriginal = {
        stem: content.stem,
        options: content.options,
        answer: content.answer,
        figureHints: Array.isArray(draft.figureHints) ? draft.figureHints.length : 0,
        ...(draft.notes && draft.notes.length > 0 ? { notes: draft.notes.slice(0, 20).map((n) => String(n).slice(0, 300)) } : {}),
      };
      const stickyFlags = (draft.flags ?? []).filter(
        (f): f is QbFlag => (QB_FLAGS as readonly string[]).includes(f) && (STICKY_IMPORT_FLAGS.includes(f) || f === "figure_needed"),
      );
      const existing = db.prepare("SELECT id, status, updated_by, created_by FROM qb_questions WHERE import_id = ? AND source_key = ?").get(importId, draft.sourceKey);
      const columns = {
        subject,
        ai_chapter_id: aiChapter,
        type: content.type,
        format: content.format,
        content: JSON.stringify(content),
        source_kind: source.kind,
        source: JSON.stringify(source),
        source_exam: official ? (source.exam ?? null) : null,
        source_year: official ? (source.year ?? null) : null,
        source_paper_key: paperKeyOf(source),
        imported: encodeImported(imported),
        pattern_tag: draft.patternTag,
        original_marking: draft.originalMarking ? JSON.stringify(draft.originalMarking) : null,
        key_status: content.answer ? "staff_entered" : "missing",
        key_stage: official ? null : "aspire",
        confidence: Number.isFinite(draft.confidence) ? draft.confidence : null,
        flags: JSON.stringify(stickyFlags.filter((f) => f !== "figure_needed")),
      } as const;

      let id: string;
      if (existing) {
        // Only a draft nobody has touched since the import is refreshed.
        const untouched = existing.status === "draft" && (existing.updated_by === null || existing.updated_by === existing.created_by);
        if (!untouched) continue;
        id = String(existing.id);
        const previous = getQuestionRecord(db, id)!;
        // Keep what later hooks added: a matched answer key and paired official Hindi.
        const keep: QuestionColumns = {};
        if (previous.keyStage === "final" || previous.keyStage === "provisional") {
          const merged = { ...content, answer: previous.content.answer };
          if (previous.content.hiSource === "official" && content.hiSource !== "official") {
            merged.stem = { ...merged.stem, hi: previous.content.stem.hi };
            merged.options = merged.options.map((o, i) => ({ ...o, hi: previous.content.options[i]?.hi ?? o.hi }));
            merged.hiSource = "official";
          }
          keep.content = JSON.stringify(merged);
          keep.key_status = previous.keyStatus;
          keep.key_stage = previous.keyStage;
          keep.imported = encodeImported({
            ...imported,
            officialAnswer: previous.imported?.officialAnswer ?? null,
            officialKeyStage: previous.imported?.officialKeyStage ?? null,
            answer: imported.answer ?? previous.imported?.answer ?? null,
          });
        }
        updateQuestionRow(db, id, { ...columns, ...keep, updated_at: now });
        updated += 1;
      } else {
        id = newQuestionId();
        insertQuestionRow(db, {
          ...columns,
          id,
          n: nextQuestionNumber(db),
          created_by: null,
          created_at: now,
          status: "draft",
          import_id: importId,
          source_key: draft.sourceKey,
          version: 1,
          also_in: "[]",
        });
        created += 1;
      }
      const exams = draft.exams && draft.exams.length > 0 ? draft.exams : exam ? [{ exam, suggestedDifficulty: draft.aiDifficulty }] : [];
      for (const e of exams) {
        const revision = syllabusRevisionYear(db, e.exam);
        const syllabus = official && source.year && source.exam === e.exam && revision !== null && source.year >= revision ? "current" : "unchecked";
        const before = db.prepare("SELECT difficulty FROM qb_question_exams WHERE question_id = ? AND exam = ?").get(id, e.exam);
        writeExamRow(
          db,
          id,
          e.exam,
          {
            eligible: true,
            aiDifficulty: e.suggestedDifficulty ?? draft.aiDifficulty,
            aiReason: draft.aiReason ? draft.aiReason.slice(0, 300) : null,
            ...(before ? {} : { syllabus, syllabusBy: null }),
          },
          now,
        );
      }
      addEvent(db, id, null, existing ? "import_refreshed" : "imported", { importId, sourceKey: draft.sourceKey.slice(0, 60) }, now);
      // figure_needed from the page hints is derived from `imported.figureHints` on refresh.
      refreshQuestionState(db, id);
    }
  });
  return { created, updated };
}

export function applyAnswerKey(matches: readonly KeyMatchInput[], db: DatabaseSync = qbDb(), now: number = Date.now()): { applied: number } {
  let applied = 0;
  withTx(db, () => {
    for (const match of matches) {
      const record = getQuestionRecord(db, match.questionId);
      if (!record || (record.status !== "draft" && record.status !== "in_review")) continue;
      const imported: ImportedOriginal = record.imported ?? { stem: record.content.stem, options: record.content.options, answer: record.content.answer };
      let content = record.content;
      if (match.keyStatus === "matched" && match.answer && match.answer.kind === record.content.type) {
        content = { ...content, answer: match.answer };
        imported.officialAnswer = match.answer;
        imported.officialKeyStage = match.keyStage;
        // The extraction had no key: the original's answer IS the official key.
        if (imported.answer === null) imported.answer = match.answer;
      }
      updateQuestionRow(db, record.id, {
        content: JSON.stringify(content),
        key_status: match.keyStatus,
        key_stage: match.keyStage,
        imported: encodeImported(imported),
        updated_at: now,
      });
      addEvent(db, record.id, null, "answer_key", { keyImportId: match.keyImportId, keyStage: match.keyStage, keyStatus: match.keyStatus, note: match.note?.slice(0, 200) ?? null }, now);
      refreshQuestionState(db, record.id, { skipDuplicates: true });
      applied += 1;
    }
  });
  return { applied };
}

export function applyHindiPairing(pairs: readonly HindiPairInput[], db: DatabaseSync = qbDb(), now: number = Date.now()): { applied: number } {
  let applied = 0;
  withTx(db, () => {
    for (const pair of pairs) {
      const record = getQuestionRecord(db, pair.questionId);
      if (!record || (record.status !== "draft" && record.status !== "in_review")) continue;
      // The paired Hindi paper's text is AI-extracted too: a Hindi solution it adds is a draft.
      const content: QbQuestionContent = withSolutionProvenance(
        {
          ...record.content,
          stem: { ...record.content.stem, hi: cap(pair.stemHi) },
          options:
            pair.optionsHi.length === record.content.options.length
              ? record.content.options.map((o, i) => ({ ...o, hi: cap(pair.optionsHi[i]) }))
              : record.content.options,
          solution: pair.solutionHi ? { ...record.content.solution, hi: cap(pair.solutionHi) } : record.content.solution,
          hiSource: "official",
        },
        Boolean(pair.solutionHi) && importIsAiExtracted(db, pair.hindiImportId),
      );
      const imported = record.imported
        ? {
            ...record.imported,
            stem: { ...record.imported.stem, hi: content.stem.hi },
            options: record.imported.options.map((o, i) => ({ ...o, hi: content.options[i]?.hi ?? o.hi })),
          }
        : null;
      updateQuestionRow(db, record.id, { content: JSON.stringify(content), imported: encodeImported(imported), updated_at: now });
      addEvent(db, record.id, null, "hindi_paired", { hindiImportId: pair.hindiImportId }, now);
      refreshQuestionState(db, record.id, { skipDuplicates: true });
      applied += 1;
    }
  });
  return { applied };
}
