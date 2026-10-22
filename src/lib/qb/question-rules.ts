import { normaliseForFidelity } from "./fingerprint";
import { isOfficialSourceUrl } from "./official-hosts";
import { figureIndicesIn } from "./rich-text";
import type {
  Bilingual,
  QbAnswer,
  QbExam,
  QbFidelity,
  QbFlag,
  QbKeyStage,
  QbKeyStatus,
  QbQuestionContent,
  QbQuestionExam,
  QbSource,
  QbSourceKind,
} from "./types";
import { QB_BLOCKING_FLAGS, QB_BULK_EXCLUDED_FLAGS } from "./types";

/**
 * Question rules (owner: QB-CORE-B; §B2, §B7): which flags a question carries, the fidelity diff
 * against its imported original, and source completeness. Pure (server-side: uses the fingerprint
 * normaliser).
 *
 * Flags are of two kinds:
 * - DERIVED flags are recomputed from the question on every save (answer, options, math, Hindi,
 *   chapter, difficulty, source evidence, solution review, fidelity, answer-key state, figures); a save
 *   may also ADD the sticky `third_party_source` (official evidence on a non-official site);
 * - STICKY flags are set by an import, the duplicate check, statistics or a student report, and stay
 *   until a reviewer resolves them (`clear_flag`, a duplicate decision, a report resolution).
 */

export const DERIVED_FLAGS: readonly QbFlag[] = [
  "answer_missing",
  "options_incomplete",
  "math_error",
  "hi_missing",
  "hi_machine",
  "chapter_missing",
  "difficulty_missing",
  "source_incomplete",
  "solution_unreviewed",
  "fidelity_unconfirmed",
  "key_provisional",
  "key_dropped",
  "multiple_accepted",
  "answer_conflict",
  "figure_needed",
];

export const STICKY_FLAGS: readonly QbFlag[] = [
  "low_confidence",
  "source_mismatch",
  "third_party_source",
  "unsupported_type",
  "exact_duplicate",
  "near_duplicate",
  "negative_discrimination",
  "student_report",
];

export function blockingFlagsOf(flags: readonly QbFlag[]): QbFlag[] {
  return flags.filter((f) => QB_BLOCKING_FLAGS.includes(f));
}

export function bulkExcludedFlagsOf(flags: readonly QbFlag[]): QbFlag[] {
  return flags.filter((f) => QB_BULK_EXCLUDED_FLAGS.includes(f));
}

// ---------------------------------------------------------------------------------------------
// Answers and fidelity

export function answersEqual(a: QbAnswer | null | undefined, b: QbAnswer | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "single" && b.kind === "single") return a.index === b.index;
  if (a.kind === "multiple" && b.kind === "multiple") {
    const x = [...a.indices].sort((p, q) => p - q);
    const y = [...b.indices].sort((p, q) => p - q);
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  if (a.kind === "numerical" && b.kind === "numerical") {
    const close = (p: number | undefined, q: number | undefined) => (p === undefined && q === undefined) || (p !== undefined && q !== undefined && Math.abs(p - q) < 1e-9);
    return close(a.value, b.value) && close(a.low, b.low) && close(a.high, b.high);
  }
  return false;
}

/** Case-preserving comparison (not the duplicate fingerprint's lowercase / NFKC form). */
function sameText(a: string, b: string): boolean {
  return normaliseForFidelity(a) === normaliseForFidelity(b);
}

/**
 * Whether the stem, options (in order) or answer differ from the imported original after
 * normalisation (whitespace, LaTeX spacing, `$` versus `\(` only: a change of letter case, 'x²' to
 * 'x2' or any other character is a difference). Hindi is compared only where the original had Hindi.
 */
