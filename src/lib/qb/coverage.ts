import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { qbCan } from "./access";
import { qbDb } from "./db";
import { parseJson } from "./repo/json";
import { forbidden, ok, type QbResult } from "./result";
import { allChapters } from "./taxonomy";
import type { Bilingual, QbDifficulty, QbExam, QbLevel, QbSourceKind, QbSubject, QbViewer } from "./types";

/**
 * Coverage for staff (owner: QB-CORE-B; §B7, R16, R24): per chapter of an exam, approved pool items by
 * difficulty, questions in review and in draft, the figure backlog; the answer-position distribution
 * of single-correct questions per source kind (option skew); chapters waiting for figures.
 */

export interface QbCoverage {
  exam: QbExam;
  subjects: {
    subject: QbSubject;
    chapters: {
      chapterId: string;
      label: Bilingual;
      level: QbLevel;
      approved: Record<QbDifficulty, number>;
      inReview: number;
      drafts: number;
      figureBacklog: number;
    }[];
  }[];
  answerPositions: { sourceKind: QbSourceKind; counts: number[]; total: number }[];
  figureAlerts: { chapterId: string; label: Bilingual; waiting: number }[];
  totals: { approved: number; inReview: number; drafts: number; flagged: number };
}

export function coverageReport(viewer: QbViewer, input: { exam: QbExam; subject?: QbSubject }, db: DatabaseSync = qbDb()): QbResult<QbCoverage> {
  if (!qbCan(viewer, "view")) return forbidden();
  const exam = input.exam;
  const chapters = allChapters(db).filter((c) => c.active && c.examStatus[exam] !== undefined && (!input.subject || c.subject === input.subject));

  const approved = new Map<string, Record<QbDifficulty, number>>();
  for (const row of db.prepare("SELECT chapter_id, difficulty, COUNT(*) AS n FROM qb_pool WHERE exam = ? GROUP BY chapter_id, difficulty").all(exam)) {
    const cell = approved.get(String(row.chapter_id)) ?? { easy: 0, medium: 0, hard: 0 };
    cell[row.difficulty as QbDifficulty] += Number(row.n);
    approved.set(String(row.chapter_id), cell);
  }
  const counts = new Map<string, { inReview: number; drafts: number; figureBacklog: number }>();
  const rows = db
    .prepare(
      `SELECT q.chapter_id, q.status, q.flags FROM qb_questions q
         WHERE q.chapter_id IS NOT NULL AND q.status IN ('draft', 'in_review')
           AND EXISTS (SELECT 1 FROM qb_question_exams e WHERE e.question_id = q.id AND e.exam = ?)`,
    )
    .all(exam);
  for (const row of rows) {
    const key = String(row.chapter_id);
    const entry = counts.get(key) ?? { inReview: 0, drafts: 0, figureBacklog: 0 };
    if (row.status === "in_review") entry.inReview += 1;
    else entry.drafts += 1;
    if (parseJson<string[]>(row.flags, []).includes("figure_needed")) entry.figureBacklog += 1;
    counts.set(key, entry);
  }

  const bySubject = new Map<QbSubject, QbCoverage["subjects"][number]["chapters"]>();
  for (const chapter of chapters) {
    const list = bySubject.get(chapter.subject) ?? [];
    const c = counts.get(chapter.id) ?? { inReview: 0, drafts: 0, figureBacklog: 0 };
    list.push({
      chapterId: chapter.id,
      label: chapter.label,
      level: chapter.level,
      approved: approved.get(chapter.id) ?? { easy: 0, medium: 0, hard: 0 },
      ...c,
    });
    bySubject.set(chapter.subject, list);
  }

  const positions = new Map<QbSourceKind, number[]>();
  for (const row of db
    .prepare(
      `SELECT q.source_kind, q.content FROM qb_questions q
         WHERE q.status = 'approved' AND q.type = 'single'
           AND EXISTS (SELECT 1 FROM qb_question_exams e WHERE e.question_id = q.id AND e.exam = ? AND e.eligible = 1)`,
    )
    .all(exam)) {
    const answer = parseJson<{ answer?: { kind?: string; index?: number } | null }>(row.content, {}).answer;
    if (answer?.kind !== "single" || typeof answer.index !== "number") continue;
    const kind = row.source_kind as QbSourceKind;
    const list = positions.get(kind) ?? [0, 0, 0, 0];
    while (list.length <= answer.index) list.push(0);
    list[answer.index] += 1;
    positions.set(kind, list);
  }

  const totalsRow = (status: string) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM qb_questions q WHERE q.status = ?
             AND EXISTS (SELECT 1 FROM qb_question_exams e WHERE e.question_id = q.id AND e.exam = ?)`,
        )
        .get(status, exam)?.n ?? 0,
    );
  const flagged = Number(
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM qb_questions q WHERE q.flags <> '[]' AND q.status NOT IN ('rejected', 'retired')
           AND EXISTS (SELECT 1 FROM qb_question_exams e WHERE e.question_id = q.id AND e.exam = ?)`,
      )
      .get(exam)?.n ?? 0,
  );
  const subjects = [...bySubject.entries()].map(([subject, list]) => ({ subject, chapters: list }));
  return ok({
    exam,
    subjects,
    answerPositions: [...positions.entries()].map(([sourceKind, list]) => ({ sourceKind, counts: list, total: list.reduce((a, b) => a + b, 0) })),
    figureAlerts: subjects
      .flatMap((s) => s.chapters)
      .filter((c) => c.figureBacklog > 0)
      .map((c) => ({ chapterId: c.chapterId, label: c.label, waiting: c.figureBacklog })),
    totals: {
      approved: Number(db.prepare("SELECT COUNT(*) AS n FROM qb_pool WHERE exam = ?").get(exam)?.n ?? 0),
      inReview: totalsRow("in_review"),
      drafts: totalsRow("draft"),
      flagged,
    },
  });
}
