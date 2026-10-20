import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { scopeCovers } from "./access";
import { getCursor, listRules, setCursor } from "./repo/rules";
import { listAssignableStaff } from "./repo/staff";

/**
 * Auto-assignment (D-040). Rules first, most specific match wins:
 *   (centre + program) > (centre, any program) > (any centre, program) > (any, any);
 * a rule whose pool has no assignable member is skipped. Then round-robin among active
 * counsellors whose scope covers the lead's centre (empty scope = any centre). Else unassigned.
 *
 * Round-robin keeps the last user id given a lead per pool and picks the next id after it in
 * sorted order (wrapping), so adding or removing members never skips or repeats unfairly.
 * Must run inside the caller's write transaction.
 */
export function pickAssignee(
  db: DatabaseSync,
  lead: { centreSlug: string | null; programInterest: string | null },
  now: number,
): { userId: string; via: "rule" | "centre" } | null {
  const members = listAssignableStaff(db);
  if (members.length === 0) return null;
  const assignable = new Set(members.map((member) => member.userId));

  const matching = listRules(db)
    .map((rule, position) => ({ rule, position }))
    .filter(
      ({ rule }) =>
        rule.active &&
        (rule.centreSlug === null || rule.centreSlug === lead.centreSlug) &&
        (rule.programInterest === null || rule.programInterest === lead.programInterest),
    )
    .sort(
      (a, b) =>
        specificity(b.rule) - specificity(a.rule) || a.position - b.position,
    );

  for (const { rule } of matching) {
    const pool = [...new Set(rule.memberIds)].filter((id) => assignable.has(id)).sort();
    if (pool.length === 0) continue;
    const key = `rule:${rule.centreSlug ?? "*"}:${rule.programInterest ?? "*"}`;
    return { userId: roundRobin(db, key, pool, now), via: "rule" };
  }

  const pool = members
    .filter((member) => member.crmRole === "counsellor" && scopeCovers(member.centreSlugs, lead.centreSlug))
    .map((member) => member.userId)
    .sort();
  if (pool.length === 0) return null;
  return { userId: roundRobin(db, `centre:${lead.centreSlug ?? "*"}`, pool, now), via: "centre" };
}

function specificity(rule: { centreSlug: string | null; programInterest: string | null }): number {
  return (rule.centreSlug !== null ? 2 : 0) + (rule.programInterest !== null ? 1 : 0);
}

function roundRobin(db: DatabaseSync, key: string, pool: readonly string[], now: number): string {
  const last = getCursor(db, key);
  const next = (last === null ? undefined : pool.find((id) => id > last)) ?? pool[0];
  setCursor(db, key, next, now);
  return next;
}
