import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { Locale } from "@/i18n/config";
import { showPlaceholderContent } from "@/lib/content-mode";
import { getCentres } from "@/lib/data";

import { areaCentreSlugs, areaDefaultCentres, centreSlugsInLeads } from "../repo/console-core";
import type { CrmViewer } from "../types";
import type { CentreRef } from "./types";

/**
 * The console's centre list (docs/admin-phase-1b-plan.md §4.2, O1; owner: 1B-CORE). Until the real
 * centre list arrives (decision 7) it is the website centres plus any centre already on an
 * enquiry or set as an area's centre, labelled "Demo centre list" while the site is in demo mode.
 */

/** "dharamshala-west" → "Dharamshala West" (a centre that is not on the website). */
export function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Every centre the console shows: website centres first (content order, localised names), then
 * the centres only known from areas or enquiries, by slug. `demo` follows `showPlaceholderContent()`.
 */
export async function consoleCentres(db: DatabaseSync, locale: Locale): Promise<CentreRef[]> {
  const demo = showPlaceholderContent();
  const content = await getCentres(undefined, locale);
  const refs: CentreRef[] = content.map((centre) => ({ slug: centre.slug, label: centre.name, demo }));
  const known = new Set(refs.map((ref) => ref.slug));
  const extra = new Set([...areaCentreSlugs(db), ...areaDefaultCentres(db), ...centreSlugsInLeads(db)]);
  for (const slug of [...extra].sort()) {
    if (known.has(slug)) continue;
    known.add(slug);
    refs.push({ slug, label: titleCaseSlug(slug), demo });
  }
  return refs;
}

/**
 * The centres a manager answers for: the centres of their responsible areas (lead routing
 * `centresOfAreas`, already on `viewer.areaScope`) plus those areas' serving centres, plus a legacy
 * centre scope. `null` = every centre (admins, and legacy managers without a centre scope).
 * Counsellors get their own centre scope (often empty: they see only their assigned leads).
 */
export function viewerCentreSlugs(db: DatabaseSync, viewer: CrmViewer): string[] | null {
  if (viewer.role === "admin") return null;
  if (viewer.role === "manager") {
    if (viewer.areaScope) {
      const slugs = new Set([...viewer.areaScope.centreSlugs, ...areaDefaultCentres(db, viewer.areaScope.areaIds), ...viewer.centreSlugs]);
      return [...slugs].sort();
    }
    return viewer.centreSlugs.length === 0 ? null : [...viewer.centreSlugs].sort();
  }
  return [...viewer.centreSlugs].sort();
}
