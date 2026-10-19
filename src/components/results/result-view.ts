import type { ExamTrack } from "@/lib/types";

/**
 * Client-safe row for the rankers list. Built on the server by `toRankerRows()`
 * (server-view.ts): `name` is already null unless canShowStudentName() allowed
 * it, so a withheld name never reaches the browser.
 */
export interface RankerRow {
  id: string;
  name: string | null;
  institution: string | null;
  exam: ExamTrack;
  year: number;
  note: string | null;
  placeholder: boolean;
}

/** Slug → display name for linking results to campuses. */
export type CentreNames = Record<string, string>;
