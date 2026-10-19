import "server-only";

import { canShowStudentName, isPlaceholder } from "@/lib/data";
import type { Centre, RankerRecord, ResultRecord } from "@/lib/types";
import type { CentreNames, RankerRow } from "./result-view";

/**
 * Server-side preparation of people-centred records before they reach any
 * component (especially client components): names are removed unless
 * canShowStudentName() allows them, so they are never serialised to the browser.
 */

/** The record with `studentDisplayName` removed when its name may not be shown. */
export function withPermittedName(result: ResultRecord): ResultRecord {
  if (canShowStudentName(result)) return result;
  return { ...result, studentDisplayName: undefined };
}

export function toRankerRows(rankers: RankerRecord[]): RankerRow[] {
  return rankers.map((ranker) => ({
    id: ranker.id,
    name: canShowStudentName(ranker) ? ranker.studentDisplayName.trim() || null : null,
    institution: ranker.institution?.trim() || null,
    exam: ranker.exam,
    year: ranker.year,
    note: ranker.note?.trim() || null,
    placeholder: isPlaceholder(ranker),
  }));
}

/** Distinct source references, in first-seen order (shown once under the list). */
export function distinctSources(records: { sourceReference: string }[]): string[] {
  return [...new Set(records.map((record) => record.sourceReference.trim()).filter(Boolean))];
}

export function centreNameMap(centres: Centre[]): CentreNames {
  return Object.fromEntries(centres.map((centre) => [centre.slug, centre.name]));
}
