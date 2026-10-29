import { Bot, Info, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import { EmptyState } from "@/components/ui";
import type { CrmMessages } from "@/components/crm/format";
import { formatCount, type ConsoleCommon } from "@/components/console/shared/messages";
import { ConsoleTable, type ConsoleColumn } from "@/components/console/shared/ConsoleTable";
import { XofY } from "@/components/console/shared/XofY";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { TREND_MAX_WEEKS, type CampaignRow, type ChannelRow, type FunnelCounts, type SignalSummary, type SourcesReport, type ToolDay, type TrendSeries } from "@/lib/crm/console/sources/types";
import { MAPS_TAG_KEY } from "@/lib/crm/console/sources/aggregate";
import { CentreLinksCard, type CentreLinkRow } from "./CentreLinksCard";
import { channelName, dayLabel, heardName, shortDayLabel, toolName, timeLabel, type SourcesMessages } from "./labels";
import { MiniBars, type BarDatum } from "./MiniBars";

/** Section ids (also the in-page links; `#maps` is the settings hub's "Google Maps links" target). */
export const SOURCE_SECTIONS = ["channels", "maps", "ai", "campaigns", "referrers", "pages", "heard", "tools", "weekly"] as const;
type SectionId = (typeof SOURCE_SECTIONS)[number];
/** Sections that stay when the range has no enquiries (centre links; tool use is not range-based). */
const ALWAYS_SECTIONS: readonly SectionId[] = ["maps", "tools"];

export interface SourcesViewProps {
  report: SourcesReport;
  /** The viewer is an area head (counts are their scope only). */
  managerScope: boolean;
  links: { rows: CentreLinkRow[]; version: number; canEdit: boolean };
  /** LOCALE-FREE inbox link of the free tool users queue (CRM admins), else null. */
  freeToolUsersHref: string | null;
  pagePath: string;
  locale: Locale;
  s: SourcesMessages;
  common: ConsoleCommon;
  crm: Pick<CrmMessages, "errors">;
  /** The filter row (rendered above the counting note). */
  filters: ReactNode;
}

/** A campaign row, or the closing "Other (n campaigns)" row. */
type CampaignView = CampaignRow & { other?: boolean };

function campaignView(report: SourcesReport, s: SourcesMessages, count: (value: number) => string): CampaignView[] {
  const other = report.campaigns.other;
  return [
    ...report.campaigns.rows,
    ...(other
      ? [
          {
            campaign: format(s.campaigns.other, { count: count(other.distinct) }),
            topSource: null,
            topMedium: null,
            enquiries: other.enquiries,
            reachedCounselling: other.reachedCounselling,
            admitted: other.admitted,
            smallSample: other.smallSample,
            other: true,
          },
        ]
      : []),
  ];
}

/** "12" plus "(Small sample)" for groups under 10. */
function Enquiries({ value, small, locale, common }: { value: number; small: boolean; locale: Locale; common: ConsoleCommon }) {
  return (
    <span className="tabular-nums">
      {formatCount(value, locale)}
      {small && value > 0 && <span className="ml-1.5 whitespace-nowrap text-xs font-normal text-muted">({common.common.smallSample})</span>}
    </span>
  );
}

function funnelColumns<Row extends FunnelCounts>(s: SourcesMessages, common: ConsoleCommon, locale: Locale): ConsoleColumn<Row>[] {
  return [
    { key: "enquiries", header: s.columns.enquiries, numeric: true, cell: (row) => <Enquiries value={row.enquiries} small={row.smallSample} locale={locale} common={common} /> },
    { key: "reached", header: s.columns.reached, numeric: true, cell: (row) => <XofY x={row.reachedCounselling} y={row.enquiries} locale={locale} t={common} /> },
    { key: "admitted", header: s.columns.admitted, numeric: true, cell: (row) => <XofY x={row.admitted} y={row.enquiries} locale={locale} t={common} /> },
  ];
}

function regionLabel(common: ConsoleCommon, caption: string): string {
  return format(common.common.scrollHint, { table: caption });
}

function SignalBlock({
  summary,
  labels,
  signalLabel,
  locale,
  s,
  common,
}: {
  summary: SignalSummary;
  labels: { fromVisit: string; fromStaff: string; caption: string };
  signalLabel: (key: string) => string;
  locale: Locale;
  s: SourcesMessages;
  common: ConsoleCommon;
}) {
  if (summary.enquiries === 0) return <p className="text-sm text-muted">{s.signals.none}</p>;
  return (
    <div className="space-y-4">
      <dl aria-label={labels.caption} className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-control border border-line bg-white p-4">
          <dt className="text-xs font-semibold text-muted">{s.signals.total}</dt>
          <dd className="mt-1 text-2xl font-extrabold text-navy">
            {formatCount(summary.enquiries, locale)}
            {summary.smallSample && <span className="ml-2 text-xs font-semibold text-muted">({common.common.smallSample})</span>}
          </dd>
        </div>
        <div className="rounded-control border border-line bg-white p-4">
          <dt className="text-xs font-semibold text-muted">{s.columns.reached}</dt>
          <dd className="mt-1 text-lg font-bold text-navy">
            <XofY x={summary.reachedCounselling} y={summary.enquiries} locale={locale} t={common} />
          </dd>
        </div>
        <div className="rounded-control border border-line bg-white p-4">
          <dt className="text-xs font-semibold text-muted">{s.columns.admitted}</dt>
          <dd className="mt-1 text-lg font-bold text-navy">
            <XofY x={summary.admitted} y={summary.enquiries} locale={locale} t={common} />
          </dd>
        </div>
      </dl>
      <div>
        <h3 className="text-sm font-bold text-navy">{s.signals.breakdown}</h3>
        <ul className="mt-1 space-y-1 text-sm">
          <li className="flex justify-between gap-3 border-b border-line py-1.5 sm:max-w-md">
            <span>{labels.fromVisit}</span>
            <span className="font-bold tabular-nums">{formatCount(summary.fromVisit, locale)}</span>
          </li>
          <li className="flex justify-between gap-3 border-b border-line py-1.5 sm:max-w-md">
            <span>{labels.fromStaff}</span>
            <span className="font-bold tabular-nums">{formatCount(summary.fromStaff, locale)}</span>
          </li>
        </ul>
        {summary.both > 0 && <p className="mt-1 text-xs text-muted">{format(s.signals.bothNote, { both: formatCount(summary.both, locale) })}</p>}
      </div>
      {summary.bySignal.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-navy">{s.columns.signal}</h3>
          <ul aria-label={s.columns.signal} className="mt-2 flex flex-wrap gap-2">
            {summary.bySignal.map((entry) => (
              <li key={entry.key} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm">
                <span className="break-all">{signalLabel(entry.key)}</span>
                <span className="font-bold tabular-nums">{formatCount(entry.count, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Footnotes({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-1 text-xs text-muted">
      {items.map((item) => (
        <li key={item} className="flex gap-1.5">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ToolsSection({
  report,
  freeToolUsersHref,
  locale,
  s,
  common,
}: {
  report: SourcesReport;
  freeToolUsersHref: string | null;
  locale: Locale;
  s: SourcesMessages;
  common: ConsoleCommon;
}) {
  const tools = report.tools;
  const t = s.tools;
  const status = tools.gate.mode === "off" ? format(t.status.off, { reason: t.offReasons[tools.gate.offReason ?? "unset"] }) : t.status[tools.gate.mode];
  const usage = tools.usage;
  const count = (value: number) => formatCount(value, locale);
  const series: { key: string; title: string; value: (day: ToolDay) => number }[] = [
    { key: "contact", title: `${t.usageColumns.contactNew} + ${t.usageColumns.contactKnown}`, value: (day) => day.contactNew + day.contactKnown },
    { key: "mock", title: t.usageColumns.mockTests, value: (day) => day.mockTests },
    { key: "planner", title: t.usageColumns.planner, value: (day) => day.plannerStudents },
    { key: "uses", title: t.usageColumns.toolUses, value: (day) => day.toolUses },
  ];
  const usageColumns: ConsoleColumn<ToolDay>[] = [
    { key: "day", header: s.columns.day, cell: (day) => <time dateTime={day.day}>{dayLabel(day.day, locale)}</time> },
    { key: "contactNew", header: t.usageColumns.contactNew, numeric: true, cell: (day) => count(day.contactNew) },
    { key: "contactKnown", header: t.usageColumns.contactKnown, numeric: true, cell: (day) => count(day.contactKnown) },
    { key: "mockTests", header: t.usageColumns.mockTests, numeric: true, cell: (day) => count(day.mockTests) },
    { key: "planner", header: t.usageColumns.planner, numeric: true, cell: (day) => count(day.plannerStudents) },
    {
      key: "rancho",
      header: t.usageColumns.rancho,
      numeric: true,
      cell: (day) => (day.ranchoQuestions === null ? <span className="text-xs text-muted">{t.notKept}</span> : count(day.ranchoQuestions)),
    },
    {
      key: "toolUses",
      header: t.usageColumns.toolUses,
      numeric: true,
      cell: (day) => (
        <span>
          {count(day.toolUses)}
          {day.toolUses > 0 && (
            <span className="block text-xs text-muted">
              {Object.entries(day.toolUsesByTool)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([tool, uses]) => `${toolName(s, tool)} ${count(uses)}`)
                .join(" · ")}
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <dl className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <dt className="font-semibold text-muted">{t.formStatus}</dt>
        <dd className="font-bold text-navy">{status}</dd>
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-bold text-navy">{t.byToolTitle}</h3>
        <ConsoleTable
          id="sources-by-tool"
          caption={t.byToolCaption}
          regionLabel={regionLabel(common, t.byToolCaption)}
          minWidth="20rem"
          columns={[
            { key: "tool", header: s.columns.tool, cell: (row) => toolName(s, row.tool) },
            { key: "enquiries", header: s.columns.enquiries, numeric: true, cell: (row) => count(row.enquiries) },
          ]}
          rows={tools.enquiriesByTool}
          rowKey={(row) => row.tool}
          empty={<p className="text-sm text-muted">{t.noToolEnquiries}</p>}
        />
        <Footnotes items={[t.footnotes.predictor]} />
      </div>

      {usage && (
        <div>
          <h3 className="text-sm font-bold text-navy">{t.usageTitle}</h3>
          <p className="mb-3 text-xs text-muted">{t.usageScope}</p>
          <h4 className="mb-2 text-sm font-semibold text-navy">{t.chartTitle}</h4>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {series.map((entry) => {
              const data: BarDatum[] = usage.days.map((day) => ({
                key: day.day,
                label: dayLabel(day.day, locale),
                short: shortDayLabel(day.day, locale),
                value: entry.value(day),
                valueText: count(entry.value(day)),
              }));
              const max = Math.max(0, ...data.map((datum) => datum.value));
              return (
                <MiniBars
                  key={entry.key}
                  id={`sources-tools-${entry.key}`}
                  title={entry.title}
                  summary={format(t.chartMax, { max: count(max) })}
                  data={data}
                  columnLabel={s.columns.day}
                  valueLabel={entry.title}
                />
              );
            })}
          </div>
          <ConsoleTable
            id="sources-tool-days"
            caption={t.usageCaption}
            regionLabel={regionLabel(common, t.usageCaption)}
            minWidth="52rem"
            columns={usageColumns}
            rows={[...usage.days].reverse()}
            rowKey={(day) => day.day}
          />
          <Footnotes items={[t.footnotes.contact, t.footnotes.mockTests, t.footnotes.planner, t.footnotes.rancho, t.footnotes.toolUses]} />
        </div>
      )}

      {freeToolUsersHref && (
        <Link href={localePath(freeToolUsersHref, locale)} className="inline-flex min-h-11 items-center text-sm font-bold text-blue hover:underline">
          {t.freeToolUsers}
        </Link>
      )}
    </div>
  );
}

function WeeklySection({ report, locale, s, common }: { report: SourcesReport; locale: Locale; s: SourcesMessages; common: ConsoleCommon }) {
  const { series, weeks, shownFromDay } = report.weekly;
  const count = (value: number) => formatCount(value, locale);
  // The range is longer than the weeks shown: say so, so the weekly totals are not read as the page total.
  const clipped = shownFromDay ? (
    <p className="text-sm text-muted">{format(s.weekly.clipped, { weeks: count(TREND_MAX_WEEKS), from: dayLabel(shownFromDay, locale) })}</p>
  ) : null;
  if (weeks.length === 0 || weeks.every((week) => week.total === 0)) {
    return (
      <div className="space-y-2">
        {clipped}
        <p className="text-sm text-muted">{s.weekly.empty}</p>
      </div>
    );
  }
  const weekLabel = (week: (typeof weeks)[number]) => `${dayLabel(week.weekStart, locale)}${week.partial ? ` (${s.weekly.partial})` : ""}`;
  const columns: ConsoleColumn<(typeof weeks)[number]>[] = [
    { key: "week", header: s.columns.week, cell: (week) => <time dateTime={week.weekStart}>{weekLabel(week)}</time> },
    ...series.map((key: TrendSeries) => ({ key, header: channelName(s, key), numeric: true, cell: (week: (typeof weeks)[number]) => count(week.counts[key] ?? 0) })),
    { key: "total", header: s.weekly.total, numeric: true, cell: (week) => <strong>{count(week.total)}</strong> },
  ];
  const shared = Math.max(0, ...weeks.flatMap((week) => series.map((key) => week.counts[key] ?? 0)));
  return (
    <div className="space-y-4">
      {clipped}
      <div>
        <h3 className="text-sm font-bold text-navy">{s.weekly.chartTitle}</h3>
        <p className="mb-3 text-xs text-muted">{s.weekly.chartNote}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {series.map((key) => {
            const total = weeks.reduce((sum, week) => sum + (week.counts[key] ?? 0), 0);
            return (
              <MiniBars
                key={key}
                id={`sources-week-${key}`}
                title={channelName(s, key)}
                summary={`${s.weekly.total}: ${count(total)}`}
                max={shared}
                data={weeks.map((week) => ({
                  key: week.weekStart,
                  label: weekLabel(week),
                  short: shortDayLabel(week.weekStart, locale),
                  value: week.counts[key] ?? 0,
                  valueText: count(week.counts[key] ?? 0),
                }))}
                columnLabel={s.columns.week}
                valueLabel={s.columns.enquiries}
              />
            );
          })}
        </div>
      </div>
      <ConsoleTable
        id="sources-weekly"
        caption={s.weekly.caption}
        regionLabel={regionLabel(common, s.weekly.caption)}
        minWidth={`${Math.max(30, 10 + series.length * 8)}rem`}
        columns={columns}
        rows={[...weeks].reverse()}
        rowKey={(week) => week.weekStart}
      />
    </div>
  );
}

/**
 * "Where enquiries come from" (docs/admin-phase-1b-plan.md §5.J; owner: 1B-SOURCES): the counting
 * note, an in-page link list, then the nine sections, each a real table with "x of y" rates.
 * Server-safe; the centre links card and the copy buttons are the client islands.
 */
export function SourcesView({ report, managerScope, links, freeToolUsersHref, pagePath, locale, s, common, crm, filters }: SourcesViewProps) {
  const empty = report.total === 0;
  const visible = SOURCE_SECTIONS.filter((id) => !empty || ALWAYS_SECTIONS.includes(id));
  const count = (value: number) => formatCount(value, locale);
  const rangeText = `${dayLabel(report.range.fromDay, locale)} – ${dayLabel(report.range.toDay, locale)}`;

  return (
    <div className="space-y-5">
      {filters}

      <div role="note" className="flex gap-3 rounded-control border border-line bg-[#f4f7fb] px-4 py-3 text-sm text-[#354b66]">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">{s.page.countingNote}</p>
          {report.erased > 0 && <p>{format(s.page.erasedLine, { erased: count(report.erased), total: count(report.total) })}</p>}
          <p>{s.page.testNote}</p>
          {managerScope && <p>{s.page.scopeNote}</p>}
          <p className="text-xs text-muted">{format(s.page.asOf, { range: rangeText, time: timeLabel(report.generatedAt, locale) })}</p>
        </div>
      </div>

      <nav aria-label={s.page.contents}>
        <ul className="flex flex-wrap gap-2">
          {visible.map((id) => (
            <li key={id}>
              <a href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-3 text-sm font-semibold text-navy hover:border-blue">
                {s.sections[id]}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {empty && <EmptyState title={s.page.empty} description={s.page.emptyHint} />}

      {!empty && (
        <PortalPanel id="channels" title={s.sections.channels} description={s.channels.intro}>
          <ConsoleTable
            id="sources-channels"
            caption={s.channels.caption}
            regionLabel={regionLabel(common, s.channels.caption)}
            columns={[{ key: "channel", header: s.columns.channel, cell: (row) => channelName(s, row.channel) }, ...funnelColumns<ChannelRow>(s, common, locale)]}
            rows={report.channels}
            rowKey={(row) => row.channel}
          />
          <ul className="mt-3 space-y-1.5 text-xs text-muted">
            <li className="flex gap-1.5">
              <Bot aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>{s.channels.aiInfo}</span>
            </li>
            <li className="flex gap-1.5">
              <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>{s.channels.mapsInfo}</span>
            </li>
          </ul>
        </PortalPanel>
      )}

      <PortalPanel id="maps" title={s.sections.maps} description={empty ? undefined : s.maps.intro}>
        {!empty && (
          <div className="mb-6">
            <SignalBlock
              summary={report.maps}
              labels={s.maps}
              signalLabel={(key) => (key === MAPS_TAG_KEY ? s.maps.tagged : key)}
              locale={locale}
              s={s}
              common={common}
            />
          </div>
        )}
        <section aria-labelledby="sources-centre-links">
          <h3 id="sources-centre-links" className="text-base font-extrabold text-navy">
            {s.links.title}
          </h3>
          <p className="mb-3 mt-1 text-sm text-muted">{s.links.intro}</p>
          <CentreLinksCard rows={links.rows} version={links.version} canEdit={links.canEdit} pagePath={pagePath} notSet={common.common.notSet} t={s.links} errors={crm} />
        </section>
      </PortalPanel>

      {!empty && (
        <PortalPanel id="ai" title={s.sections.ai} description={s.ai.intro}>
          <SignalBlock summary={report.ai} labels={s.ai} signalLabel={(key) => key} locale={locale} s={s} common={common} />
        </PortalPanel>
      )}

      {!empty && (
        <PortalPanel id="campaigns" title={s.sections.campaigns} description={s.campaigns.intro}>
          <ConsoleTable
            id="sources-campaigns"
            caption={s.campaigns.caption}
            regionLabel={regionLabel(common, s.campaigns.caption)}
            minWidth="46rem"
            columns={[
              { key: "campaign", header: s.columns.campaign, cell: (row) => <span className={cn("break-all", row.other && "font-normal italic text-muted")}>{row.campaign}</span> },
              {
                key: "sourceMedium",
                header: s.columns.sourceMedium,
                cell: (row) => (row.other ? "" : `${row.topSource ?? s.campaigns.notSet} / ${row.topMedium ?? s.campaigns.notSet}`),
              },
              ...funnelColumns<CampaignView>(s, common, locale),
            ]}
            rows={campaignView(report, s, count)}
            rowKey={(row) => (row.other ? "__other" : `c:${row.campaign}`)}
            empty={<p className="text-sm text-muted">{s.campaigns.empty}</p>}
          />
          {report.campaigns.untagged > 0 && <p className="mt-2 text-xs text-muted">{format(s.campaigns.untagged, { count: count(report.campaigns.untagged) })}</p>}
        </PortalPanel>
      )}

      {!empty && (
        <PortalPanel id="referrers" title={s.sections.referrers} description={s.referrers.intro}>
          <ConsoleTable
            id="sources-referrers"
            caption={s.referrers.caption}
            regionLabel={regionLabel(common, s.referrers.caption)}
            minWidth="24rem"
            columns={[
              {
                key: "host",
                header: s.columns.website,
                cell: (row) => (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="break-all">{row.host}</span>
                    {row.ai && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#c9b8f5] bg-[#f3eeff] px-2 py-0.5 text-xs font-semibold text-[#4b2fb0]">
                        <Sparkles aria-hidden="true" className="size-3" />
                        {s.referrers.ai}
                      </span>
                    )}
                  </span>
                ),
              },
              { key: "enquiries", header: s.columns.enquiries, numeric: true, cell: (row) => count(row.enquiries) },
            ]}
            rows={[
              ...report.referrers.rows,
              ...(report.referrers.other ? [{ host: format(s.referrers.other, { count: count(report.referrers.other.distinct) }), enquiries: report.referrers.other.enquiries, ai: false, other: true }] : []),
            ]}
            rowKey={(row) => ("other" in row ? "__other" : `h:${row.host}`)}
            empty={<p className="text-sm text-muted">{s.referrers.empty}</p>}
          />
          {report.referrers.none > 0 && <p className="mt-2 text-xs text-muted">{format(s.referrers.none, { count: count(report.referrers.none) })}</p>}
        </PortalPanel>
      )}

      {!empty && (
        <PortalPanel id="pages" title={s.sections.pages} description={s.pages.intro}>
          <ConsoleTable
            id="sources-pages"
            caption={s.pages.caption}
            regionLabel={regionLabel(common, s.pages.caption)}
            minWidth="24rem"
            columns={[
              { key: "page", header: s.columns.page, cell: (row) => <span className="break-all">{row.page}</span> },
              { key: "enquiries", header: s.columns.enquiries, numeric: true, cell: (row) => count(row.enquiries) },
            ]}
            rows={[
              ...report.pages.rows,
              ...(report.pages.other ? [{ page: format(s.pages.other, { count: count(report.pages.other.distinct) }), enquiries: report.pages.other.enquiries, other: true }] : []),
            ]}
            rowKey={(row) => ("other" in row ? "__other" : `p:${row.page}`)}
            empty={<p className="text-sm text-muted">{s.pages.empty}</p>}
          />
          {report.pages.none > 0 && <p className="mt-2 text-xs text-muted">{format(s.pages.none, { count: count(report.pages.none) })}</p>}
        </PortalPanel>
      )}

      {!empty && (
        <PortalPanel id="heard" title={s.sections.heard} description={s.heard.intro}>
          <ConsoleTable
            id="sources-heard"
            caption={s.heard.caption}
            regionLabel={regionLabel(common, s.heard.caption)}
            minWidth="24rem"
            columns={[
              { key: "answer", header: s.columns.answer, cell: (row) => <span className={cn(row.key === null && "text-muted")}>{heardName(s, row.key)}</span> },
              { key: "enquiries", header: s.columns.enquiries, numeric: true, cell: (row) => count(row.enquiries) },
            ]}
            rows={report.heard}
            rowKey={(row) => row.key ?? "__not_recorded"}
          />
        </PortalPanel>
      )}

      <PortalPanel id="tools" title={s.sections.tools} description={s.tools.intro}>
        <ToolsSection report={report} freeToolUsersHref={freeToolUsersHref} locale={locale} s={s} common={common} />
      </PortalPanel>

      {!empty && (
        <PortalPanel id="weekly" title={s.sections.weekly} description={s.weekly.intro}>
          <WeeklySection report={report} locale={locale} s={s} common={common} />
        </PortalPanel>
      )}
    </div>
  );
}
