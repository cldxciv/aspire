import { Download } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { portalAreas } from "@/components/portal/areas";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import { EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { htmlLang } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { FUNNEL_STAGES, LEAD_STAGES, type CrmPermissions, type FunnelCount, type FunnelReport, type GateDayCount } from "@/lib/crm/types";
import { exportHref } from "./api";
import {
  centreLabel,
  formatDate,
  istDayStart,
  lostReasonLabel,
  programLabel,
  sourceLabel,
  stageLabel,
  toolLabel,
  type CrmMessages,
} from "./format";

/** IST calendar days (`YYYY-MM-DD`, inclusive) the report covers, plus the ISO bounds sent to the service. */
export type ReportRange = { fromDay: string; toDay: string; fromIso: string; toIso: string; invalid: boolean };

/** The report may later carry a per-tool breakdown (requested from CRM-CORE); rendered when present. */
type ReportWithTools = FunnelReport & { byTool?: FunnelCount[] };

function percent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(htmlLang[locale], { style: "percent", maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0);
}

function count(value: number, locale: Locale): string {
  return new Intl.NumberFormat(htmlLang[locale]).format(value);
}

function dayLabel(day: string, locale: Locale): string {
  return formatDate(istDayStart(day), locale) ?? day;
}

/** Single-series bar (one hue; the value is printed beside it, so colour never carries meaning alone). */
function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <span aria-hidden="true" className="block h-3 w-full min-w-16 rounded-r bg-[#f3eeff]">
      <span className="block h-3 rounded-r bg-[#7c5cd6]" style={{ width: `${width}%` }} />
    </span>
  );
}