export function differsFromOriginal(
  content: Pick<QbQuestionContent, "stem" | "options" | "answer">,
  original: { stem: Bilingual; options: Bilingual[]; answer: QbAnswer | null },
): boolean {
  if (!sameText(content.stem.en, original.stem.en)) return true;
  if (original.stem.hi.trim() !== "" && !sameText(content.stem.hi, original.stem.hi)) return true;
  if (content.options.length !== original.options.length) return true;
  for (let i = 0; i < content.options.length; i += 1) {
    if (!sameText(content.options[i].en, original.options[i].en)) return true;
    if (original.options[i].hi.trim() !== "" && !sameText(content.options[i].hi, original.options[i].hi)) return true;
  }
  return !answersEqual(content.answer, original.answer);
}

/** Whether a content edit changed what students would read or the key (not only the solution or labels). */
export function questionChanged(
  before: Pick<QbQuestionContent, "stem" | "options" | "answer">,
  after: Pick<QbQuestionContent, "stem" | "options" | "answer">,
): boolean {
  return differsFromOriginal(after, before);
}

// ---------------------------------------------------------------------------------------------
// Sources

/** The paper identity an official source needs: shift (JEE Main), booklet (NEET), paper (JEE Advanced). */
export function paperIdentityPresent(source: QbSource): boolean {
  switch (source.exam) {
    case "JEE_MAIN":
      return Boolean(source.shift?.trim() || (source.date && source.session?.trim()));
    case "NEET":
      return Boolean(source.booklet?.trim() || source.date);
    case "JEE_ADV":
      return Boolean(source.paper?.trim());
    case "BOH":
      return true;
    default:
      return false;
  }
}

/** Official sources need exam, year, paper identity and an import or evidence (URL + page). */
export function officialSourceComplete(source: QbSource, importId: string | null): boolean {
  if (!source.exam || !source.year) return false;
  if (!paperIdentityPresent(source)) return false;
  if (importId || source.importId) return true;
  return Boolean(source.evidenceUrl && source.evidencePage);
}

/** `source_paper_key`: 'JEE_MAIN|2024|2024-01-27|January|Shift 1|Paper 1' (null for non-official). */
export function paperKeyOf(source: QbSource): string | null {
  if (source.kind !== "official" || !source.exam || !source.year) return null;
  return [source.exam, source.year, source.date ?? "", source.session ?? "", source.shift ?? source.booklet ?? "", source.paper ?? ""].join("|");
}

// ---------------------------------------------------------------------------------------------
// Flags

export interface FlagInput {
  content: QbQuestionContent;
  sourceKind: QbSourceKind;
  source: QbSource;
  importId: string | null;
  chapterId: string | null;
  exams: readonly Pick<QbQuestionExam, "exam" | "eligible" | "difficulty">[];
  keyStatus: QbKeyStatus;
  keyStage: QbKeyStage | null;
  fidelity: QbFidelity | null;
  imported: { stem: Bilingual; options: Bilingual[]; answer: QbAnswer | null; figureHints?: number } | null;
  mathError: boolean;
}

function optionsIncomplete(content: QbQuestionContent): boolean {
  if (content.type === "numerical") return content.options.length > 0;
  if (content.options.length < 2 || content.options.length > 6) return true;
  if (content.options.some((o) => o.en.trim() === "" && o.hi.trim() === "")) return true;
  const answer = content.answer;
  if (answer?.kind === "single") return answer.index >= content.options.length || answer.kind !== content.type;
  if (answer?.kind === "multiple") return answer.indices.some((i) => i >= content.options.length) || content.type !== "multiple";
  // Only a numerical answer is left here, and this is a choice question: the answer does not fit.
  return answer !== null;
}

function figuresMissing(content: QbQuestionContent, figureHints: number): boolean {
  const slots: { text: string; slot: string }[] = [
    { text: `${content.stem.en}\n${content.stem.hi}`, slot: "stem" },
    { text: `${content.solution.en}\n${content.solution.hi}`, slot: "solution" },
    ...content.options.map((o, i) => ({ text: `${o.en}\n${o.hi}`, slot: `option:${i}` })),
  ];
  for (const { text, slot } of slots) {
    const count = content.figures.filter((f) => f.slot === slot).length;
    if (figureIndicesIn(text).some((index) => index > count)) return true;
  }
  return figureHints > 0 && content.figures.length === 0;
}

