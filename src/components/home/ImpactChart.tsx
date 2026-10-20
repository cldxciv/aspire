import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { AspireImage, DemoBadge, Section, type SectionTone } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import type { Messages } from "@/i18n/messages/types";
import { localizeImage, type RankerYearCount } from "@/lib/data";
import type { Stat } from "@/lib/types";

type ImpactCopy = Messages<"home">["impact"];

/*
 * Chart method: dataviz skill. Two categorical series (identity: JEE vs NEET), fixed order.
 * Palette validated with the skill's validator against the white chart card (light mode):
 *   #1768d4 (brand blue, JEE) · #eda100 (documented yellow slot, NEET)
 *   → band, chroma, CVD (ΔE 35.1) and normal-vision (ΔE 41.3) PASS; NEET contrast 2.17:1 WARN,
 *   relieved by a value label on every bar plus the data table. The site has no dark mode.
 * Identity is never colour alone: legend with names + fixed left/right position in each year.
 * Text wears ink tokens, never the series colour.
 */
const SERIES = [
  { key: "jee", label: "JEE", position: "left", barClass: "fill-blue", swatchClass: "bg-blue" },
  { key: "neet", label: "NEET", position: "right", barClass: "fill-[#eda100]", swatchClass: "bg-[#eda100]" },
] as const;

/** Geometry in CSS px (the SVG has no viewBox, so text never scales); x positions use %. */
const CHART_HEIGHT = 216;
const BASELINE = 182;
const YEAR_LABEL_Y = 204;
const LABEL_GAP = 6; // between a bar's cap and its value label
const LABEL_LINE = 14; // one 12px label line, for lifting a colliding label
const PLOT_TOP = 26; // room for one value label above the tallest bar
const DIGIT_WIDTH = 7.5; // conservative width of a 12px bold digit

