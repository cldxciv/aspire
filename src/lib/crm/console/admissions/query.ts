/**
 * Admissions done: the page's query (docs/admin-phase-1b-plan.md §5.B; owner: 1B-NUMBERS). PURE
 * and client-safe. `session` (S2026; default the current session), `centre` (an effective-centre
 * slug, `none` = "No centre yet", absent = every centre), `page` (≥ 1). Unusable values fall back
 * and are flagged, never echoed.
 */
import { currentSession, isSessionKey } from "../session";
import type { SessionKey } from "../types";

type Param = string | string[] | null | undefined;

export interface AdmissionsQuery {
  session: SessionKey;
  centre: string | null;
  page: number;
  invalid: boolean;
}

const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const MAX_PAGE = 10_000;

function first(value: Param): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw !== "" ? raw.trim().slice(0, 100) : undefined;
}

/** Reads `session`, `centre` and `page` (from page `searchParams` or `URLSearchParams.get`). */
export function parseAdmissionsQuery(get: (name: string) => Param, now: number): AdmissionsQuery {
  let invalid = false;
  const rawSession = first(get("session"));
  let session = currentSession(now).key;
  if (rawSession !== undefined) {
    if (isSessionKey(rawSession)) session = rawSession;
    else invalid = true;
  }
  const rawCentre = first(get("centre"))?.toLowerCase();
  let centre: string | null = null;
  if (rawCentre !== undefined) {
    if (rawCentre.length <= 60 && SLUG.test(rawCentre)) centre = rawCentre;
    else invalid = true;
  }
  const rawPage = first(get("page"));
  let page = 1;
  if (rawPage !== undefined) {
    const parsed = Number(rawPage);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE) page = parsed;
    else invalid = true;
  }
  return { session, centre, page, invalid };
}
