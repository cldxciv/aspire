import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One column of a `ConsoleTable`. The FIRST column is the row header (`<th scope="row">`, sticky on
 * tablets, the card title on phones). `numeric` columns are right-aligned with tabular figures.
 */
export interface ConsoleColumn<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  numeric?: boolean;
}

/**
 * The console's data table (docs/admin-phase-1b-plan.md §5 common UI rules; owner: 1B-CORE):
 * - `md` and up: a real table with a `<caption>`, `scope`d headers and numbers right-aligned in
 *   tabular figures, inside a focusable scroll region (`tabIndex=0`, `role="region"`, `aria-label`)
 *   with a sticky first column, so a wide table never scrolls the page on tablets (768–1023 px);
 * - below `md`: one card per row (a `<dl>` of the column names and values), no sideways scroll.
 * An optional `total` row closes both (`<tfoot>` / a last card). Server- and client-safe (no hooks).
 */
export function ConsoleTable<Row>({
  id,
  caption,
  captionVisible = false,
  regionLabel,
  columns,
  rows,
  rowKey,
  total,
  empty,
  minWidth = "40rem",
  className,
}: {
  /** Unique on the page (ids of the caption and the region). */
  id: string;
  /** Table caption (also names the card list on phones). */
  caption: string;
  /** Show the caption above the table instead of only to assistive technology. */
  captionVisible?: boolean;
  /** Accessible name of the scroll region (e.g. "Numbers by centre: scroll sideways for more columns"). */
  regionLabel: string;
  columns: readonly ConsoleColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** A Total row, rendered last and bold. */
  total?: Row | null;
  /** Shown instead of the table when there are no rows (and no total). Says what to do. */
  empty?: ReactNode;
  /** Minimum table width before the region scrolls (a CSS length). */
  minWidth?: string;
  className?: string;
}) {
  if (rows.length === 0 && !total) return empty ? <div className={className}>{empty}</div> : null;
  const [first, ...rest] = columns;
  const captionId = `${id}-caption`;
  const cellClass = (column: ConsoleColumn<Row>) => cn("px-3 py-2.5 align-top", column.numeric && "text-right tabular-nums");

  return (
    <div className={className}>
      {/* Tablets and desktops: the table, scrolling inside its own focusable region. `relative` makes
          the region the containing block of sr-only (absolutely positioned) text in the cells, so the
          clipped columns can never widen the page. */}
      <div id={`${id}-region`} role="region" aria-label={regionLabel} tabIndex={0} className="relative hidden overflow-x-auto rounded-control border border-line bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue md:block">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
          <caption id={captionId} className={captionVisible ? "px-3 pb-2 pt-3 text-left text-sm font-bold text-navy" : "sr-only"}>
            {caption}
          </caption>
          <thead>
            <tr className="border-b border-line bg-surface text-xs text-muted">
              <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2 font-bold">
                {first?.header}
              </th>
              {rest.map((column) => (
                <th key={column.key} scope="col" className={cn("px-3 py-2 font-bold", column.numeric && "text-right")}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2.5 align-top font-semibold text-navy">
                  {first?.cell(row)}
                </th>
                {rest.map((column) => (
                  <td key={column.key} className={cellClass(column)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr className="border-t-2 border-line font-bold">
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2.5 align-top text-navy">
                  {first?.cell(total)}
                </th>
                {rest.map((column) => (
                  <td key={column.key} className={cellClass(column)}>
                    {column.cell(total)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Phones: one card per row. */}
      <ul aria-label={caption} className="space-y-3 md:hidden">
        {[...rows, ...(total ? [total] : [])].map((row, index) => {
          const isTotal = total !== undefined && total !== null && index === rows.length;
          return (
            <li key={isTotal ? `${id}-total` : rowKey(row)} className={cn("rounded-card border border-line bg-white p-4 shadow-soft", isTotal && "border-2")}>
              <p className="font-bold text-navy">{first?.cell(row)}</p>
              <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">
                {rest.map((column) => (
                  <div key={column.key} className="contents">
                    <dt className="text-muted">{column.header}</dt>
                    <dd className={cn("min-w-0 break-words", column.numeric ? "text-right tabular-nums" : "text-right")}>{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
