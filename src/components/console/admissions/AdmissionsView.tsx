import { ChevronLeft, ChevronRight } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { classLabel, withBack, type CrmMessages } from "@/components/crm/format";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { AdmissionItem, AdmissionsReport, AdmissionsSummaryRow } from "@/lib/crm/console/admissions/admissions";
import { ADMISSIONS_PATH, admissionsHref } from "@/lib/crm/console/dashboard/links";
import { CONSOLE_PROGRAMS, type CentreRef } from "@/lib/crm/console/types";
import { channelLabel, istDate, numbersMessages } from "../dashboard/labels";
import { ConsoleTable, type ConsoleColumn } from "../shared/ConsoleTable";
import { consoleCommon, formatCount, xOfYText } from "../shared/messages";

/**
 * Admissions done (docs/admin-phase-1b-plan.md §5.B, §6.3; owner: 1B-NUMBERS): the centre filter,
 * the centre × programme summary with each total beside its session target (when set and shown to
 * the viewer), and the admitted families 50 per page. Names link to the lead with a "Back to
 * Admissions done" link; erased enquiries are counted without a name or link. Server-safe.
 */
export function AdmissionsView({
  report,
  centres,
  scopeNote,
  locale,
  crm,
}: {
  report: AdmissionsReport;
  /** Centre filter options (the viewer's centres) and labels. */
  centres: readonly CentreRef[];
  scopeNote: "own" | "manager" | null;
  locale: Locale;
  crm: CrmMessages;
}) {
  const m = numbersMessages(locale).admissions;
  const t = numbersMessages(locale).targets;
  const common = consoleCommon(locale);
  const session = report.session;
  const labels = new Map(centres.flatMap((centre) => (centre.slug === null ? [] : [[centre.slug, centre.label] as const])));
  const centreName = (slug: string | null) => (slug === null ? common.common.noCentre : (labels.get(slug) ?? slug));
  const back = admissionsHref(session.key, report.centre, report.page);

  const summaryTotal: AdmissionsSummaryRow = { centre: null, counts: report.summary.totals, total: report.summary.total, target: report.summary.target };

  const summaryColumns: ConsoleColumn<AdmissionsSummaryRow>[] = [
    { key: "centre", header: m.columns.centre, cell: (row) => (row === summaryTotal ? common.common.total : <span className={cn(row.centre === null && "text-muted")}>{centreName(row.centre)}</span>) },
    ...CONSOLE_PROGRAMS.map((program) => ({
      key: program,
      header: t.programs[program],
      numeric: true,
      cell: (row: AdmissionsSummaryRow) => formatCount(row.counts[program], locale),
    })),
    { key: "total", header: t.total, numeric: true, cell: (row) => <strong>{formatCount(row.total, locale)}</strong> },
    ...(report.showTargets
      ? [
          {
            key: "target",
            header: m.target,
            numeric: true,
            cell: (row: AdmissionsSummaryRow) =>
              row.target === null ? <span className="text-muted">{common.common.noTarget}</span> : xOfYText(row.total, row.target, locale, common),
          },
        ]
      : []),
  ];

  const listColumns: ConsoleColumn<AdmissionItem>[] = [
    {
      key: "name",
      header: m.columns.name,
      cell: (item) =>
        item.erased ? (
          <span className="text-muted">{m.erased}</span>
        ) : (
          <Link href={withBack(localePath(`/crm/leads/${encodeURIComponent(item.leadId)}`, locale), back)} className="font-bold text-blue underline-offset-2 hover:underline">
            {item.name?.trim() || m.unnamed}
          </Link>
        ),
    },
    { key: "centre", header: m.columns.centre, cell: (item) => centreName(item.centreSlug) },
    { key: "programme", header: m.columns.programme, cell: (item) => t.programs[item.program] },
    { key: "class", header: m.columns.class, cell: (item) => classLabel(crm, item.currentClass) ?? <span className="text-muted">{common.common.notRecorded}</span> },
    { key: "counsellor", header: m.columns.counsellor, cell: (item) => item.assignee?.displayName || <span className="text-muted">{m.unassigned}</span> },
    { key: "admittedOn", header: m.columns.admittedOn, cell: (item) => <time dateTime={item.admittedAt}>{istDate(item.admittedAt, locale)}</time> },
    { key: "channel", header: m.columns.channel, cell: (item) => channelLabel(item.channel, locale) },
  ];

  const hasSummary = report.summary.rows.length > 0;
  return (
    <div className="space-y-5">
      <section aria-labelledby="admissions-filters" className="rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
        <h2 id="admissions-filters" className="mb-3 text-base font-extrabold text-navy">
          {m.filtersTitle}
        </h2>
        <Form action={localePath(ADMISSIONS_PATH, locale)} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="session" value={session.key} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="admissions-centre" className="text-sm font-bold text-navy">
              {m.centre}
            </label>
            <select
              id="admissions-centre"
              name="centre"
              defaultValue={report.centre ?? ""}
              className="min-h-11 max-w-full rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px]"
            >
              <option value="">{m.allCentres}</option>
              {centres.map((centre) => (
                <option key={centre.slug ?? "none"} value={centre.slug ?? "none"}>
                  {centre.slug === null ? common.common.noCentre : centre.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-control bg-navy px-4 text-sm font-bold text-white hover:bg-navy-2">
            {m.apply}
          </button>
        </Form>
        {scopeNote && <p className="mt-3 text-sm text-muted">{scopeNote === "own" ? m.scopeOwn : m.scopeManager}</p>}
      </section>

      <p className="text-sm font-bold text-navy">
        {format(m.count, { count: formatCount(report.total, locale), session: session.label })}
      </p>

      {report.total === 0 && !hasSummary ? (
        <p className="rounded-card border border-line bg-white p-5 text-sm text-muted shadow-soft">{format(m.empty, { session: session.label })}</p>
      ) : (
        <>
          <section aria-labelledby="admissions-summary" className="rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
            <h2 id="admissions-summary" className="mb-3 text-base font-extrabold text-navy">
              {m.summaryTitle}
            </h2>
            <ConsoleTable
              id="admissions-summary-table"
              caption={format(m.summaryCaption, { session: session.label })}
              regionLabel={m.summaryRegion}
              columns={summaryColumns}
              rows={report.summary.rows}
              rowKey={(row) => row.centre ?? "none"}
              total={summaryTotal}
              minWidth="44rem"
            />
          </section>

          <section aria-labelledby="admissions-list" className="rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
            <h2 id="admissions-list" className="mb-3 text-base font-extrabold text-navy">
              {m.listTitle}
            </h2>
            {report.total === 0 ? (
              <p className="text-sm text-muted">{format(m.empty, { session: session.label })}</p>
            ) : (
              <>
                <ConsoleTable
                  id="admissions-list-table"
                  caption={format(m.listCaption, { session: session.label })}
                  regionLabel={m.listRegion}
                  columns={listColumns}
                  rows={report.items}
                  rowKey={(item) => item.leadId}
                  minWidth="52rem"
                />
                {report.items.some((item) => item.erased) && <p className="mt-3 text-xs text-muted">{m.erasedNote}</p>}
                {report.pages > 1 && (
                  <nav aria-label={m.pagination} className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    {report.page > 1 ? (
                      <Link href={localePath(admissionsHref(session.key, report.centre, report.page - 1), locale)} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-blue hover:underline">
                        <ChevronLeft aria-hidden="true" className="size-4" />
                        {m.previous}
                      </Link>
                    ) : (
                      <span />
                    )}
                    <p className="text-sm text-muted">{format(m.pageOf, { page: formatCount(report.page, locale), pages: formatCount(report.pages, locale) })}</p>
                    {report.page < report.pages ? (
                      <Link href={localePath(admissionsHref(session.key, report.centre, report.page + 1), locale)} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-blue hover:underline">
                        {m.next}
                        <ChevronRight aria-hidden="true" className="size-4" />
                      </Link>
                    ) : (
                      <span />
                    )}
                  </nav>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
