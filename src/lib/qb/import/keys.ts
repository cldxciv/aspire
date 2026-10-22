import type { QbAnswer } from "@/lib/qb/types";

import { normaliseQno, parseAnswer, sameAnswer, subjectFromLabel } from "./parse";
import type { ApplySummary, ImportQuestionRef, KeyMatch, KeyRow } from "./types";

/**
 * Answer keys (docs/question-bank-plan.md §B8.7). Rows come from a key PDF (Claude table
 * extraction) or a key CSV, and are matched to bank questions of the paper:
 *   1. the NTA question ID;
 *   2. (subject, question number, booklet);
 *   3. question number alone, only when exactly one question has it.
 * A row whose question ID matches nothing is never matched by number when the paper's questions
 * have IDs: JEE Main shifts share the numbers 1–90 but never the IDs, so a key for another shift
 * would otherwise match every question by number.
 * Results: a FINAL key sets `key_stage: final` (clears `answer_missing`); a PROVISIONAL key sets the
 * answer but leaves `key_provisional`; `dropped` / `bonus` → `key_dropped`; `multiple` →
 * `multiple_accepted`; two answers that disagree (inside one key, or a final key against an earlier
 * final key) → `answer_conflict`. Pure; QB-CORE-B's `applyAnswerKey` writes the result.
 */

interface Candidate {
  question: ImportQuestionRef;
  rows: KeyRow[];
}

function bookletOf(value: string | null | undefined): string | null {
  const cleaned = value?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  return cleaned || null;
}

function bookletCompatible(rowBooklet: string | null, question: ImportQuestionRef): boolean {
  const a = bookletOf(rowBooklet);
  const b = bookletOf(question.booklet);
  return a === null || b === null || a === b;
}

export function matchKeyRows(input: {
  keyImportId: string;
  keyStage: KeyMatch["keyStage"];
  /** The key file's own booklet (job metadata), used when rows carry none. */
  booklet: string | null;
  rows: readonly KeyRow[];
  questions: readonly ImportQuestionRef[];
}): { matches: KeyMatch[]; summary: ApplySummary } {
  const summary: ApplySummary = { rows: input.rows.length, matched: 0, unmatched: [], dropped: 0, multiple: 0, conflicts: 0 };
  const byRef = new Map<string, ImportQuestionRef>();
  for (const question of input.questions) if (question.questionRef) byRef.set(question.questionRef.trim(), question);

  const candidates = new Map<string, Candidate>();
  const attach = (question: ImportQuestionRef, row: KeyRow) => {
    const entry = candidates.get(question.id) ?? { question, rows: [] };
    entry.rows.push(row);
    candidates.set(question.id, entry);
  };

  const paperHasIds = byRef.size > 0;
  for (const row of input.rows) {
    const rowBooklet = row.booklet ?? input.booklet;
    if (row.questionRef) {
      const question = byRef.get(row.questionRef.trim());
      if (question) {
        if (bookletCompatible(rowBooklet, question)) attach(question, row);
        else summary.unmatched.push({ line: row.line, qno: row.qno, reason: "booklet_mismatch" });
        continue;
      }
      if (paperHasIds || !row.qno) {
        summary.unmatched.push({ line: row.line, qno: row.qno, reason: "question_id_not_found" });
        continue;
      }
    }
    const qno = normaliseQno(row.qno);
    if (!qno) {
      summary.unmatched.push({ line: row.line, qno: row.qno, reason: "qno_missing" });
      continue;
    }
    const subject = subjectFromLabel(row.subject);
    let pool = input.questions.filter((question) => normaliseQno(question.qno) === qno && bookletCompatible(rowBooklet, question));
    if (subject) {
      const bySubject = pool.filter((question) => question.subject === subject || (subject === "biology" && (question.subject === "botany" || question.subject === "zoology")));
      if (bySubject.length > 0) pool = bySubject;
    }
    if (pool.length === 1) attach(pool[0], row);
    else summary.unmatched.push({ line: row.line, qno: row.qno, reason: pool.length === 0 ? "qno_not_found" : "qno_ambiguous" });
  }

  const matches: KeyMatch[] = [];
  for (const { question, rows } of candidates.values()) {
    const base = { questionId: question.id, keyImportId: input.keyImportId, keyStage: input.keyStage, note: null as string | null };
    if (rows.some((row) => row.status === "dropped" || row.status === "bonus")) {
      matches.push({ ...base, keyStatus: "dropped", answer: null, accepted: null });
      summary.dropped += 1;
      summary.matched += rows.length;
      continue;
    }
    const answers: QbAnswer[] = [];
    let accepted: number[] | null = null;
    let failed: string | null = null;
    for (const row of rows) {
      if (row.status === "multiple" && question.type !== "multiple") {
        const parsed = parseAnswer(row.answer, { type: "multiple", optionCount: question.optionCount, optionRefs: question.optionRefs });
        if (!parsed.ok || parsed.answer.kind !== "multiple") {
          failed = parsed.ok ? "answer_invalid" : parsed.reason;
          break;
        }
        accepted = [...new Set([...(accepted ?? []), ...parsed.answer.indices])].sort((a, b) => a - b);
        continue;
      }
      const parsed = parseAnswer(row.answer, { type: question.type, optionCount: question.optionCount, optionRefs: question.optionRefs });
      if (!parsed.ok) {
        failed = parsed.reason;
        break;
      }
      answers.push(parsed.answer);
    }
    if (failed) {
      for (const row of rows) summary.unmatched.push({ line: row.line, qno: row.qno, reason: failed });
      continue;
    }
    summary.matched += rows.length;
    if (accepted) {
      matches.push({ ...base, keyStatus: "multiple_accepted", answer: null, accepted });
      summary.multiple += 1;
      continue;
    }
    const first = answers[0] ?? null;
    if (answers.some((answer) => !sameAnswer(answer, first))) {
      matches.push({ ...base, keyStatus: "conflict", answer: null, accepted: null, note: "the key gives different answers for this question" });
      summary.conflicts += 1;
      continue;
    }
    // An earlier FINAL key that disagrees is a conflict; a provisional key never overrides a final one.
    if (question.keyStage === "final" || question.keyStage === "staff_verified") {
      if (input.keyStage === "provisional") continue;
      if (question.answer && !sameAnswer(question.answer, first)) {
        matches.push({ ...base, keyStatus: "conflict", answer: first, accepted: null, note: "differs from the final key already applied" });
        summary.conflicts += 1;
        continue;
      }
    }
    matches.push({ ...base, keyStatus: "matched", answer: first, accepted: null });
  }
  return { matches, summary };
}

