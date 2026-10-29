import { EyeOff, Globe, Info } from "lucide-react";
import Link from "next/link";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import { ConsoleTable } from "@/components/console/shared/ConsoleTable";
import { formatCount } from "@/components/console/shared/messages";
import { XofY } from "@/components/console/shared/XofY";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import type { FunnelCounts, SearchOverview } from "@/lib/crm/console/sources/types";
import { SEARCH_PERIODS } from "@/lib/crm/console/sources/types";

/**
 * Search overview words: an owner-only technical page, ENGLISH ONLY (decision 5; plan §1.2 rule 6),
 * so the strings live here and not in a message catalogue.
 */
export const SEARCH_TEXT = {
  metaTitle: "Search overview",
  metaDescription: "Whether search engines may index the site, and enquiries from search engines, Google Maps and AI assistants.",
  title: "Search overview",
  lead: "Whether search engines may show the site, and how many families arrived from search engines, Google Maps and AI assistants.",
  indexingTitle: "Google indexing",
  hidden: "Hidden from Google (demo mode)",
  hiddenBody: "While the site shows demo content, every page asks search engines not to index it.",
  open: "Open to search engines",
  openBody: "Search engines may index the public pages.",
  enquiriesTitle: "Enquiries from search",
  periodLabel: "Last {days} days",
  caption: "Enquiries from search engines, Google Maps and AI assistants, last {days} days",
  regionLabel: "Last {days} days: scroll sideways for more columns",
  group: "Arrived from",
  enquiries: "Enquiries",
  reached: "Reached counselling",
  admitted: "Admitted",
  smallSample: "Small sample",
  searchEngines: "Search engines",
  maps: "Google Maps (all signals)",
  ai: "AI assistants (all signals)",
  allSignals: "“All signals” adds families who told staff they found us there; each family is counted once.",
  countingNote: "Counts include enquiries that were later erased (their non-personal origin is kept); test enquiries are left out.",
  honestNote:
    "AI answers (ChatGPT, Gemini, Google AI Overviews) cannot be measured directly; this counts only families who arrived from them. Full search tools come at go-live (Phase 4).",
  sourcesLink: "Where enquiries come from: every channel",
  previewValue: "—",
  previewNote: "Preview · no live data",
  asOf: "As of {time} IST",
} as const;

type Row = FunnelCounts & { key: string; label: string };

function rowsOf(period: SearchOverview["periods"][number]): Row[] {
  return [
    { ...period.searchEngines, key: "search", label: SEARCH_TEXT.searchEngines },
    { ...period.maps, key: "maps", label: SEARCH_TEXT.maps },
    { ...period.ai, key: "ai", label: SEARCH_TEXT.ai },
  ];
}

/** Preview: no counts were read (every value is shown as "—"). */
const PREVIEW_COUNTS: FunnelCounts = { enquiries: 0, reachedCounselling: 0, admitted: 0, smallSample: false };

/**
 * `/admin/search` body (owner: 1B-SOURCES). `overview: null` = the data-free console preview:
 * every value is "—" and nothing was read from the database. On a Hindi URL the English body is
 * marked `lang="en"` (WCAG 3.1.2), so screen readers read it as English.
 */
export function SearchOverviewView({ overview, asOf, locale }: { overview: SearchOverview | null; asOf: string | null; locale: Locale }) {
  const preview = overview === null;
  const periods: SearchOverview["periods"] =
    overview?.periods ?? SEARCH_PERIODS.map((days) => ({ days, searchEngines: PREVIEW_COUNTS, maps: PREVIEW_COUNTS, ai: PREVIEW_COUNTS }));
  // English page (decision 5): numbers and rates in English whatever the URL language; links keep it.
  const count = (value: number) => (preview ? SEARCH_TEXT.previewValue : formatCount(value, "en"));
  const rate = (x: number, y: number) => (preview ? SEARCH_TEXT.previewValue : <XofY x={x} y={y} locale="en" />);
  const hidden = overview?.hiddenFromSearch;

  return (
    <div className="space-y-5" lang={locale === "en" ? undefined : "en"}>
      <PortalPanel id="search-indexing" title={SEARCH_TEXT.indexingTitle}>
        {preview ? (
          <p className="text-2xl font-extrabold text-navy">{SEARCH_TEXT.previewValue}</p>
        ) : (
          <div className="flex items-start gap-3">
            {hidden ? <EyeOff aria-hidden="true" className="mt-1 size-5 shrink-0 text-[#5c4a12]" /> : <Globe aria-hidden="true" className="mt-1 size-5 shrink-0 text-success" />}
            <div>
              <p className="text-lg font-extrabold text-navy">{hidden ? SEARCH_TEXT.hidden : SEARCH_TEXT.open}</p>
              <p className="text-sm text-muted">{hidden ? SEARCH_TEXT.hiddenBody : SEARCH_TEXT.openBody}</p>
            </div>
          </div>
        )}
      </PortalPanel>

      <PortalPanel id="search-enquiries" title={SEARCH_TEXT.enquiriesTitle} description={SEARCH_TEXT.countingNote}>
        <div className="space-y-5">
          {periods.map((period) => {
            const caption = format(SEARCH_TEXT.caption, { days: period.days });
            return (
              <section key={period.days} aria-labelledby={`search-period-${period.days}`}>
                <h3 id={`search-period-${period.days}`} className="mb-2 text-base font-extrabold text-navy">
                  {format(SEARCH_TEXT.periodLabel, { days: period.days })}
                </h3>
                <ConsoleTable
                  id={`search-${period.days}`}
                  caption={caption}
                  regionLabel={format(SEARCH_TEXT.regionLabel, { days: period.days })}
                  minWidth="36rem"
                  columns={[
                    { key: "group", header: SEARCH_TEXT.group, cell: (row: Row) => row.label },
                    {
                      key: "enquiries",
                      header: SEARCH_TEXT.enquiries,
                      numeric: true,
                      cell: (row: Row) => (
                        <span className="tabular-nums">
                          {count(row.enquiries)}
                          {!preview && row.smallSample && row.enquiries > 0 && <span className="ml-1.5 text-xs font-normal text-muted">({SEARCH_TEXT.smallSample})</span>}
                        </span>
                      ),
                    },
                    { key: "reached", header: SEARCH_TEXT.reached, numeric: true, cell: (row: Row) => rate(row.reachedCounselling, row.enquiries) },
                    { key: "admitted", header: SEARCH_TEXT.admitted, numeric: true, cell: (row: Row) => rate(row.admitted, row.enquiries) },
                  ]}
                  rows={rowsOf(period)}
                  rowKey={(row) => row.key}
                />
              </section>
            );
          })}
          <ul className="space-y-1.5 text-sm text-muted">
            <li className="flex gap-2">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{SEARCH_TEXT.allSignals}</span>
            </li>
            <li className="flex gap-2">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{SEARCH_TEXT.honestNote}</span>
            </li>
          </ul>
          {asOf && <p className="text-xs text-muted">{format(SEARCH_TEXT.asOf, { time: asOf })}</p>}
          <Link href={localePath("/crm/sources", locale)} className="inline-flex min-h-11 items-center text-sm font-bold text-blue hover:underline">
            {SEARCH_TEXT.sourcesLink}
          </Link>
        </div>
      </PortalPanel>
    </div>
  );
}
