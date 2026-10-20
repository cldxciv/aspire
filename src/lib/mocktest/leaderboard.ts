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

/** Grouping key for free-text school names: lower case, punctuation and extra spaces removed. */
export function schoolKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,'&()\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