/** Column with a 4px rounded data-end and a square foot on the baseline. */
function barPath(x: number, width: number, height: number): string {
  const r = Math.min(4, height, width / 2);
  const top = BASELINE - height;
  return [
    `M${x} ${BASELINE}`,
    `V${top + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${top}`,
    `H${x + width - r}`,
    `A${r} ${r} 0 0 1 ${x + width} ${top + r}`,
    `V${BASELINE}`,
    "Z",
  ].join("");
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Plain-language summary of every value, for the SVG's accessible name. */
function describe(counts: RankerYearCount[], t: ImpactCopy): string {
  const years = counts.map((c) => format(t.chartYear, { year: c.year, jee: c.jee, neet: c.neet })).join("; ");
  return format(t.chartLabel, { years });
}

/**
 * Inline, server-rendered grouped column chart. The outer SVG is 100% wide with a fixed
 * height; each year is a nested <svg> placed at a % offset, so bars and labels keep real
 * pixel sizes at every width (320px and up for ≤ 6 years).
 */
function GroupedColumns({ counts, t }: { counts: RankerYearCount[]; t: ImpactCopy }) {
  // ≤ 24px thick (mark spec); 18px keeps clear air between years at 320px (5 years).
  const barWidth = counts.length <= 6 ? 18 : 12;
  const gap = 4; // surface gap between the pair
  const offsets = [-(barWidth + gap / 2), gap / 2]; // JEE left, NEET right
  const labelDistance = barWidth + gap; // between the two label centres of a pair

  // Two wide labels (e.g. 150 / 149) on near-equal bars would run together: the taller
  // bar's label is then lifted one line. Reserve that headroom only when it is needed.
  const collides = (a: number, b: number) =>
    ((String(a).length + String(b).length) * DIGIT_WIDTH) / 2 + 2 > labelDistance;
  const anyCollision = counts.some((c) => collides(c.jee, c.neet));
  const plotTop = PLOT_TOP + (anyCollision ? LABEL_LINE : 0);
  const max = Math.max(1, ...counts.flatMap((c) => [c.jee, c.neet]));
  const scale = (BASELINE - plotTop) / max;

  const layout = counts.map((row) => {
    const heights = SERIES.map((series) => round1(row[series.key] * scale));
    const labelY = heights.map((h) => BASELINE - h - LABEL_GAP);
    if (collides(row.jee, row.neet) && Math.abs(labelY[0] - labelY[1]) < LABEL_LINE) {
      const taller = heights[0] > heights[1] ? 0 : 1;
      labelY[taller] = Math.min(labelY[taller], labelY[1 - taller] - LABEL_LINE);
    }
    return { row, heights, labelY };
  });

  return (
    <svg
      width="100%"
      height={CHART_HEIGHT}
      role="img"
      aria-label={describe(counts, t)}
      className="block overflow-visible"
    >
      <line x1="0" x2="100%" y1={BASELINE + 0.5} y2={BASELINE + 0.5} stroke="#c3cfdd" strokeWidth="1" />
      {layout.map(({ row, heights, labelY }, i) => (
        <svg key={row.year} x={`${round1(((i + 0.5) / counts.length) * 100)}%`} overflow="visible">
          {SERIES.map((series, s) => {
            const value = row[series.key];
            const height = heights[s];
            const x = offsets[s];
            return (
              <g key={series.key}>
                {height > 0 && (
                  <path d={barPath(x, barWidth, height)} className={`${series.barClass} transition-opacity hover:opacity-80`}>
                    <title>{`${row.year} · ${series.label}: ${format(value === 1 ? t.entryOne : t.entryMany, { count: value })}`}</title>
                  </path>
                )}
                <text
                  x={x + barWidth / 2}
                  y={labelY[s]}
                  textAnchor="middle"
                  className="fill-ink text-xs font-bold tabular-nums"
                >
                  {value}
                </text>
              </g>
            );
          })}
          <text x="0" y={YEAR_LABEL_Y} textAnchor="middle" className="fill-muted text-xs font-semibold tabular-nums">
            {row.year}
          </text>
        </svg>
      ))}
    </svg>
  );
}

/** Navy figure card: the stored stat, value and label exactly as stored. */
function RankerStatCard({
  stat,
  yearSpan,
  t,
  demoLabel,
}: {
  stat: Stat;
  yearSpan: string;
  t: ImpactCopy;
  demoLabel: string;
}) {
  return (
    <div
      data-surface="dark"
      className="flex flex-col rounded-card bg-linear-to-br from-navy to-navy-2 p-6 text-white shadow-card md:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <AspireImage asset={aspireAssets.trophySuccess} className="w-16 shrink-0" />
        {stat.status === "placeholder" && <DemoBadge label={demoLabel} />}
      </div>
      <p className="mt-5 font-serif text-5xl font-semibold leading-none text-gold">{stat.value}</p>
      <p className="mt-3 text-lg font-semibold">{stat.label}</p>
      {stat.context && <p className="mt-1.5 text-sm text-[#d3e1f3]">{stat.context}</p>}
      <p className="mt-auto pt-6 text-xs text-[#d3e1f3]">{format(t.coverage, { span: yearSpan })}</p>
    </div>
  );
}

/**
 * Homepage impact block (plan §4.10, D-025): counts of entries in the imported results list
 * per exam year, JEE vs NEET, from getRankerYearCounts() — list entries, never "ranks".
 * Every bar carries its value; a "Show data" disclosure holds the same numbers as a table.
 * Beside it, the `rankerStat` value and label exactly as stored. Returns null without counts
 * (production today).
 */
export function ImpactChart({
  counts,
  rankerStat,
  locale,
  tone = "white",
}: {
  counts: RankerYearCount[];
  rankerStat?: Stat;
  locale: Locale;
  tone?: SectionTone;
}) {
  if (counts.length === 0) return null;
  const t = messagesFor(locale, "home").impact;
  const common = messagesFor(locale, "common");
  const demo = counts.some((c) => c.placeholder);
  const first = counts[0].year;
  const last = counts[counts.length - 1].year;
  const yearSpan = first === last ? String(first) : `${first}–${last}`;
  // Object still life beside the chart from `xl` (D-030): no people, no ranks implied.
  const photo = localizeImage(stockImages.pocketWatchWorksheet, locale);

  return (
    <Section tone={tone} aria-labelledby="home-impact-title">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue">{t.eyebrow}</p>
        {demo && <DemoBadge label={common.labels.demoPending} />}
      </div>
      <h2
        id="home-impact-title"
        className="mt-2 max-w-3xl font-serif text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-tight text-navy [&:lang(hi)]:leading-snug"
      >
        {t.title}
      </h2>
      <p id="home-impact-subtitle" className="mt-3 max-w-2xl leading-relaxed text-muted">
        {t.subtitle}
        {demo && ` ${t.demoSuffix}`}
      </p>

      <div className="mt-8 grid gap-6 md:mt-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_16rem_minmax(0,0.85fr)]">
        <figure
          aria-labelledby="home-impact-title"
          aria-describedby="home-impact-subtitle"
          className="min-w-0 rounded-card border border-line bg-white p-5 shadow-soft sm:p-7"
        >
          <ul aria-label={t.legendLabel} className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink">
            {SERIES.map((series) => (
              <li key={series.key} className="inline-flex items-center gap-2">
                <span aria-hidden="true" className={`size-3 rounded-[3px] ${series.swatchClass}`} />
                <span className="font-bold">{series.label}</span>
                <span className="text-muted">{series.position === "left" ? t.leftBar : t.rightBar}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <GroupedColumns counts={counts} t={t} />
          </div>
          <details className="group mt-4 border-t border-line pt-2">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-blue hover:underline [&::-webkit-details-marker]:hidden">
              {t.showTable}
              <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <table className="mt-3 w-full max-w-md text-left text-sm tabular-nums">
              <caption className="sr-only">{t.tableCaption}</caption>
              <thead>
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="py-1.5 pr-4 font-semibold">
                    {t.examYear}
                  </th>
                  <th scope="col" className="py-1.5 pr-4 font-semibold">
                    {t.jeeEntries}
                  </th>
                  <th scope="col" className="py-1.5 font-semibold">
                    {t.neetEntries}
                  </th>
                </tr>
              </thead>
              <tbody>
                {counts.map((row) => (
                  <tr key={row.year} className="border-b border-line last:border-0">
                    <th scope="row" className="py-1.5 pr-4 font-semibold text-navy">
                      {row.year}
                    </th>
                    <td className="py-1.5 pr-4">{row.jee}</td>
                    <td className="py-1.5">{row.neet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>

        {rankerStat && (
          <RankerStatCard stat={rankerStat} yearSpan={yearSpan} t={t} demoLabel={common.labels.demo} />
        )}
        <figure className="relative m-0 hidden min-h-64 overflow-hidden rounded-card bg-surface shadow-soft xl:block">
          <Image src={photo.src} alt={photo.alt} fill sizes="380px" className="object-cover" />
          <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
            {common.labels.illustrativeStockPhoto}
          </span>
        </figure>
      </div>
    </Section>
  );
}
