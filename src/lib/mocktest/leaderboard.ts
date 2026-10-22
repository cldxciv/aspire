/**
 * Leaderboard ranking (pure, client-safe). Higher score first, then less time, then earlier
 * submission — both times as measured by the SERVER (QA-SEC-M6 M1). Equal score AND time share a
 * rank ("1, 2, 2, 4").
 */

/**
 * The schools table lists a school only when at least this many opted-in students show it, so a
 * school's best score cannot be matched to one nickname (QA-SEC-M6 L6).
 */
export const SCHOOL_MIN_PARTICIPANTS = 3;

export interface RankableEntry {
  score: number;
  timeTakenSec: number;
  submittedAt: number;
}

export function compareEntries(a: RankableEntry, b: RankableEntry): number {
  return b.score - a.score || a.timeTakenSec - b.timeTakenSec || a.submittedAt - b.submittedAt;
}

export function rankEntries<T extends RankableEntry>(entries: readonly T[]): (T & { rank: number })[] {
  const sorted = entries.slice().sort(compareEntries);
  let rank = 0;
  return sorted.map((entry, index) => {
    const previous = sorted[index - 1];
    if (!previous || previous.score !== entry.score || previous.timeTakenSec !== entry.timeTakenSec) rank = index + 1;
    return { ...entry, rank };
  });
}

// ---------------------------------------------------------------------------------------------
// Monthly ranked papers of generated mocks (docs/question-bank-plan.md §B10.3)

/**
 * A ranked-board entry: everyone sat the same paper, so the official tie-break applies instead of
 * time. `tiebreak` is computed when the attempt is saved (`tieBreakVector`), oriented so that a
 * HIGHER value is always better (wrong ÷ correct ratios are stored negated).
 */
export interface RankedEntry {
  score: number;
  tiebreak: readonly number[] | null;
}

/**
 * Score first, then the tie-break vector in order. Time is NOT a criterion (official rules), so
 * entries equal on every criterion compare as 0 and share a rank. A missing vector (an attempt saved
 * before tie-breaks existed) ranks after a present one at equal score.
 */
export function compareRankedEntries(a: RankedEntry, b: RankedEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  const left = a.tiebreak ?? [];
  const right = b.tiebreak ?? [];
  if ((a.tiebreak === null) !== (b.tiebreak === null)) return a.tiebreak === null ? 1 : -1;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (right[i] ?? Number.NEGATIVE_INFINITY) - (left[i] ?? Number.NEGATIVE_INFINITY);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
  }
  return 0;
}

/** Ranks a ranked board: equal entries share a rank ("1, 2, 2, 4") and are listed by save time. */
export function rankRankedEntries<T extends RankedEntry & { submittedAt: number }>(entries: readonly T[]): (T & { rank: number })[] {
  const sorted = entries.slice().sort((a, b) => compareRankedEntries(a, b) || a.submittedAt - b.submittedAt);
  let rank = 0;
  return sorted.map((entry, index) => {
    const previous = sorted[index - 1];
    if (!previous || compareRankedEntries(previous, entry) !== 0) rank = index + 1;
    return { ...entry, rank };
  });
}

/** One step of an official tie-break (mirrors `QbTieBreakStep` in src/lib/qb/types.ts). */
export type TieBreakStep =
  | { by: "subject_score"; subject: string }
  | { by: "wrong_correct_ratio"; subject: string };

/** Stand-in for "infinitely bad" (wrong answers, none correct) that survives JSON. */
export const TIEBREAK_WORST = -1e9;

/**
 * The tie-break vector of a scored paper (higher is better at every position):
 * - `subject_score`: the subject's marks ("biology" = botany + zoology);
 * - `wrong_correct_ratio`: −(wrong ÷ correct) for the subject, "biology", or "all" — lower ratios
 *   are better; wrong answers with nothing correct → TIEBREAK_WORST; nothing wrong → 0.
 * NTA ranks on NTA scores (percentiles) per subject; a mock uses raw marks. Rounded to 6 decimals so
 * equal vectors compare equal.
 */
export function tieBreakVector(
  steps: readonly TieBreakStep[] | null | undefined,
  result: { correct: number; wrong: number; subjects: readonly { subject: string; score: number; correct: number; wrong: number }[] },
): number[] | null {
  if (!steps || steps.length === 0) return null;
  const pick = (subject: string) => {
    if (subject === "all") return { score: 0, correct: result.correct, wrong: result.wrong };
    const members = subject === "biology" ? ["botany", "zoology", "biology"] : [subject];
    return result.subjects
      .filter((s) => members.includes(s.subject))
      .reduce((sum, s) => ({ score: sum.score + s.score, correct: sum.correct + s.correct, wrong: sum.wrong + s.wrong }), { score: 0, correct: 0, wrong: 0 });
  };
  return steps.map((step) => {
    const tally = pick(step.subject);
    if (step.by === "subject_score") return tally.score;
    if (tally.wrong === 0) return 0;
    if (tally.correct === 0) return TIEBREAK_WORST;
    return Math.round((-tally.wrong / tally.correct) * 1e6) / 1e6;
  });
}

/** Grouping key for free-text school names: lower case, punctuation and extra spaces removed. */
export function schoolKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,'&()\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
