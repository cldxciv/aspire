import "server-only";

import { getRankers, isPlaceholder, type ResultCard } from "@/lib/data";

/**
 * "Where Aspire students got in" (D-032): REAL data from Aspire's results list, aggregated to
 * counts per exam · college · year. Built on getRankers(), so the visibility rules are the
 * rankers' (production: published + consent granted only — empty today; development / preview:
 * DEMO-labelled placeholders). Counts only, never names. The list has no scores, so this is
 * never connected to a student's predicted rank.
 */

export type AdmitExam = "JEE" | "NEET";

/** One count row: entries in the results list for this exam, college and year (exact duplicates once). */
export interface AdmitRow {
  exam: AdmitExam;
  year: number;
  /** Grouping key (case-insensitive, without a leading "MBBS · "). */
  key: string;
  /** College as listed by the source (its most frequent spelling across years). */
  institution: string;
  count: number;
}

export interface AspireAdmits {
  rows: AdmitRow[];
  /** Years present, newest first. */
  years: number[];
  /** Any counted record is a placeholder → render the DEMO badge. */
  placeholder: boolean;
}

/** Grouping key: "MBBS · IGMC Shimla" and "IGMC Shimla" are the same college. */
export function institutionKey(institution: string): string {
  return institution
    .trim()
    .replace(/^MBBS\s*·\s*/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Aggregated counts, or null when no ranker may be shown (production today). */
export async function getAspireAdmits(): Promise<AspireAdmits | null> {
  const rankers = await getRankers();
  const seen = new Set<string>();
  const counts = new Map<string, AdmitRow>();
  const spellings = new Map<string, Map<string, number>>();
  let placeholder = false;

  for (const r of rankers) {
    if ((r.exam !== "JEE" && r.exam !== "NEET") || !r.institution?.trim()) continue;
    const institution = r.institution.trim();
    const dedupe = [r.studentDisplayName.trim(), institution, r.exam, r.year].join("|").toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    placeholder ||= isPlaceholder(r);

    const key = institutionKey(institution);
    const group = `${r.exam}|${key}`;
    const names = spellings.get(group) ?? new Map<string, number>();
    names.set(institution, (names.get(institution) ?? 0) + 1);
    spellings.set(group, names);

    const id = `${group}|${r.year}`;
    const row = counts.get(id) ?? { exam: r.exam, year: r.year, key, institution, count: 0 };
    row.count += 1;
    counts.set(id, row);
  }
  if (counts.size === 0) return null;

  const label = (exam: AdmitExam, key: string) =>
    [...(spellings.get(`${exam}|${key}`) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const rows = [...counts.values()]
    .map((row) => ({ ...row, institution: label(row.exam, row.key) }))
    .sort((a, b) => b.year - a.year || b.count - a.count || a.institution.localeCompare(b.institution));
  const years = [...new Set(rows.map((row) => row.year))].sort((a, b) => b - a);
  return { rows, years, placeholder };
}

/** Grouping keys of the `limit` colleges with the most entries for `exam` (all years). */
export function topInstitutionKeys(admits: AspireAdmits, exam: AdmitExam, limit = 3): string[] {
  const totals = new Map<string, number>();
  for (const row of admits.rows) if (row.exam === exam) totals.set(row.key, (totals.get(row.key) ?? 0) + row.count);
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

/** Result cards (already visibility-filtered by getResultCards) for the given colleges. */
export function cardsForInstitutions(cards: ResultCard[], keys: string[]): ResultCard[] {
  const wanted = new Set(keys);
  return cards.filter((card) => card.institute && wanted.has(institutionKey(card.institute)));
}
