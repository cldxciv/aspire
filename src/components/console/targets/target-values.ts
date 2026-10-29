/**
 * Pure helpers of the targets grid (docs/admin-phase-1b-plan.md §5.B; owner: 1B-NUMBERS). A plain
 * module, NOT "use client": the server-rendered TargetsView calls `metricValues` / `cellKey` too,
 * and a function exported from a client module cannot be called on the server.
 */
import type { ConsoleProgram, TargetGrid, TargetMetric } from "@/lib/crm/console/types";

const MAX = 100_000;

/** "" = no target; a whole number 0–100000 = a target; anything else = invalid (null). */
export function parseTargetInput(raw: string): number | "" | null {
  const value = raw.trim();
  if (value === "") return "";
  if (!/^\d{1,6}$/.test(value)) return null;
  const number = Number(value);
  return number <= MAX ? number : null;
}

/** `${centreSlug}|${program}` → value. */
export type TargetValues = Record<string, number>;
export const cellKey = (centreSlug: string, program: ConsoleProgram) => `${centreSlug}|${program}`;

/** One metric's cells of a grid as `TargetValues`. */
export function metricValues(grid: Pick<TargetGrid, "cells">, metric: TargetMetric): TargetValues {
  return Object.fromEntries(grid.cells.filter((cell) => cell.metric === metric).map((cell) => [cellKey(cell.centreSlug, cell.program), cell.value]));
}

export function sameValues(a: TargetValues, b: TargetValues): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => b[key] === a[key]);
}