/** Key CSV columns (template.ts writes the same header). */
export const KEY_CSV_COLUMNS = ["qno", "question_id", "subject", "booklet", "answer", "status"] as const;

/** Rows of a key CSV (header row first) → key rows plus per-row problems. */
export function keyRowsFromTable(table: readonly (readonly string[])[]): { rows: KeyRow[]; errors: { row: number; column: string | null; code: string }[] } {
  const errors: { row: number; column: string | null; code: string }[] = [];
  const rows: KeyRow[] = [];
  if (table.length === 0) return { rows, errors: [{ row: 1, column: null, code: "header_missing" }] };
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("answer") < 0) errors.push({ row: 1, column: "answer", code: "column_missing" });
  if (col("qno") < 0 && col("question_id") < 0) errors.push({ row: 1, column: "qno", code: "column_missing" });
  for (const name of header) {
    if (name && !(KEY_CSV_COLUMNS as readonly string[]).includes(name)) errors.push({ row: 1, column: name, code: "unknown_column" });
  }
  if (errors.length > 0) return { rows, errors };
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (name: string) => {
      const at = col(name);
      const value = at >= 0 ? (cells[at] ?? "").trim() : "";
      return value || null;
    };
    const status = (get("status") ?? "normal").toLowerCase();
    if (!["normal", "dropped", "bonus", "multiple"].includes(status)) {
      errors.push({ row: line, column: "status", code: "invalid_status" });
      return;
    }
    const qno = get("qno");
    const questionRef = get("question_id");
    const answer = get("answer") ?? "";
    if (!qno && !questionRef) {
      errors.push({ row: line, column: "qno", code: "required" });
      return;
    }
    if (!answer && status === "normal") {
      errors.push({ row: line, column: "answer", code: "required" });
      return;
    }
    rows.push({ qno, questionRef, subject: get("subject"), booklet: get("booklet"), answer, status: status as KeyRow["status"], line });
  });
  return { rows, errors };
}
