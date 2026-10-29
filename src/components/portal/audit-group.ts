/**
 * Groups repeated activity-log lines (docs/admin-phase-1b-plan.md §5.N; owner: 1B-HOUSEKEEPING).
 * Consecutive entries with the SAME actor and the SAME action, for the listed actions only (by
 * default "viewed an enquiry" and "AI assistant used a tool"), within a 30-minute window measured
 * from the group's first (newest) entry, become one summary line ("Viewed 7 enquiries ·
 * 10:02–10:31") that still lists every entry. Nothing is deleted or merged in the database: this
 * only changes how the rows are shown, and every row stays in exactly one item. Client-safe.
 */

export interface GroupableAuditRow {
  id: number;
  actorId: string | null;
  action: string;
  target: string | null;
  /** Epoch milliseconds. */
  createdAt: number;
}

export type AuditDisplayItem<Row extends GroupableAuditRow> =
  | { kind: "row"; row: Row }
  | {
      kind: "group";
      action: string;
      actorId: string | null;
      /** Every entry of the run, in the order given (newest first in the log). */
      rows: Row[];
      /** Earliest and latest `createdAt` of the run. */
      from: number;
      to: number;
    };

export const AUDIT_GROUP_WINDOW_MS = 30 * 60_000;
export const AUDIT_GROUPED_ACTIONS = ["crm.lead_view", "mcp.call"] as const;

export interface AuditGroupOptions {
  windowMs: number;
  actions: readonly string[];
}

export const DEFAULT_AUDIT_GROUP_OPTIONS: AuditGroupOptions = { windowMs: AUDIT_GROUP_WINDOW_MS, actions: AUDIT_GROUPED_ACTIONS };

/**
 * Display items for `rows` (in their order). A run of one stays a plain row. The window is
 * inclusive: an entry exactly `windowMs` from the run's first entry still joins it.
 */
export function groupAuditRows<Row extends GroupableAuditRow>(
  rows: readonly Row[],
  options: AuditGroupOptions = DEFAULT_AUDIT_GROUP_OPTIONS,
): AuditDisplayItem<Row>[] {
  const groupable = new Set(options.actions);
  const windowMs = Math.max(0, options.windowMs);
  const items: AuditDisplayItem<Row>[] = [];
  let run: Row[] = [];

  const flush = () => {
    if (run.length === 1) items.push({ kind: "row", row: run[0] });
    else if (run.length > 1) {
      const times = run.map((row) => row.createdAt);
      items.push({ kind: "group", action: run[0].action, actorId: run[0].actorId, rows: run, from: Math.min(...times), to: Math.max(...times) });
    }
    run = [];
  };

  for (const row of rows) {
    if (!groupable.has(row.action)) {
      flush();
      items.push({ kind: "row", row });
      continue;
    }
    const first = run[0];
    const joins = first !== undefined && first.action === row.action && first.actorId === row.actorId && Math.abs(first.createdAt - row.createdAt) <= windowMs;
    if (!joins) flush();
    run.push(row);
  }
  flush();
  return items;
}

/** How many log entries the items hold (always the number of rows given). */
export function countAuditItems<Row extends GroupableAuditRow>(items: readonly AuditDisplayItem<Row>[]): number {
  return items.reduce((sum, item) => sum + (item.kind === "row" ? 1 : item.rows.length), 0);
}
