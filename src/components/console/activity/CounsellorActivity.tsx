import { Gauge } from "lucide-react";
import Link from "next/link";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import { htmlLang, type Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { ActivityRow, CounsellorActivityReport } from "@/lib/crm/console/activity/activity";
import { istDate, numbersMessages } from "../dashboard/labels";
import { ConsoleTable, type ConsoleColumn } from "../shared/ConsoleTable";
import { consoleCommon, formatCount, xOfYText } from "../shared/messages";

/**
 * Counsellor activity, a section of Reports (docs/admin-phase-1b-plan.md §5.G, §6.4; owner:
 * 1B-NUMBERS). Area heads and admins: one row per staff member in scope; counsellors: only their
 * own row, headed "Your numbers". Connected calls read "x of y"; a blank cell means "no active
 * day". "First-call speed" lives on lead routing's dashboard (linked for those who can open it).
 * Server-safe. `range` is the report's IST days (inclusive), for the heading.
 */
export function CounsellorActivity({
  report,
  range,
  canViewDashboard,
  locale,
}: {
  report: CounsellorActivityReport;
  range: { fromIso: string; toIso: string };
  canViewDashboard: boolean;
  locale: Locale;
}) {
  const m = numbersMessages(locale).activity;
  const common = consoleCommon(locale);
  const from = istDate(range.fromIso, locale);
  // `toIso` is exclusive (the start of the day after the last day).
  const to = istDate(new Date(Date.parse(range.toIso) - 1).toISOString(), locale);
  const count = (value: number) => formatCount(value, locale);
  const columns: ConsoleColumn<ActivityRow>[] = [
    { key: "person", header: m.columns.person, cell: (row) => (row.self && !report.own ? `${row.name ?? m.unknownName} (${m.you})` : (row.name ?? m.unknownName)) },
    { key: "calls", header: m.columns.calls, numeric: true, cell: (row) => count(row.calls) },
    { key: "connected", header: m.columns.connected, numeric: true, cell: (row) => xOfYText(row.connected, row.calls, locale, common) },
    { key: "whatsapps", header: m.columns.whatsapps, numeric: true, cell: (row) => count(row.whatsapps) },
    { key: "followUps", header: m.columns.followUps, numeric: true, cell: (row) => count(row.followUps) },
    { key: "activeDays", header: m.columns.activeDays, numeric: true, cell: (row) => count(row.activeDays) },
    {
      key: "perDay",
      header: m.columns.perDay,
      numeric: true,
      cell: (row) =>
        row.callsPerActiveDay === null ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">{common.common.notSet}</span>
          </>
        ) : (
          new Intl.NumberFormat(htmlLang[locale], { maximumFractionDigits: 1, numberingSystem: "latn" }).format(row.callsPerActiveDay)
        ),
    },
    { key: "open", header: m.columns.open, numeric: true, cell: (row) => count(row.openLeads) },
    { key: "admissions", header: m.columns.admissions, numeric: true, cell: (row) => count(row.admissions) },
  ];
  const nothing = report.rows.every((row) => row.calls + row.whatsapps + row.followUps === 0);

  return (
    <PortalPanel
      id="crm-report-activity"
      title={report.own ? m.titleOwn : m.title}
      description={format(m.lead, { from, to })}
      action={
        canViewDashboard ? (
          <Link href={localePath("/crm/dashboard", locale)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-blue hover:underline">
            <Gauge aria-hidden="true" className="size-4" />
            {m.speedLink}
          </Link>
        ) : undefined
      }
    >
      {nothing && <p className="mb-3 text-sm text-muted">{m.empty}</p>}
      <ConsoleTable
        id="crm-report-activity-table"
        caption={format(m.caption, { from, to })}
        regionLabel={m.regionLabel}
        columns={columns}
        rows={report.rows}
        rowKey={(row) => row.userId}
        minWidth="56rem"
      />
      <ul className="mt-3 space-y-1 text-xs text-muted">
        <li>{m.whatsappNote}</li>
        {report.scoped && <li>{m.scopeNote}</li>}
        {report.mcpIncluded && <li>{m.mcpFootnote}</li>}
      </ul>
    </PortalPanel>
  );
}
