import "server-only";

import { showPlaceholderContent } from "@/lib/content-mode";
import { getDb } from "@/lib/db/connection";

import { leadScopeFor } from "../../access";
import { sourceLeadRows } from "../../repo/console-sources";
import type { CrmViewer } from "../../types";
import { classifyChannel } from "../channels";
import { aiSummary, funnel, mapsSummary } from "./aggregate";
import { SEARCH_PERIODS, type FunnelCounts, type SearchOverview } from "./types";

/**
 * The search overview for `/admin/search` (docs/admin-phase-1b-plan.md §5.J; owner: 1B-SOURCES;
 * CRM admins only, checked by the page): whether search engines may index the site (the same
 * `showPlaceholderContent()` check robots.ts uses), and enquiries that arrived from search engines
 * (the channel), Google Maps (all signals) and AI assistants (all signals) over the last 30 and
 * 90 days, each with reached counselling and admitted. Counts only; it promises no rankings.
 */

const DAY_MS = 86_400_000;

function counts(summary: FunnelCounts): FunnelCounts {
  return { enquiries: summary.enquiries, reachedCounselling: summary.reachedCounselling, admitted: summary.admitted, smallSample: summary.smallSample };
}

export function searchOverview(viewer: CrmViewer, now: number): SearchOverview {
  const longest = Math.max(...SEARCH_PERIODS);
  const rows = sourceLeadRows(getDb(), leadScopeFor(viewer), { from: now - longest * DAY_MS, to: now }, null);
  return {
    generatedAt: new Date(now).toISOString(),
    hiddenFromSearch: showPlaceholderContent(),
    periods: SEARCH_PERIODS.map((days) => {
      const inPeriod = rows.filter((row) => row.createdAt >= now - days * DAY_MS);
      return {
        days,
        searchEngines: funnel(inPeriod.filter((row) => classifyChannel(row) === "search_engines")),
        maps: counts(mapsSummary(inPeriod)),
        ai: counts(aiSummary(inPeriod)),
      };
    }),
  };
}
