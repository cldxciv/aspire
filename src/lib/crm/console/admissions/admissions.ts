import "server-only";

import { getDb } from "@/lib/db/connection";

import { leadScopeFor } from "../../access";
import { leadDisplayName } from "../../leads";
import { toIso } from "../../pure";
import { admissionCountsByCentreProgram, admissionRows, countAdmissions, targetSumsByCentre } from "../../repo/console-numbers";
import type { CrmViewer } from "../../types";
import { viewerCentreSlugs } from "../centres";
import { classifyChannel } from "../channels";
import { sessionRef } from "../session";
import { CONSOLE_PROGRAMS, consolePermissions, type Channel, type ConsoleProgram, type SessionKey, type SessionRef } from "../types";

/**
 * Admissions done (docs/admin-phase-1b-plan.md §5.B, §6.3, O8, D-078; owner: 1B-NUMBERS): the
 * families currently Admitted (stage `enrolled`) whose admission session is the chosen one — their
 * joining session when staff set it, else the session they were marked Admitted in. Scope:
 * counsellors their own families, managers their scope, admins everything; erased enquiries are
 * counted without a name. The dashboard's number 4 uses the very same condition
 * (repo/console-numbers.ts `admissionWhere`), so both always agree.
 */

export const ADMISSIONS_PAGE_SIZE = 50;

export interface AdmissionItem {
  leadId: string;
  /** Null for an erased lead (shown "Erased lead") or a family without any name. */
  name: string | null;
  erased: boolean;
  /** The effective centre (null = no centre yet). */
  centreSlug: string | null;
  program: ConsoleProgram;
  programInterest: string | null;
  currentClass: string | null;
  assignee: { userId: string; displayName: string } | null;
  /** When the family was marked Admitted (ISO). */
  admittedAt: string;
  channel: Channel;
}

export interface AdmissionsSummaryRow {
  centre: string | null;
  counts: Record<ConsoleProgram, number>;
  total: number;
  /** The centre's admissions target for the session (Σ programmes); null = not set or not shown to this viewer. */
  target: number | null;
}

export interface AdmissionsReport {
  session: SessionRef;
  centre: string | null;
  total: number;
  summary: { rows: AdmissionsSummaryRow[]; totals: Record<ConsoleProgram, number>; total: number; target: number | null };
  /** Targets are shown (CRM admins and managers; never counsellors). */
  showTargets: boolean;
  items: AdmissionItem[];
  page: number;
  pageSize: number;
  pages: number;
}

function emptyCounts(): Record<ConsoleProgram, number> {
  return Object.fromEntries(CONSOLE_PROGRAMS.map((program) => [program, 0])) as Record<ConsoleProgram, number>;
}

function asProgram(value: string): ConsoleProgram {
  return (CONSOLE_PROGRAMS as readonly string[]).includes(value) ? (value as ConsoleProgram) : "any";
}

/**
 * The admissions of `session` (and `centre`: a slug, `none` or null for every centre) that `viewer`
 * may count, with the centre × programme summary and page `page` of the list (50 per page).
 */
export function admissionsDone(viewer: CrmViewer, session: SessionKey, centre: string | null, page = 1): AdmissionsReport {
  const db = getDb();
  const scope = leadScopeFor(viewer);
  const ref = sessionRef(session);
  const showTargets = consolePermissions(viewer, { isSuperAdmin: viewer.superAdmin === true }).canViewTargets;

  // Summary: centres with admissions, plus (for viewers who see targets) centres with a target.
  const counts = new Map<string | null, Record<ConsoleProgram, number>>();
  for (const group of admissionCountsByCentreProgram(db, scope, ref, centre)) {
    const row = counts.get(group.centre) ?? emptyCounts();
    row[asProgram(group.program)] += group.count;
    counts.set(group.centre, row);
  }
  const targets = showTargets ? targetSumsByCentre(db, session, "admissions") : new Map<string, number>();
  if (showTargets) {
    const own = viewerCentreSlugs(db, viewer);
    for (const slug of targets.keys()) {
      if (own !== null && !own.includes(slug)) {
        targets.delete(slug);
        continue;
      }
      if ((centre === null || centre === slug) && !counts.has(slug)) counts.set(slug, emptyCounts());
    }
  }
  const rows: AdmissionsSummaryRow[] = [...counts.entries()]
    .map(([key, programs]) => ({
      centre: key,
      counts: programs,
      total: CONSOLE_PROGRAMS.reduce((sum, program) => sum + programs[program], 0),
      target: key === null ? null : (targets.get(key) ?? null),
    }))
    .sort((a, b) => (a.centre === null ? 1 : b.centre === null ? -1 : b.total - a.total || a.centre.localeCompare(b.centre)));
  const totals = emptyCounts();
  for (const row of rows) for (const program of CONSOLE_PROGRAMS) totals[program] += row.counts[program];
  const rowTargets = rows.map((row) => row.target).filter((value): value is number => value !== null);

  // The list, 50 per page (latest admission first).
  const total = countAdmissions(db, scope, ref, centre);
  const pages = Math.max(1, Math.ceil(total / ADMISSIONS_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const items: AdmissionItem[] = admissionRows(db, scope, ref, centre, { limit: ADMISSIONS_PAGE_SIZE, offset: (current - 1) * ADMISSIONS_PAGE_SIZE }).map((row) => {
    const erased = row.erasedAt !== null;
    return {
      leadId: row.id,
      name: erased ? null : leadDisplayName(row),
      erased,
      centreSlug: row.centre,
      program: asProgram(row.program),
      programInterest: row.programInterest,
      currentClass: row.currentClass,
      assignee: row.assignedTo ? { userId: row.assignedTo, displayName: row.assigneeName ?? "" } : null,
      admittedAt: toIso(row.admittedAt),
      channel: classifyChannel(row),
    };
  });

  return {
    session: ref,
    centre,
    total,
    summary: { rows, totals, total: CONSOLE_PROGRAMS.reduce((sum, program) => sum + totals[program], 0), target: rowTargets.length === 0 ? null : rowTargets.reduce((a, b) => a + b, 0) },
    showTargets,
    items,
    page: current,
    pageSize: ADMISSIONS_PAGE_SIZE,
    pages,
  };
}
