import "server-only";

import { getDb } from "@/lib/db/connection";

import { buildLeadQuery } from "../leads";
import { countLeads, countLeadsGrouped } from "../repo/leads";
import type { CrmViewer, LeadFilters } from "../types";

/**
 * Numbers that link to the Enquiries list (docs/admin-phase-1b-plan.md §4.2, §6, §10.2; owner:
 * 1B-CORE). Every dashboard number that opens the list is counted HERE, by the inbox's own query
 * for the exact filters its link carries, so the list shows the same count by construction.
 */

/**
 * Inbox count (the viewer's scope, LIVE leads only) for `filters` — the list total of
 * `inboxHref(filters)`. `includeErased` is ignored: the Enquiries page never shows erased leads by
 * URL, so a linked number never counts them (plan §6; reports that include erased leads say so).
 */
export function countForFilters(viewer: CrmViewer, filters: LeadFilters, now: number): number;
/** The same count split by effective centre or assignee (`key: null` = no centre / unassigned). */
export function countForFilters(
  viewer: CrmViewer,
  filters: LeadFilters,
  now: number,
  by: "centre" | "assignee",
): { key: string | null; count: number }[];
export function countForFilters(
  viewer: CrmViewer,
  filters: LeadFilters,
  now: number,
  by?: "centre" | "assignee",
): number | { key: string | null; count: number }[] {
  const query = buildLeadQuery(viewer, { ...filters, includeErased: false }, now);
  return by ? countLeadsGrouped(getDb(), query, by) : countLeads(getDb(), query);
}

/**
 * Query-string order of `inboxHref` (stable links; every key is one the Enquiries PAGE parses:
 * `parseInboxFilters`). `q` (typed text: a name or phone digits) and `createdFrom` / `createdTo`
 * (dates) are NEVER put in a console link (plan §1.2 rule 11, §4.3); console numbers use
 * `created=today|week|over24h` instead. `sort` and `includeErased` are left out too: the page
 * ignores both (sort does not change a count; erased leads are never counted, see above).
 */
const HREF_KEYS = [
  "stage",
  "centre",
  "program",
  "source",
  "assignee",
  "due",
  "area",
  "sla",
  "contact",
  "signups",
  "created",
] as const satisfies readonly (keyof LeadFilters)[];

/**
 * The Enquiries list for `filters`, LOCALE-FREE (`/crm?stage=new&contact=none&signups=hide`;
 * localise with `localePath`). `leadFiltersFromSearch(new URL(href, base).searchParams)` gives
 * back the same filters, and so does the page's `toLeadFilters(parseInboxFilters(…))` (apart
 * from its default sort). Links carry filter enums, centre slugs and staff ids only (plan §1.2
 * rule 11): never a name, phone, email or typed text, so `q`, `createdFrom` and `createdTo` are
 * left out (do not count with them either).
 */
export function inboxHref(filters: LeadFilters): string {
  const params = new URLSearchParams();
  for (const key of HREF_KEYS) {
    const value = filters[key];
    if (typeof value === "string" && value !== "") params.set(key, value);
  }
  const query = params.toString();
  return query ? `/crm?${query}` : "/crm";
}
