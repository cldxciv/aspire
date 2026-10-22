/**
 * Card selection for the results ribbon (`ResultsRibbon`). Pure and client-safe. Unit-tested in
 * `hero-data.test.ts`. The cards themselves come only from `getResultCards()` (D-031), which
 * already applies the consent rule, so the ribbon is empty in production today.
 */

/** A year pill: one exam year, or every year in the ribbon. */
export type RibbonYear = number | "all";

type YearCard = { year: number; exam: string };

/** Distinct years of `cards`, newest first. */
export function ribbonYears(cards: readonly { year: number }[]): number[] {
  return [...new Set(cards.map((card) => card.year))].sort((a, b) => b - a);
}

/** The pill selected before any choice: `preferred` when it is "all" or one of `years`, else the newest year. */
export function initialRibbonYear(years: readonly number[], preferred?: RibbonYear): RibbonYear {
  if (preferred === "all") return "all";
  if (preferred !== undefined && years.includes(preferred)) return preferred;
  return years[0] ?? "all";
}

/** The cards of one year (in order), or all of them for "all". */
export function cardsForYear<T extends { year: number }>(cards: readonly T[], year: RibbonYear): T[] {
  return year === "all" ? [...cards] : cards.filter((card) => card.year === year);
}

/**
 * A small, varied set for the hero: the newest `maxYears` years, at most `perYear` cards each,
 * alternating exams within a year (JEE, NEET, JEE …) in their original order. Pass the full
 * `getResultCards(undefined, locale)` list; the result is what the client island receives.
 */
export function pickRibbonCards<T extends YearCard>(
  cards: readonly T[],
  { perYear = 8, maxYears = 3 }: { perYear?: number; maxYears?: number } = {},
): T[] {
  const picked: T[] = [];
  for (const year of ribbonYears(cards).slice(0, Math.max(maxYears, 0))) {
    const byExam = new Map<string, T[]>();
    for (const card of cards) {
      if (card.year === year) byExam.set(card.exam, [...(byExam.get(card.exam) ?? []), card]);
    }
    const queues = [...byExam.values()];
    const mixed: T[] = [];
    for (let i = 0; mixed.length < perYear && queues.some((q) => i < q.length); i++) {
      for (const queue of queues) {
        if (i < queue.length && mixed.length < perYear) mixed.push(queue[i]);
      }
    }
    picked.push(...mixed);
  }
  return picked;
}
