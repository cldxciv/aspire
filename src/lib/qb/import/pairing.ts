import { normaliseQno, subjectFromLabel } from "./parse";
import { sourceKeyOf } from "./normalize";
import type { ApplySummary, ExtractedQuestion, HindiPair, ImportQuestionRef } from "./types";

/**
 * Official Hindi for English questions (docs/question-bank-plan.md §B8.8). A Hindi import with
 * `pairsWith` (the English paper's import) is extracted like a paper; each Hindi question is then
 * matched to its English question by question ID, else by source key (`subject:section:qno`), else
 * by subject + question number, else by question number when unique. A pair needs the same number
 * of options. Pure; QB-CORE-B's `applyHindiPairing` writes `stem.hi` and `options[].hi` with
 * `hiSource: "official"`. Pairing is for OFFICIAL papers only (jobs.ts `metaProblem` refuses an
 * Aspire Hindi paper), and official papers print no solutions, so no Hindi solution is ever paired:
 * solution text the reader returned would be its own writing.
 */

export function pairHindi(input: {
  hindiImportId: string;
  questions: readonly ExtractedQuestion[];
  targets: readonly ImportQuestionRef[];
  normaliseDollarMath: (text: string) => string;
}): { pairs: HindiPair[]; summary: ApplySummary } {
  const summary: ApplySummary = { rows: input.questions.length, matched: 0, unmatched: [], dropped: 0, multiple: 0, conflicts: 0 };
  const pairs: HindiPair[] = [];
  const used = new Set<string>();
  const byRef = new Map<string, ImportQuestionRef>();
  const byKey = new Map<string, ImportQuestionRef>();
  for (const target of input.targets) {
    if (target.questionRef) byRef.set(target.questionRef, target);
    if (target.sourceKey) byKey.set(target.sourceKey, target);
  }

  input.questions.forEach((question, index) => {
    const line = index + 1;
    let target: ImportQuestionRef | undefined;
    if (question.questionRef) target = byRef.get(question.questionRef.trim());
    if (!target) target = byKey.get(sourceKeyOf(question, "pdf_paper"));
    if (!target) {
      const qno = normaliseQno(question.qno);
      const subject = subjectFromLabel(question.subject);
      const sameNumber = input.targets.filter((t) => normaliseQno(t.qno) === qno);
      const sameSubject = subject ? sameNumber.filter((t) => t.subject === subject) : [];
      if (sameSubject.length === 1) target = sameSubject[0];
      else if (!subject && sameNumber.length === 1) target = sameNumber[0];
    }
    if (!target) {
      summary.unmatched.push({ line, qno: question.qno, reason: "no_english_question" });
      return;
    }
    if (used.has(target.id)) {
      summary.unmatched.push({ line, qno: question.qno, reason: "already_paired" });
      return;
    }
    const options = target.type === "numerical" ? [] : question.options;
    if (options.length !== target.optionCount) {
      summary.unmatched.push({ line, qno: question.qno, reason: "option_count" });
      return;
    }
    used.add(target.id);
    summary.matched += 1;
    pairs.push({
      questionId: target.id,
      hindiImportId: input.hindiImportId,
      stemHi: input.normaliseDollarMath(question.stem),
      optionsHi: options.map((option) => input.normaliseDollarMath(option)),
      solutionHi: null,
      hiSource: "official",
    });
  });
  return { pairs, summary };
}