/** The derived flags of a question (see DERIVED_FLAGS). */
export function derivedFlags(input: FlagInput): Set<QbFlag> {
  const flags = new Set<QbFlag>();
  const { content } = input;
  const official = input.sourceKind === "official";
  if (content.answer === null) flags.add("answer_missing");
  if (optionsIncomplete(content)) flags.add("options_incomplete");
  if (input.mathError) flags.add("math_error");
  if (content.hiSource === "none" || content.stem.hi.trim() === "") flags.add("hi_missing");
  if (content.hiSource === "machine_draft") flags.add("hi_machine");
  if (!input.chapterId) flags.add("chapter_missing");
  const eligible = input.exams.filter((e) => e.eligible);
  if (eligible.length === 0 || eligible.some((e) => e.difficulty === null)) flags.add("difficulty_missing");
  if (official && !officialSourceComplete(input.source, input.importId)) flags.add("source_incomplete");
  // Evidence on anything but the issuer's own site is a copy (§B2): third_party_source is STICKY, so it
  // stays after the link is fixed until an admin clears it with the official URL.
  if (official && input.source.evidenceUrl && !isOfficialSourceUrl(input.source.evidenceUrl)) flags.add("third_party_source");
  if (content.solutionSource === "ai_draft") flags.add("solution_unreviewed");
  if (
    official &&
    input.imported &&
    differsFromOriginal(content, input.imported) &&
    input.fidelity !== "transcription_fixed" &&
    input.fidelity !== "adapted"
  ) {
    flags.add("fidelity_unconfirmed");
  }
  if (input.keyStatus === "dropped") flags.add("key_dropped");
  if (input.keyStatus === "multiple_accepted") flags.add("multiple_accepted");
  if (input.keyStatus === "conflict") flags.add("answer_conflict");
  if (official && content.answer !== null && input.keyStage !== "final" && input.keyStage !== "staff_verified") flags.add("key_provisional");
  if (figuresMissing(content, input.imported?.figureHints ?? 0)) flags.add("figure_needed");
  return flags;
}

/** Sticky flags kept, derived flags replaced. */
export function mergeFlags(existing: readonly QbFlag[], derived: ReadonlySet<QbFlag>): QbFlag[] {
  const sticky = existing.filter((f) => !DERIVED_FLAGS.includes(f));
  return [...new Set([...sticky, ...derived])];
}

/** The fidelity a save leaves: verbatim when equal to the original, `adapted` when the answer differs from the final key. */
export function nextFidelity(input: {
  official: boolean;
  previous: QbFidelity | null;
  content: QbQuestionContent;
  imported: { stem: Bilingual; options: Bilingual[]; answer: QbAnswer | null; officialAnswer?: QbAnswer | null; officialKeyStage?: string | null } | null;
  questionChangedNow: boolean;
}): QbFidelity | null {
  if (!input.official || !input.imported) return input.previous;
  const finalKey = input.imported.officialKeyStage === "final" ? input.imported.officialAnswer ?? null : null;
  if (finalKey && input.content.answer && !answersEqual(input.content.answer, finalKey)) return "adapted";
  if (!differsFromOriginal(input.content, input.imported)) return input.previous === "adapted" ? "adapted" : "verbatim";
  if (input.previous === "adapted") return "adapted";
  // A further change after a "transcription fixed" decision needs a fresh decision.
  if (input.previous === "transcription_fixed" && !input.questionChangedNow) return "transcription_fixed";
  return null;
}

/** The exams a question is eligible for (for pool rows and checklists). */
export function eligibleExams(exams: readonly Pick<QbQuestionExam, "exam" | "eligible">[]): QbExam[] {
  return exams.filter((e) => e.eligible).map((e) => e.exam);
}
