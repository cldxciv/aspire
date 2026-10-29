import Form from "next/form";
import Link from "next/link";
import { OutcomeStatusRegion } from "@/components/console/calls/outcome-status";
import { familyMessages } from "@/components/console/details/messages";
import { ConsoleTable, type ConsoleColumn } from "@/components/console/shared/ConsoleTable";
import { formatCount } from "@/components/console/shared/messages";
import { formatDate, istDayKey, lostReasonLabel, outcomeLabel, withBack, type CrmMessages } from "@/components/crm/format";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import { EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { LOST_REVIEW_DAYS, LOST_REVIEW_MAX, type LostReasonRow, type LostReviewItem, type LostReviewReport } from "@/lib/crm/console/lost/types";
import { LostReviewActions } from "./LostReviewActions";

type Option = { value: string; label: string };

const selectClasses = "min-h-11 w-full rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px] text-ink";

/** The list's own path + query (`/crm/lost?days=30&assignee=…`): the back link of each family and the refresh target. */
export function lostListPath(report: Pick<LostReviewReport, "days" | "assignee">): string {
  const params = new URLSearchParams();
  if (report.days !== 14) params.set("days", String(report.days));
  if (report.assignee) params.set("assignee", report.assignee);
  const query = params.toString();
  return query ? `/crm/lost?${query}` : "/crm/lost";
}

/**
 * "Lost enquiries to review" (docs/admin-phase-1b-plan.md §5.H, §6.5; owner: 1B-FAMILY): the window
 * and counsellor filters (a GET form: the URL is the filter), the events waiting for review with
 * Keep lost / Reopen…, and the lost reasons by counsellor. Pure: data in, markup out (server).
 */
export function LostReviewView({
  report,
  staff,
  reopenStaff,
  now,
  locale,
  t,
}: {
  report: LostReviewReport;
  /** Staff for the counsellor filter (area heads: the people in their scope). */
  staff: Option[];
  /**
   * Per enquiry (lead id): who Reopen's "Assign to" offers, i.e. who lead routing lets this viewer
   * hand it to (`lostReviewStaff`). Without it, every `staff` option is offered.
   */
  reopenStaff?: Readonly<Record<string, Option[]>>;
  now: number;
  locale: Locale;
  t: CrmMessages;
}) {
  const f = familyMessages(locale).lost;
  const path = lostListPath(report);
  const listHeadingId = "crm-lost-list";
  const columns: ConsoleColumn<LostReviewItem>[] = [
    {
      key: "family",
      header: f.columns.family,
      cell: (item) => (
        <Link href={withBack(localePath(`/crm/leads/${encodeURIComponent(item.leadId)}`, locale), path)} className="text-blue hover:underline">
          {item.name?.trim() || t.common.unnamed}
        </Link>
      ),
    },
    { key: "lostOn", header: f.columns.lostOn, cell: (item) => <time dateTime={item.lostAt}>{formatDate(item.lostAt, locale)}</time> },
    { key: "reason", header: f.columns.reason, cell: (item) => lostReasonLabel(t, item.reason) ?? t.lostReasons.unspecified },
    { key: "markedBy", header: f.columns.markedBy, cell: (item) => item.markedBy?.name ?? f.system },
    { key: "calls", header: f.columns.calls, numeric: true, cell: (item) => (item.callsMade > 0 ? formatCount(item.callsMade, locale) : f.noCalls) },
    { key: "lastOutcome", header: f.columns.lastOutcome, cell: (item) => outcomeLabel(t, item.lastOutcome) ?? <span className="text-muted">{f.noOutcome}</span> },
    {
      key: "age",
      header: f.columns.age,
      numeric: true,
      cell: (item) => (item.daysSinceEnquiry === 0 ? f.ageToday : item.daysSinceEnquiry === 1 ? f.ageOne : format(f.ageDays, { n: formatCount(item.daysSinceEnquiry, locale) })),
    },
    {
      key: "actions",
      header: f.columns.actions,
      cell: (item) => (
        <LostReviewActions
          leadId={item.leadId}
          lostAt={item.lostAt}
          name={item.name?.trim() || t.common.unnamed}
          fromStage={item.fromStage}
          assignee={item.assignee}
          staff={reopenStaff ? (reopenStaff[item.leadId] ?? []) : staff}
          f={f}
          t={{ errors: t.errors, common: t.common, stages: t.stages }}
          pagePath={path}
          today={istDayKey(now)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <section aria-labelledby="crm-lost-filters" className="rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
        <h2 id="crm-lost-filters" className="mb-3 text-base font-extrabold text-navy">
          {f.filtersTitle}
        </h2>
        <Form action={localePath("/crm/lost", locale)} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="crm-lost-days" className="text-sm font-bold text-navy">
              {f.days}
            </label>
            <select id="crm-lost-days" name="days" defaultValue={String(report.days)} className={selectClasses}>
              {LOST_REVIEW_DAYS.map((days) => (
                <option key={days} value={days}>
                  {format(f.daysOption, { n: days })}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="crm-lost-assignee" className="text-sm font-bold text-navy">
              {f.assignee}
            </label>
            <select id="crm-lost-assignee" name="assignee" defaultValue={report.assignee ?? ""} className={selectClasses}>
              <option value="">{f.everyone}</option>
              <option value="unassigned">{t.common.unassigned}</option>
              {staff.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-control bg-navy px-4 text-sm font-bold text-white hover:bg-navy-2">
            {f.apply}
          </button>
        </Form>
      </section>

      <PortalPanel
        id={listHeadingId}
        title={f.listTitle}
        description={report.items.length === 1 ? f.countOne : format(f.count, { count: formatCount(report.items.length, locale) })}
      >
        <OutcomeStatusRegion focusTargetId={listHeadingId}>
          {report.truncated && <p className="mb-3 text-sm text-muted">{format(f.truncated, { max: LOST_REVIEW_MAX })}</p>}
          <ConsoleTable
            id="crm-lost-table"
            caption={f.caption}
            regionLabel={f.region}
            columns={columns}
            rows={report.items}
            rowKey={(item) => `${item.leadId}-${item.lostAt}`}
            minWidth="64rem"
            empty={<EmptyState title={format(f.empty, { days: report.days })} description={f.emptyHint} />}
          />
        </OutcomeStatusRegion>
      </PortalPanel>

      <LostReasonsMatrix report={report} locale={locale} t={t} />
    </div>
  );
}

/** "Lost reasons by counsellor": reason × who marked it lost, every lost event in the window. */
export function LostReasonsMatrix({ report, locale, t }: { report: LostReviewReport; locale: Locale; t: CrmMessages }) {
  const m = familyMessages(locale).lost.matrix;
  const system = familyMessages(locale).lost.system;
  const { reasons, rows, total } = report.matrix;
  const count = (value: number | undefined) => formatCount(value ?? 0, locale);
  const columns: ConsoleColumn<LostReasonRow>[] = [
    { key: "person", header: m.person, cell: (row) => (row.userId === "__total" ? m.total : (row.name ?? system)) },
    ...reasons.map((reason) => ({
      key: reason,
      header: lostReasonLabel(t, reason) ?? t.lostReasons.unspecified,
      numeric: true,
      cell: (row: LostReasonRow) => count(row.counts[reason]),
    })),
    { key: "total", header: m.total, numeric: true, cell: (row) => count(row.total) },
  ];
  const totals: LostReasonRow = {
    userId: "__total",
    name: m.total,
    counts: Object.fromEntries(reasons.map((reason) => [reason, rows.reduce((sum, row) => sum + (row.counts[reason] ?? 0), 0)])),
    total,
  };
  return (
    <PortalPanel id="crm-lost-matrix" title={m.title} description={m.intro}>
      <ConsoleTable
        id="crm-lost-matrix-table"
        caption={m.caption}
        regionLabel={m.region}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.userId ?? "system"}
        total={rows.length > 0 ? totals : null}
        minWidth={`${Math.max(28, 12 + reasons.length * 9)}rem`}
        empty={<EmptyState title={m.empty} />}
      />
    </PortalPanel>
  );
}
