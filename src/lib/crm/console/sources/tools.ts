import "server-only";

import { usageKeyHash } from "@/lib/ask/usage";
import { getDb } from "@/lib/db/connection";
import { getLeadGateConfig } from "@/lib/lead-gate/config";

import { leadScopeFor } from "../../access";
import { canonicalTool } from "../../pure";
import { gateDailyCounts } from "../../reports";
import { askUsageCount, mockTestsPerDay, plannerStudentsPerDay, toolUsesPerDay } from "../../repo/console-sources";
import type { CrmViewer } from "../../types";
import { istDayStart } from "../session";
import { istDayKey } from "./range";
import { TOOL_DAYS, type GateStatus, type ToolDay, type ToolsCard } from "./types";

/**
 * The Free tools & Rancho card (docs/admin-phase-1b-plan.md §6.7; owner: 1B-SOURCES): read-only,
 * no new counters. Enquiries per tool come from the page's `P_all` (passed in); the usage rows
 * (last 14 IST days) are for CRM admins only, read from the tables the tools already keep.
 */

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
/** The id the Rancho module counts its site-wide total under (`reserveQuestion`: `usageKeyHash("global", "all", day)`). */
export const RANCHO_GLOBAL_ID = "all";

/** The lead gate's effective mode, from the live configuration. */
export function gateStatus(): GateStatus {
  const config = getLeadGateConfig();
  return { mode: config.mode, offReason: config.mode === "off" ? (config.offReason ?? "unset") : null };
}

/** Enquiries per tool (canonical ids; Rancho = `ask`), largest first. Leads without a tool are not listed. */
export function enquiriesByTool(rows: readonly { tool: string | null }[]): { tool: string; enquiries: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const tool = canonicalTool(row.tool);
    if (tool) counts.set(tool, (counts.get(tool) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tool, enquiries]) => ({ tool, enquiries }));
}

/**
 * The last `TOOL_DAYS` IST days (oldest first) of free-tool use. Rancho's site-wide count is read
 * only for today and yesterday (the global key; the site keeps two days); older days are null.
 */
export function toolUsage(viewer: CrmViewer, now: number): ToolDay[] {
  const db = getDb();
  const todayStart = istDayStart(now);
  const from = todayStart - (TOOL_DAYS - 1) * DAY_MS;
  const to = todayStart + DAY_MS;
  const days = Array.from({ length: TOOL_DAYS }, (_, index) => from + index * DAY_MS);
  const dayKeys = days.map((start) => istDayKey(start));
  const dayNumber = (start: number) => Math.floor((start + IST_OFFSET_MS) / DAY_MS);

  const forms = new Map(gateDailyCounts(viewer, { from, to }).map((day) => [day.day, day]));
  const mock = mockTestsPerDay(db, from, to);
  const planner = plannerStudentsPerDay(db, dayKeys[0], dayKeys[dayKeys.length - 1]);
  const uses = new Map<number, Record<string, number>>();
  for (const row of toolUsesPerDay(db, leadScopeFor(viewer), from, to)) {
    const tool = canonicalTool(row.tool) ?? row.tool;
    const entry = uses.get(row.istDay) ?? {};
    entry[tool] = (entry[tool] ?? 0) + row.uses;
    uses.set(row.istDay, entry);
  }
  const ranchoDays = new Set([dayKeys[dayKeys.length - 1], dayKeys[dayKeys.length - 2]]);

  return days.map((start, index) => {
    const day = dayKeys[index];
    const byTool = uses.get(dayNumber(start)) ?? {};
    const formDay = forms.get(day);
    return {
      day,
      contactNew: formDay?.newFamilies ?? 0,
      contactKnown: formDay?.knownFamilies ?? 0,
      mockTests: mock.get(dayNumber(start)) ?? 0,
      plannerStudents: planner.get(day) ?? 0,
      ranchoQuestions: ranchoDays.has(day) ? askUsageCount(db, usageKeyHash("global", RANCHO_GLOBAL_ID, day), day) : null,
      toolUses: Object.values(byTool).reduce((sum, value) => sum + value, 0),
      toolUsesByTool: byTool,
    };
  });
}

/** The card: gate status and enquiries per tool for everyone who may open the page; usage rows for CRM admins only. */
export function toolsCard(viewer: CrmViewer, rows: readonly { tool: string | null }[], now: number): ToolsCard {
  return {
    gate: gateStatus(),
    enquiriesByTool: enquiriesByTool(rows),
    usage: viewer.role === "admin" ? { days: toolUsage(viewer, now) } : null,
  };
}