const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[#354b66]";
const td = "px-3 py-2 align-middle";

function TableFrame({ labelledBy, children }: { labelledBy: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-labelledby={labelledBy} tabIndex={0} className="relative overflow-x-auto rounded-control border border-line">
      {children}
    </div>
  );
}

/** Group → leads (with bar) / contacted / enrolled / enrolled %. */
function GroupTable({
  id,
  rows,
  label,
  locale,
  t,
}: {
  id: string;
  rows: FunnelCount[];
  label: (row: FunnelCount) => string;
  locale: Locale;
  t: CrmMessages;
}) {
  const c = t.reports.columns;
  if (rows.length === 0) return <p className="text-sm text-muted">{t.reports.empty}</p>;
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const max = Math.max(...sorted.map((row) => row.total), 0);
  return (
    <TableFrame labelledBy={id}>
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead className="bg-[#f4f7fb]">
          <tr>
            <th scope="col" className={th}>
              {c.group}
            </th>
            <th scope="col" className={cn(th, "w-2/5")}>
              {c.leads}
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              {c.contacted}
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              {c.enrolled}
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              {c.conversion}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((row) => (
            <tr key={row.key}>
              <th scope="row" className={cn(td, "text-left font-semibold text-ink")}>
                {label(row)}
              </th>
              <td className={td}>
                <span className="flex items-center gap-2">
                  <Bar value={row.total} max={max} />
                  <span className="w-10 shrink-0 text-right font-bold tabular-nums">{count(row.total, locale)}</span>
                </span>
              </td>
              <td className={cn(td, "text-right tabular-nums")}>{count(row.contacted, locale)}</td>
              <td className={cn(td, "text-right tabular-nums")}>{count(row.enrolled, locale)}</td>
              <td className={cn(td, "text-right tabular-nums")}>{percent(row.total ? row.enrolled / row.total : 0, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

/** Label → count (with bar) / share of `total`. */
function CountTable({
  id,
  rows,
  total,
  headLabel,
  locale,
  t,
}: {
  id: string;
  rows: { key: string; label: string; count: number }[];
  total: number;
  headLabel: string;
  locale: Locale;
  t: CrmMessages;
}) {
  const c = t.reports.columns;
  const max = Math.max(...rows.map((row) => row.count), 0);
  return (
    <TableFrame labelledBy={id}>
      <table className="w-full min-w-[26rem] border-collapse text-sm">
        <thead className="bg-[#f4f7fb]">
          <tr>
            <th scope="col" className={th}>
              {headLabel}
            </th>
            <th scope="col" className={cn(th, "w-1/2")}>
              {c.leads}
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              {c.share}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className={cn(td, "text-left font-semibold text-ink")}>
                {row.label}
              </th>
              <td className={td}>
                <span className="flex items-center gap-2">
                  <Bar value={row.count} max={max} />
                  <span className="w-10 shrink-0 text-right font-bold tabular-nums">{count(row.count, locale)}</span>
                </span>
              </td>
              <td className={cn(td, "text-right tabular-nums")}>{percent(total ? row.count / total : 0, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

/** Days shown in the per-day table (newest first); the totals row always covers the whole range. */
const GATE_DAYS_SHOWN = 92;

/**
 * Lead gate (WP9, plan §3 "daily count of gate leads"): free-tool contact forms per IST day, split
 * into new families and families already on file, with a totals row.
 */
export function GateDailyTable({ days, locale, t }: { days: GateDayCount[]; locale: Locale; t: CrmMessages }) {
  const r = t.reports;
  const c = r.gateColumns;
  if (days.length === 0) return <p className="text-sm text-muted">{r.gateEmpty}</p>;
  const totals = days.reduce((sum, day) => ({ newFamilies: sum.newFamilies + day.newFamilies, knownFamilies: sum.knownFamilies + day.knownFamilies }), {
    newFamilies: 0,
    knownFamilies: 0,
  });
  const shown = days.slice(0, GATE_DAYS_SHOWN);
  const max = Math.max(...shown.map((day) => day.newFamilies + day.knownFamilies), 0);
  return (
    <>
      {days.length > shown.length && (
        <p className="mb-3 text-sm text-muted">{format(r.gateTruncated, { shown: count(shown.length, locale), all: count(days.length, locale) })}</p>
      )}
      <TableFrame labelledBy="crm-report-gate">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead className="bg-[#f4f7fb]">
            <tr>
              <th scope="col" className={th}>
                {c.day}
              </th>
              <th scope="col" className={cn(th, "w-2/5")}>
                {c.total}
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                {c.newFamilies}
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                {c.knownFamilies}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((day) => {
              const total = day.newFamilies + day.knownFamilies;
              return (
                <tr key={day.day}>
                  <th scope="row" className={cn(td, "text-left font-semibold text-ink")}>
                    <time dateTime={day.day}>{dayLabel(day.day, locale)}</time>
                  </th>
                  <td className={td}>
                    <span className="flex items-center gap-2">
                      <Bar value={total} max={max} />
                      <span className="w-10 shrink-0 text-right font-bold tabular-nums">{count(total, locale)}</span>
                    </span>
                  </td>
                  <td className={cn(td, "text-right tabular-nums")}>{count(day.newFamilies, locale)}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{count(day.knownFamilies, locale)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-line bg-[#f8fafc]">
            <tr>
              <th scope="row" className={cn(td, "text-left font-extrabold text-navy")}>
                {r.gateTotal}
              </th>
              <td className={cn(td, "font-extrabold tabular-nums")}>{count(totals.newFamilies + totals.knownFamilies, locale)}</td>
              <td className={cn(td, "text-right font-extrabold tabular-nums")}>{count(totals.newFamilies, locale)}</td>
              <td className={cn(td, "text-right font-extrabold tabular-nums")}>{count(totals.knownFamilies, locale)}</td>
            </tr>
          </tfoot>
        </table>
      </TableFrame>
    </>
  );
}

export function ReportRangeForm({
  range,
  presets,
  locale,
  t,
}: {
  range: ReportRange;
  presets: { key: "last7" | "last30" | "last90"; fromDay: string; toDay: string }[];
  locale: Locale;
  t: CrmMessages;
}) {
  const r = t.reports;
  const action = localePath("/crm/reports", locale);
  return (
    <section aria-labelledby="crm-report-range" className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
      <h2 id="crm-report-range" className="mb-3 text-base font-extrabold text-navy">
        {r.rangeTitle}
      </h2>
      {range.invalid && (
        <p role="alert" className="mb-3 text-sm font-semibold text-danger">
          {r.rangeInvalid}
        </p>
      )}
      <Form action={action} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="crm-report-from" className="text-sm font-bold text-navy">
            {r.from}
          </label>
          <input
            id="crm-report-from"
            name="from"
            type="date"
            defaultValue={range.fromDay}
            className="min-h-11 rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="crm-report-to" className="text-sm font-bold text-navy">
            {r.to}
          </label>
          <input
            id="crm-report-to"
            name="to"
            type="date"
            defaultValue={range.toDay}
            className="min-h-11 rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px]"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-navy px-4 text-sm font-bold text-white hover:bg-navy-2"
        >
          {r.apply}
        </button>
      </Form>
      <nav aria-label={r.presetsLabel} className="mt-3">
        <ul className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const current = preset.fromDay === range.fromDay && preset.toDay === range.toDay;
            return (
              <li key={preset.key}>
                <Link
                  href={`${action}?from=${preset.fromDay}&to=${preset.toDay}`}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold",
                    current ? "border-[#7c5cd6] bg-[#f3eeff] text-[#5b3cc4]" : "border-line bg-white text-navy hover:border-blue",
                  )}
                >
                  {r.presets[preset.key]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </section>
  );
}

/**
 * Lead reports for a date range (CRM-CORE `FunnelReport`, already scoped to the viewer): summary
 * tiles, the funnel (reached stage), current stage, and breakdowns by source / tool / program /
 * centre / counsellor, each as a real table with inline bars. CSV export for managers / admins.
 */
export function ReportsView({
  report,
  range,
  permissions,
  centres,
  activity,
  locale,
  t,
}: {
  report: FunnelReport;
  range: ReportRange;
  permissions: CrmPermissions;
  centres: Readonly<Record<string, string>>;
  /** Admin console 1b (1B-NUMBERS): the "Counsellor activity" section, shown before the export. */
  activity?: React.ReactNode;
  locale: Locale;
  t: CrmMessages;
}) {
  const r = t.reports;
  const withTools = report as ReportWithTools;
  const total = report.total;
  const contacted = report.reached.contacted ?? 0;
  const tiles = [
    { label: r.tiles.total, value: count(total, locale), note: format(r.period, { from: dayLabel(range.fromDay, locale), to: dayLabel(range.toDay, locale) }) },
    { label: r.tiles.contacted, value: count(contacted, locale), note: format(r.rateNote, { rate: percent(report.conversion.contactedRate, locale) }) },
    { label: r.tiles.enrolled, value: count(report.byStage.enrolled ?? 0, locale), note: format(r.rateNote, { rate: percent(report.conversion.enrolledRate, locale) }) },
    { label: r.tiles.lost, value: count(report.byStage.lost ?? 0, locale), note: format(r.rateNote, { rate: percent(total ? (report.byStage.lost ?? 0) / total : 0, locale) }) },
  ];

  const funnelRows = FUNNEL_STAGES.map((stage) => ({ key: stage, label: stageLabel(t, stage), count: report.reached[stage] ?? 0 }));
  const stageRows = LEAD_STAGES.map((stage) => ({ key: stage, label: stageLabel(t, stage), count: report.byStage[stage] ?? 0 }));
  const lostRows = report.lostReasons.map((row) => ({ key: row.key, label: lostReasonLabel(t, row.key) ?? row.key, count: row.count }));

  return (
    <div className="space-y-5">
      <section>
        <h2 className="sr-only">{r.tilesLabel}</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className={cn("rounded-control border border-t-4 border-line bg-white p-4 shadow-soft", portalAreas.staff.tileAccent)}>
              <dt className="text-xs font-semibold text-muted">{tile.label}</dt>
              <dd className="mt-1 text-[27px] font-extrabold leading-tight text-navy">{tile.value}</dd>
              <dd className="text-xs text-muted">{tile.note}</dd>
            </div>
          ))}
        </dl>
      </section>

      {total === 0 ? (
        <EmptyState title={r.empty} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <PortalPanel id="crm-report-funnel" title={r.funnelTitle} description={r.funnelDescription}>
              <CountTable id="crm-report-funnel" rows={funnelRows} total={total} headLabel={r.columns.stage} locale={locale} t={t} />
            </PortalPanel>
            <PortalPanel id="crm-report-stage" title={r.stageTitle} description={r.stageDescription}>
              <CountTable id="crm-report-stage" rows={stageRows} total={total} headLabel={r.columns.stage} locale={locale} t={t} />
            </PortalPanel>
          </div>
          <PortalPanel id="crm-report-source" title={r.sourceTitle}>
            <GroupTable id="crm-report-source" rows={report.bySource} label={(row) => row.label ?? sourceLabel(t, row.key)} locale={locale} t={t} />
          </PortalPanel>
          {withTools.byTool && (
            <PortalPanel id="crm-report-tool" title={r.toolTitle}>
              <GroupTable id="crm-report-tool" rows={withTools.byTool} label={(row) => toolLabel(t, row.key) ?? row.key} locale={locale} t={t} />
            </PortalPanel>
          )}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <PortalPanel id="crm-report-centre" title={r.centreTitle}>
              <GroupTable
                id="crm-report-centre"
                rows={report.byCentre}
                label={(row) => (row.key && row.key !== "none" ? centreLabel(t, centres, row.key) ?? row.key : r.noCentre)}
                locale={locale}
                t={t}
              />
            </PortalPanel>
            <PortalPanel id="crm-report-program" title={r.programTitle}>
              <GroupTable
                id="crm-report-program"
                rows={report.byProgram}
                label={(row) => (row.key && row.key !== "none" ? programLabel(t, row.key) ?? row.key : r.noProgram)}
                locale={locale}
                t={t}
              />
            </PortalPanel>
          </div>
          <PortalPanel id="crm-report-counsellor" title={r.counsellorTitle}>
            <GroupTable
              id="crm-report-counsellor"
              rows={report.byCounsellor}
              label={(row) => {
                const member = row as FunnelReport["byCounsellor"][number];
                return member.userId ? member.displayName ?? member.label ?? member.userId : r.unassigned;
              }}
              locale={locale}
              t={t}
            />
          </PortalPanel>
          {lostRows.length > 0 && (
            <PortalPanel id="crm-report-lost" title={r.lostTitle}>
              <CountTable id="crm-report-lost" rows={lostRows} total={report.byStage.lost ?? 0} headLabel={r.columns.reason} locale={locale} t={t} />
            </PortalPanel>
          )}
        </>
      )}

      {report.gateDaily && (
        <PortalPanel id="crm-report-gate" title={r.gateTitle} description={r.gateDescription}>
          <GateDailyTable days={report.gateDaily} locale={locale} t={t} />
        </PortalPanel>
      )}

      {activity}

      <PortalPanel id="crm-report-export" title={r.exportTitle}>
        {permissions.canExport ? (
          <>
            <p className="text-sm text-muted">{r.exportBody}</p>
            <a
              href={exportHref({ from: range.fromIso, to: range.toIso })}
              download
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-control bg-navy px-4 text-sm font-bold text-white hover:bg-navy-2"
            >
              <Download aria-hidden="true" className="size-4" />
              {r.exportButton}
            </a>
          </>
        ) : (
          <p className="text-sm text-muted">{r.exportNotAllowed}</p>
        )}
      </PortalPanel>
    </div>
  );
}
