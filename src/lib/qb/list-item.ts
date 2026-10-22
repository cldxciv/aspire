import "server-only";

import { sourceLabelStaff } from "./labels";
import type { QuestionRecord } from "./repo/questions";
import type { QbQuestionContent, QbQuestionExam } from "./types";
import type { QbQuestionListItem } from "./views";

/** The staff list row of a question (owner: QB-CORE-B). Shared by questions, duplicates and reports. */

export function stemPreview(content: Pick<QbQuestionContent, "stem">): string {
  const text = (content.stem.en || content.stem.hi).replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export function listItemOf(record: QuestionRecord, exams: readonly QbQuestionExam[]): QbQuestionListItem {
  return {
    id: record.id,
    n: record.n,
    status: record.status,
    suspended: record.suspended,
    version: record.version,
    approvedVersion: record.approvedVersion,
    subject: record.subject,
    chapterId: record.chapterId,
    type: record.content.type,
    format: record.content.format,
    stemPreview: stemPreview(record.content),
    sourceKind: record.sourceKind,
    sourceLabel: sourceLabelStaff({ source: record.source, fidelity: record.fidelity, adaptedNote: record.adaptedNote }, "en"),
    exams: exams.map((e) => ({ exam: e.exam, eligible: e.eligible, difficulty: e.difficulty, syllabus: e.syllabus })),
    flags: record.flags,
    hasFigures: record.content.figures.length > 0,
    importId: record.importId,
    updatedAt: record.updatedAt,
  };
}
