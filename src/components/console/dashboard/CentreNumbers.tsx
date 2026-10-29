import { Target } from "lucide-react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { targetsHref } from "@/lib/crm/console/dashboard/links";
import type { CentreNumbers as CentreRow, ConsoleNumbers } from "@/lib/crm/console/types";
import { centreText } from "../shared/CentreLabel";
import { ConsoleTable, type ConsoleColumn } from "../shared/ConsoleTable";
import { DemoNote } from "../shared/DemoNote";
import { consoleCommon, formatCount, xOfYText } from "../shared/messages";
import { channelLabel, istTime, numbersMessages } from "./labels";

export type NumbersVariant = "admin" | "crm";

const linkClass = "inline-flex min-h-11 items-center justify-end font-bold text-blue tabular-nums underline-offset-2 hover:underline";
const subClass = "block text-xs font-normal leading-snug text-muted";
/** A small linked line under a number: 44 px tall (plan §5 common UI rules), right-aligned like the number. */
const subLinkClass = "flex min-h-11 items-center justify-end text-xs font-semibold text-blue underline-offset-2 hover:underline";

/**
 * Five numbers by centre (docs/admin-phase-1b-plan.md §5.A, §6.1; owner: 1B-NUMBERS). Server- and
 * client-safe (no hooks). `variant="admin"` (`/admin`) shows enquiries today and this week;
 * `variant="crm"` (top of `/crm/dashboard`) this week only, since lead routing's dashboard already
 * shows today's arrivals. Every number links to the list it counts (the list shows the same number);
 * sub-lines the list cannot show (free-tool sign-ups, imports, erased) are plain text that says what
 * it is. A table with a Total row on tablets and desktops, one card per centre on phones.
 *
 * `data: null` is the data-free preview: "—" and "Preview · no live data", no database read.
 */
