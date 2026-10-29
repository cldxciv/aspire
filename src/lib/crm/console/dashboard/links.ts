/**
 * Link builders of "your numbers" (docs/admin-phase-1b-plan.md §5.A, §6.1, §6.2; owner:
 * 1B-NUMBERS). PURE, client-safe, LOCALE-FREE (localise with `localePath`). Links carry only
 * session keys, centre slugs (or `none`), filter enums and staff ids (plan §1.2 rule 11): never a
 * name, phone, email, typed text or date.
 */
import { isSessionKey } from "../session";
import type { SessionKey } from "../types";

export const ADMISSIONS_PATH = "/crm/admissions";
export const TARGETS_PATH = "/crm/targets";
export const LOST_REVIEW_PATH = "/crm/lost";
export const SOURCES_PATH = "/crm/sources";
/** The top-sources window (plan §6.1 number 5) and its sources-page range key. */
export const TOP_SOURCES_DAYS = 30;
export const TOP_SOURCES_RANGE = "30d";

const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/** A centre parameter worth putting in a link: a slug or `none`; anything else is left out. */
function centreParam(centre: string | null | undefined): string | null {
  return typeof centre === "string" && centre.length <= 60 && SLUG.test(centre) ? centre : null;
}

/** Admissions done for a session (and centre, and page > 1): `/crm/admissions?session=S2026&centre=shimla`. */
export function admissionsHref(session: SessionKey, centre?: string | null, page?: number): string {
  const params = new URLSearchParams();
  if (isSessionKey(session)) params.set("session", session);
  const slug = centreParam(centre);
  if (slug) params.set("centre", slug);
  if (page !== undefined && Number.isInteger(page) && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${ADMISSIONS_PATH}?${query}` : ADMISSIONS_PATH;
}

/** Targets for a session (the current one when left out). */
export function targetsHref(session?: SessionKey | null): string {
  return session && isSessionKey(session) ? `${TARGETS_PATH}?session=${session}` : TARGETS_PATH;
}

/** Where enquiries come from, last 30 days (and centre): `/crm/sources?range=30d&centre=shimla`. */
export function topSourcesHref(centre?: string | null): string {
  const params = new URLSearchParams({ range: TOP_SOURCES_RANGE });
  const slug = centreParam(centre);
  if (slug) params.set("centre", slug);
  return `${SOURCES_PATH}?${params.toString()}`;
}
