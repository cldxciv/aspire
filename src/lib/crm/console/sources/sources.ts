import "server-only";

import { getDb } from "@/lib/db/connection";

import { leadScopeFor } from "../../access";
import { sourceLeadRows } from "../../repo/console-sources";
import type { CrmViewer } from "../../types";
import { consolePermissions, type ConsolePermissions } from "../types";
import { aiSummary, campaignRows, channelRows, heardRows, mapsSummary, pageRows, referrerRows, weeklyTrend } from "./aggregate";
import { toolsCard } from "./tools";
import type { SourceRange, SourcesReport } from "./types";

/**
 * "Where enquiries come from" (docs/admin-phase-1b-plan.md §5.J, §6.6, D-082; owner: 1B-SOURCES).
 * One read (no transaction) of `P_all` for the range and centre, classified in code with CORE's
 * `classifyChannel`. Callers check who may open it (CRM admins and area heads; counsellors never).
 */
export function sourcesReport(viewer: CrmViewer, range: SourceRange, centre: string | null, now: number): SourcesReport {
  const rows = sourceLeadRows(getDb(), leadScopeFor(viewer), { from: range.fromMs, to: range.toMs }, centre);
  return {
    generatedAt: new Date(now).toISOString(),
    range,
    centre,
    total: rows.length,
    erased: rows.filter((row) => row.erased).length,
    channels: channelRows(rows),
    maps: mapsSummary(rows),
    ai: aiSummary(rows),
    campaigns: campaignRows(rows),
    referrers: referrerRows(rows),
    pages: pageRows(rows),
    heard: heardRows(rows),
    weekly: weeklyTrend(rows, range),
    tools: toolsCard(viewer, rows, now),
  };
}

/** The viewer's console permissions (super admin from the viewer's effective grant). */
export function sourcesPermissions(viewer: CrmViewer): ConsolePermissions {
  return consolePermissions(viewer, { isSuperAdmin: viewer.superAdmin === true });
}
