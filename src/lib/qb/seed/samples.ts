import { MOCK_QUESTIONS } from "@/content/mocktest";
import type { MockExam, MockQuestion } from "@/content/mocktest/types";
import type { QbAnswer, QbDifficulty, QbExam, QbQuestionContent, QbSource, QbSubject } from "@/lib/qb/types";

/**
 * The demo SAMPLE questions of src/content/mocktest (QB-SEED, docs/question-bank-plan.md §B14.3) as
 * question-bank records. Pure conversion, no I/O; ./index.ts writes them, and only while
 * showPlaceholderContent() is on.
 *
 * Honesty: every record is `source_kind: "sample"` with the source `{ kind: "sample" }`, so the public
 * label is "Sample question (written for this demo)". Nothing here is an official or "past year"
 * question. The content files are never edited (they stay the source of the fixed sample tests).
 *
 * - Chapter = the question's MOCK_TOPICS topic (every topic id is a seeded chapter), except the two
 *   samples whose umbrella topic was split into finer chapters (SAMPLE_CHAPTER_OVERRIDES).
 * - Exam rows: only the exam named in the content file (JEE_MAIN or NEET), difficulty from the file,
 *   `difficulty_source: "sample"`.
 * - Hindi: the content files say "Hindi is a machine-assisted draft pending native review", so
 *   `hiSource: "machine_draft"` with the non-blocking flag `hi_machine`. Such questions are never used
 *   on their own in Hindi mode (`qb_pool.hi_ok = 0`), so a Hindi sample paper is honestly "thin".
 * - Solutions: written for the demo and re-solved by the CONTENT-VERIFY pass (build agents), NOT by
 *   Aspire staff. The enum has no closer value: "ai_draft" is a blocking flag (`solution_unreviewed`)
 *   that would make an approved sample invalid, so `solutionSource: "ai_draft_reviewed"` is used and
 *   the real reviewer is recorded on the "seeded" event (SAMPLE_SOLUTION_REVIEW). The admin label for
 *   "ai_draft_reviewed" says "reviewed by staff"; for `source_kind = "sample"` the admin UI must show
 *   SAMPLE_SOLUTION_REVIEW instead, and staff review sample solutions before relying on them.
 * - Numerical answers keep their unit; a numerical with an integer answer and no tolerance is
 *   `integer: true` (fits JEE Main's integer-only Section B); a tolerance becomes a low/high range.
 * - neet-z-01 was withdrawn by CONTENT-VERIFY (chapter not in the NEET-UG syllabus). It is not in the
 *   content files and is never seeded; its id stays reserved (RESERVED_QUESTION_IDS).
 */

/**
 * Who actually checked the seeded sample solutions (written on each sample's "seeded" event, so the
 * audit trail never implies a staff review). `reviewedBy` is machine-readable for the admin UI.
 */
export const SAMPLE_SOLUTION_REVIEW = {
  reviewedBy: "build_agents_not_staff",
  note: "Sample solution written for the demo and re-solved by build agents (CONTENT-VERIFY), not reviewed by Aspire staff.",
} as const;

/** Question ids that must never be created (withdrawn samples). Staff-made ids are "q_…" anyway. */
export const RESERVED_QUESTION_IDS: readonly string[] = ["neet-z-01"];

/**
 * Samples whose MOCK_TOPICS topic is an umbrella that the taxonomy now splits (./chapters.ts): the
 * question goes to the finer chapter that matches its content. Same subject in every case.
 */
export const SAMPLE_CHAPTER_OVERRIDES: Readonly<Record<string, { chapterId: string; reason: string }>> = {
  "jee-m-08": {
    chapterId: "math-circles",
    reason: "Asks for the centre and radius of a circle; topic math-coordinate is now 'Straight lines'.",
  },
  "jee-m-11": {
    chapterId: "math-definite-integrals",
    reason: "A definite integral; topic math-integrals is now 'Indefinite integrals'.",
  },
};

export interface SeedSample {
  id: string;
  exam: Extract<QbExam, MockExam>;
  subject: QbSubject;
  chapterId: string;
  difficulty: QbDifficulty;
  content: QbQuestionContent;
  source: QbSource;
  /** Integer numerical answer (JEE Main Section B eligible). */
  answerInteger: boolean;
}

function answerOf(question: MockQuestion): QbAnswer {
  if (question.type === "mcq") return { kind: "single", index: question.answer };
  const tolerance = Math.abs(question.tolerance);
  const integer = Number.isInteger(question.answer) && tolerance === 0;
  const answer: Extract<QbAnswer, { kind: "numerical" }> = { kind: "numerical", value: question.answer, integer };
  if (tolerance > 0) {
    answer.low = question.answer - tolerance;
    answer.high = question.answer + tolerance;
  }
  if (question.unit) answer.unit = { en: question.unit.en, hi: question.unit.hi };
  return answer;
}

export function sampleToSeed(question: MockQuestion): SeedSample {
  const override = SAMPLE_CHAPTER_OVERRIDES[question.id];
  const content: QbQuestionContent = {
    type: question.type === "mcq" ? "single" : "numerical",
    format: "standard",
    passageId: null,
    passageOrder: null,
    stem: { en: question.stem.en, hi: question.stem.hi },
    options: question.type === "mcq" ? question.options.map((o) => ({ en: o.en, hi: o.hi })) : [],
    answer: answerOf(question),
    solution: { en: question.solution.en, hi: question.solution.hi },
    solutionSource: "ai_draft_reviewed",
    hiSource: "machine_draft",
    figures: [],
    topics: [],
  };
  return {
    id: question.id,
    exam: question.exam,
    subject: question.subject,
    chapterId: override?.chapterId ?? question.topic,
    difficulty: question.difficulty,
    content,
    source: { kind: "sample" },
    answerInteger: content.answer?.kind === "numerical" && content.answer.integer,
  };
}

/** Every sample in the content files, as seed records (withdrawn ids excluded). */
export function seedSamples(questions: readonly MockQuestion[] = MOCK_QUESTIONS): SeedSample[] {
  return questions.filter((q) => !RESERVED_QUESTION_IDS.includes(q.id)).map(sampleToSeed);
}
