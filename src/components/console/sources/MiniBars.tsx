import { cn } from "@/lib/cn";

/** One column of a `MiniBars` chart. */
export interface BarDatum {
  key: string;
  /** Full label (tooltip and the data table), e.g. "21 Oct 2026". */
  label: string;
  /** Short axis label for the first and last column, e.g. "21 Oct". */
  short: string;
  value: number;
  /** The value as shown (localised digits). */
  valueText: string;
}

/** Slot width (px) per column: about `TARGET_WIDTH` across, between `MIN_SLOT` and `MAX_SLOT` per column. */
const MIN_SLOT = 20;
const MAX_SLOT = 60;
const TARGET_WIDTH = 280;
/** Columns fill 60 % of their slot, never more than 24 px (dataviz mark spec: cap it, never fill the slot). */
const MAX_BAR = 24;
const HEIGHT = 64;
const TOP = 2;
const RADIUS = 4;

/** Pixel geometry of a chart with `columns` columns (the SVG is drawn 1:1 in px, never stretched). */
export function barGeometry(columns: number): { slot: number; bar: number; width: number } {
  const count = Math.max(columns, 1);
  const slot = Math.min(MAX_SLOT, Math.max(MIN_SLOT, Math.floor(TARGET_WIDTH / count)));
  return { slot, bar: Math.min(MAX_BAR, Math.round(slot * 0.6)), width: count * slot };
}

/** A column with a rounded data end and a square base (dataviz mark spec: ≤ 24 px, 4 px data-end radius). */
function columnPath(x: number, y: number, width: number, height: number): string {
  const base = y + height;
  const r = Math.min(RADIUS, width / 2, height);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${base}Z`;
}

/**
 * A small single-series column chart (inline SVG; docs/admin-phase-1b-plan.md §5.J; dataviz rules):
 * one hue (the project's blue token, 4.8:1 on white; `CanvasText` in forced-colours mode), thin
 * columns from one baseline, a hairline base, the first and last labels under it, the highest
 * value in words above it, and a native tooltip per column (hit area = the whole slot). The SVG is
 * hidden from assistive technology: a visually hidden data table carries every value. `max` lets
 * small multiples share one scale. The SVG is drawn at its own pixel width (`barGeometry`) and only
 * ever shrinks uniformly to fit a narrow card, so columns stay ≤ 24 px with round 4 px corners.
 * Server- and client-safe (no hooks).
 */
export function MiniBars({
  id,
  title,
  summary,
  data,
  max,
  columnLabel,
  valueLabel,
  className,
}: {
  id: string;
  title: string;
  /** A line under the title (e.g. "Highest: 12" or a total). */
  summary?: string;
  data: readonly BarDatum[];
  /** Scale maximum (defaults to the largest value here). */
  max?: number;
  /** Data-table header of the label column ("Day", "Week of"). */
  columnLabel: string;
  /** Data-table header of the value column. */
  valueLabel: string;
  className?: string;
}) {
  const top = Math.max(max ?? 0, ...data.map((datum) => datum.value), 0);
  const { slot, bar, width } = barGeometry(data.length);
  const plot = HEIGHT - TOP;
  const first = data[0];
  const last = data[data.length - 1];
  return (
    <figure className={cn("min-w-0 rounded-control border border-line bg-white p-3", className)}>
      <figcaption id={`${id}-title`} className="text-sm font-bold text-navy">
        {title}
      </figcaption>
      {summary && <p className="text-xs text-muted">{summary}</p>}
      <div className="mt-2 max-w-full" style={{ width }}>
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} aria-hidden="true" focusable="false" className="block h-auto w-full">
          {data.map((datum, index) => {
            const height = top > 0 ? (datum.value / top) * plot : 0;
            const x = index * slot + (slot - bar) / 2;
            return (
              <g key={datum.key} className="group">
                <title>{`${datum.label}: ${datum.valueText}`}</title>
                <rect x={index * slot} y={0} width={slot} height={HEIGHT} fill="transparent" />
                {datum.value > 0 && (
                  <path
                    d={columnPath(x, HEIGHT - Math.max(height, 1.5), bar, Math.max(height, 1.5))}
                    className="fill-blue transition-opacity group-hover:opacity-70 forced-colors:fill-[CanvasText]"
                  />
                )}
              </g>
            );
          })}
          <line x1={0} x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} className="stroke-[#c9d6e6] forced-colors:stroke-[CanvasText]" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
        {first && last && (
          <div aria-hidden="true" className="mt-1 flex flex-wrap justify-between gap-x-2 text-[11px] text-muted tabular-nums">
            <span>{first.short}</span>
            {last !== first && <span>{last.short}</span>}
          </div>
        )}
      </div>
      {/* The sr-only wrapper is a div: a <table> ignores the 1 px box and overflow clip, so an
          sr-only table can still widen the page on phones and tablets. */}
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">{columnLabel}</th>
              <th scope="col">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.key}>
                <th scope="row">{datum.label}</th>
                <td>{datum.valueText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