export function CentreNumbers({
  data,
  variant,
  canEditTargets,
  locale,
}: {
  data: ConsoleNumbers | null;
  variant: NumbersVariant;
  /** Super admins get "Set targets" where no target is set. */
  canEditTargets: boolean;
  locale: Locale;
}) {
  const m = numbersMessages(locale);
  const n = m.numbers;
  const common = consoleCommon(locale);
  const titleId = `console-numbers-${variant}`;

  if (!data) {
    const labels = [...(variant === "admin" ? [n.columns.today] : []), n.columns.week, n.columns.notCalled, n.columns.overdue, n.columns.admissions, n.columns.topSources];
    return (
      <section aria-labelledby={titleId} className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={titleId} className="text-lg font-extrabold text-navy">
            {n.previewTitle}
          </h2>
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted">{common.common.preview}</span>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {labels.map((label) => (
            <div key={label} className="rounded-control border border-line p-3">
              <dt className="text-xs font-semibold text-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-extrabold text-navy">{common.common.previewValue}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  const session = data.session.label;
  const isTotal = (row: CentreRow) => row === data.total;
  const where = (row: CentreRow) => (isTotal(row) ? n.allCentres : centreText(row.centre, common));
  /** A linked number; `shown` replaces the plain count ("23 of 60 (38 %)"), in the name too (WCAG 2.5.3). */
  const numberLink = (row: CentreRow, value: number, href: string, what: string, shown?: string) => {
    const text = shown ?? formatCount(value, locale);
    return (
      <Link href={localePath(href, locale)} aria-label={format(n.linkLabel, { count: text, what, centre: where(row) })} className={linkClass}>
        {text}
      </Link>
    );
  };

  const columns: ConsoleColumn<CentreRow>[] = [
    {
      key: "centre",
      header: n.columns.centre,
      cell: (row) => (isTotal(row) ? common.common.total : <span className={cn(row.centre.slug === null && "text-muted")}>{centreText(row.centre, common)}</span>),
    },
    ...(variant === "admin"
      ? [{ key: "today", header: n.columns.today, numeric: true, cell: (row: CentreRow) => numberLink(row, row.enquiriesToday, row.links.today, n.columns.today) }]
      : []),
    {
      key: "week",
      header: n.columns.week,
      numeric: true,
      cell: (row) => {
        const parts = [
          ...(row.toolSignupsWeek > 0 ? [format(n.signups, { n: formatCount(row.toolSignupsWeek, locale) })] : []),
          ...(row.importedWeek > 0 ? [format(n.imported, { n: formatCount(row.importedWeek, locale) })] : []),
        ];
        return (
          <>
            {numberLink(row, row.enquiriesWeek, row.links.week, n.columns.week)}
            {parts.length > 0 && <span className={subClass}>{parts.join(" · ")}</span>}
            {row.erasedWeek > 0 && (
              <span className={subClass} title={n.erasedNote}>
                {format(n.erasedSince, { n: formatCount(row.erasedWeek, locale) })}
              </span>
            )}
          </>
        );
      },
    },
    {
      key: "notCalled",
      header: n.columns.notCalled,
      numeric: true,
      cell: (row) => (
        <>
          {numberLink(row, row.notCalled, row.links.notCalled, n.columns.notCalled)}
          {row.notCalledOver24h > 0 && (
            <Link href={localePath(row.links.notCalledOver24h, locale)} className={subLinkClass}>
              {format(n.waiting24, { n: formatCount(row.notCalledOver24h, locale) })}
              <span className="sr-only">, {where(row)}</span>
            </Link>
          )}
        </>
      ),
    },
    {
      key: "overdue",
      header: n.columns.overdue,
      numeric: true,
      cell: (row) => numberLink(row, row.overdue, row.links.overdue, n.columns.overdue),
    },
    {
      key: "admissions",
      header: n.columns.admissions,
      numeric: true,
      cell: (row) =>
        row.sessionTarget !== null ? (
          numberLink(row, row.admissionsSession, row.links.admissions, n.columns.admissions, xOfYText(row.admissionsSession, row.sessionTarget, locale, common))
        ) : (
          <>
            {numberLink(row, row.admissionsSession, row.links.admissions, n.columns.admissions)}
            <span className={subClass}>{common.common.noTarget}</span>
            {canEditTargets && row.centre.slug !== null && !isTotal(row) && (
              <Link href={localePath(targetsHref(data.session.key), locale)} className={cn(subLinkClass, "gap-1")}>
                <Target aria-hidden="true" className="size-3.5" />
                {n.setTargets}
                <span className="sr-only">: {where(row)}</span>
              </Link>
            )}
          </>
        ),
    },
    {
      key: "topSources",
      header: n.columns.topSources,
      cell: (row) =>
        row.topSources.length === 0 ? (
          <span className="text-xs text-muted">{n.tooFew}</span>
        ) : (
          <ul className="flex flex-wrap justify-end gap-x-1.5 md:justify-start">
            {row.topSources.map((source) => (
              <li key={source.channel}>
                {/* A 44 px link around a 32 px chip. */}
                <Link href={localePath(row.links.sources, locale)} className="group inline-flex min-h-11 items-center rounded-full">
                  <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-xs font-semibold text-navy group-hover:border-blue">
                    {channelLabel(source.channel, locale)}
                    <span className="tabular-nums text-muted">{formatCount(source.count, locale)}</span>
                    <span className="sr-only">, {where(row)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ),
    },
  ];

  return (
    <section aria-labelledby={titleId} className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={titleId} className="text-lg font-extrabold text-navy">
          {n.title}
        </h2>
        <p className="text-sm font-semibold text-muted">{format(n.asOf, { session, time: istTime(data.generatedAt, locale) })}</p>
      </div>
      <p className="mt-1 text-sm text-muted">{variant === "admin" ? n.leadAdmin : n.leadCrm}</p>
      <DemoNote demo={data.centreListIsDemo} locale={locale} t={common} className="mt-3" />
      <ConsoleTable
        id={`console-numbers-table-${variant}`}
        caption={format(n.caption, { session })}
        regionLabel={n.regionLabel}
        columns={columns}
        rows={data.rows}
        rowKey={(row) => row.centre.slug ?? "none"}
        total={data.rows.length > 0 ? data.total : null}
        minWidth={variant === "admin" ? "58rem" : "50rem"}
        empty={<p className="text-sm text-muted">{n.noCentres}</p>}
        className="mt-4"
      />
    </section>
  );
}

/** While the live numbers load (a request-time read): a status line and a quiet placeholder, no "—". */
export function NumbersLoading({ locale }: { locale: Locale }) {
  const n = numbersMessages(locale).numbers;
  return (
    <div className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
      <p role="status" className="text-sm font-semibold text-muted">
        {n.loading}
      </p>
      <div aria-hidden="true" className="mt-4 space-y-3">
        <div className="h-6 w-2/3 rounded-md bg-surface" />
        <div className="h-4 w-full rounded-md bg-surface" />
        <div className="h-4 w-5/6 rounded-md bg-surface" />
      </div>
    </div>
  );
}
