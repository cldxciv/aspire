import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb, withTransaction } from "@/lib/db/connection";

import { CRM_MESSAGES, fail, ok } from "../../access";
import { toIso } from "../../pure";
import { listTargetRows, replaceTargets, targetsLastChange, targetSumsByCentre } from "../../repo/console-numbers";
import { findDisplayNames } from "../../repo/staff";
import type { CrmResult, CrmViewer } from "../../types";
import { CONSOLE_AUDIT, consoleAudit } from "../audit";
import { viewerCentreSlugs } from "../centres";
import { isSessionKey } from "../session";
import { CONSOLE_PROGRAMS, consolePermissions, TARGET_METRICS, type ConsoleProgram, type SessionKey, type TargetCell, type TargetGrid, type TargetMetric } from "../types";
import { targetsBodySchema, type TargetsBody } from "./schemas";

/**
 * Session targets (docs/admin-phase-1b-plan.md §5.B, O4, O6, D-078; owner: 1B-NUMBERS):
 * `crm_targets` per session × centre × programme × metric. Super admins edit (enforced here and by
 * the route); CRM admins and managers read (managers only their centres' rows); counsellors never.
 * Nothing is shown until set ("No target set"); there are no monthly targets in 1b.
 *
 * Optimistic concurrency: the grid's `updatedAt` is the period's latest save (its newest cell or
 * its newest `settings.targets_update` audit row, so a save that only clears cells still counts);
 * a save must name the `updatedAt` it loaded, else 409 "Someone else changed these targets.
 * Reload." Each save moves `updatedAt` strictly forward.
 */

export const TARGET_MESSAGES = {
  invalidPeriod: "Choose a session such as S2026.",
  versionConflict: "Someone else changed these targets. Reload.",
  invalidVersion: "Reload the page and try again.",
} as const;

function isProgram(value: string): value is ConsoleProgram {
  return (CONSOLE_PROGRAMS as readonly string[]).includes(value);
}

function isMetric(value: string): value is TargetMetric {
  return (TARGET_METRICS as readonly string[]).includes(value);
}

/** The grid of a period as `viewer` may see it (managers: their centres only). */
function readGrid(db: DatabaseSync, viewer: CrmViewer, period: SessionKey): TargetGrid {
  const own = viewerCentreSlugs(db, viewer);
  const cells: TargetCell[] = [];
  for (const row of listTargetRows(db, period)) {
    if (!isProgram(row.program) || !isMetric(row.metric)) continue;
    if (own !== null && !own.includes(row.centreSlug)) continue;
    cells.push({ centreSlug: row.centreSlug, program: row.program, metric: row.metric, value: row.value });
  }
  const last = targetsLastChange(db, period, CONSOLE_AUDIT.targetsUpdate);
  const by = last?.by ? (findDisplayNames(db, [last.by]).get(last.by) ?? null) : null;
  return { period, cells, updatedAt: last ? toIso(last.at) : null, updatedBy: by };
}

/** GET: the targets of a session (CRM admins and managers; managers see their centres' rows). */
export function getTargets(viewer: CrmViewer, period: string): CrmResult<TargetGrid> {
  if (!consolePermissions(viewer, { isSuperAdmin: viewer.superAdmin === true }).canViewTargets) return fail("forbidden", CRM_MESSAGES.forbidden);
  if (!isSessionKey(period)) return fail("validation", TARGET_MESSAGES.invalidPeriod, { period: [TARGET_MESSAGES.invalidPeriod] });
  return ok(readGrid(getDb(), viewer, period));
}

/**
 * PUT: replaces every cell of `period` × `metric` in one transaction (SUPER ADMINS only). A stale
 * `expectedUpdatedAt` → conflict (409). Audited `settings.targets_update { period, metric, cells }`
 * (how many cells were saved; never values or names). Returns the whole grid.
 */
export function putTargets(viewer: CrmViewer, input: unknown, now: number = Date.now()): CrmResult<TargetGrid> {
  if (!consolePermissions(viewer, { isSuperAdmin: viewer.superAdmin === true }).canEditTargets) return fail("forbidden", CRM_MESSAGES.superAdminOnly);
  const parsed = targetsBodySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "body";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return fail("validation", CRM_MESSAGES.validation, fieldErrors);
  }
  const body: TargetsBody = parsed.data;
  if (!isSessionKey(body.period)) return fail("validation", TARGET_MESSAGES.invalidPeriod, { period: [TARGET_MESSAGES.invalidPeriod] });
  const period = body.period;
  const expected = body.expectedUpdatedAt === null ? null : Date.parse(body.expectedUpdatedAt);
  if (expected !== null && Number.isNaN(expected)) return fail("validation", CRM_MESSAGES.validation, { expectedUpdatedAt: [TARGET_MESSAGES.invalidVersion] });
  const db = getDb();
  return withTransaction(db, (): CrmResult<TargetGrid> => {
    const last = targetsLastChange(db, period, CONSOLE_AUDIT.targetsUpdate);
    if ((last?.at ?? null) !== expected) return fail("conflict", TARGET_MESSAGES.versionConflict);
    const at = Math.max(now, (last?.at ?? 0) + 1);
    replaceTargets(db, period, body.metric, body.cells, viewer.userId, at);
    consoleAudit(db, {
      actorId: viewer.userId,
      action: CONSOLE_AUDIT.targetsUpdate,
      target: period,
      details: { period, metric: body.metric, cells: body.cells.length },
      // The save's version time: with the cells, it keeps the version moving forward after a clear.
      now: at,
    });
    return ok(readGrid(db, viewer, period));
  });
}

/**
 * The admissions target of a centre for a session: Σ over every programme, or null when no cell
 * exists ("No target set"). `centre` null ("No centre yet") never has a target.
 */
export function sessionTargetFor(db: DatabaseSync, centre: string | null, session: SessionKey): number | null {
  if (centre === null) return null;
  return targetSumsByCentre(db, session, "admissions").get(centre) ?? null;
}
