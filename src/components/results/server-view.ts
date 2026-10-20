import "server-only";

import { canShowStudentName, isPlaceholder } from "@/lib/data";
import type { Centre, RankerRecord, ResultRecord } from "@/lib/types";
import type { CentreNames, RankerRow } from "./result-view";

/**
 * Server-side preparation of people-centred records before they reach any
 * component (especially client components): names are removed unless
 * canShowStudentName() allows them, so they are never serialised to the browser.
 */

/**
 * Client-safe projection of a result for the archive: drops fields no client
 * component renders (internal `sourceRef`, `quote`, `verifiedBy`, `featured`, and the
 * result-card `photo` — personal data, rendered only via getResultCards(), D-031)
 * and, when the name may not be shown, the name and school (a quasi-identifier).
 */
export function withPermittedName(result: ResultRecord): ResultRecord {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally not sent to the browser.
  const { sourceRef, quote, verifiedBy, featured, photo, ...visible } = result;
  if (canShowStudentName(result)) return visible;
  return { ...visible, studentDisplayName: undefined, school: undefined };
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
