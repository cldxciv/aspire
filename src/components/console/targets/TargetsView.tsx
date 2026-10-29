import type { CrmMessages } from "@/components/crm/format";
import { formatDateTime } from "@/components/crm/format";
import { ReadOnlyNotice } from "@/components/crm/settings/ReadOnlyNotice";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { CONSOLE_PROGRAMS, TARGET_METRICS, type SessionRef, type TargetGrid, type TargetMetric } from "@/lib/crm/console/types";
import { ConsoleTable, type ConsoleColumn } from "../shared/ConsoleTable";
import { consoleCommon, formatCount } from "../shared/messages";
import { numbersMessages } from "../dashboard/labels";
import { cellKey, metricValues } from "./target-values";
import { TargetsEditor } from "./TargetsEditor";

type CentreOption = { slug: string; label: string };

/** A cell or total that is not set: a dash for the eye, "Not set" for screen readers. */
function Dash({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </>
  );
}

/**
 * Targets for one session (docs/admin-phase-1b-plan.md §5.B; owner: 1B-NUMBERS). Super admins
 * edit (one `TargetsEditor` per metric); CRM admins and area heads read plain numbers (area heads:
 * their centres) under lead routing's read-only notice. Admission targets first; enquiry and
 * counselling targets sit behind "Show optional targets". Nothing is invented: an empty box is
 * "not set". Server-safe.
 */
export function TargetsView({
  grid,
  session,
  centres,
  canEdit,
  managerScope,
  pagePath,
  locale,
  crm,
}: {
  grid: TargetGrid;
  session: SessionRef;
  /** Rows: the viewer's centres plus any centre that already has a cell. */
  centres: readonly CentreOption[];
  canEdit: boolean;
  managerScope: boolean;
  /** LOCALE-FREE path of the page. */
  pagePath: string;
  locale: Locale;
  crm: Pick<CrmMessages, "superAdmin" | "errors">;
}) {
  const t = numbersMessages(locale).targets;
  const common = consoleCommon(locale);
  const changed = grid.updatedAt ? formatDateTime(grid.updatedAt, locale) ?? grid.updatedAt : null;

  const block = (metric: TargetMetric) => {
    const values = metricValues(grid, metric);
    if (canEdit) {
      return (
        <TargetsEditor
          key={metric}
          period={grid.period}
          sessionLabel={session.label}
          metric={metric}
          centres={centres}
          values={values}
          updatedAt={grid.updatedAt}
          pagePath={pagePath}
          t={t}
          errors={crm}
        />
      );
    }
    const metricName = t.metrics[metric];
    const heading = <h3 className="text-base font-extrabold text-navy">{format(t.gridTitle, { metric: metricName, session: session.label })}</h3>;
    if (Object.keys(values).length === 0) {
      return (
        <div className="space-y-1">
          {heading}
          <p className="text-sm text-muted">{common.common.notSet}</p>
        </div>
      );
    }
    const columns: ConsoleColumn<CentreOption>[] = [
      { key: "centre", header: t.centre, cell: (centre) => centre.label },
      ...CONSOLE_PROGRAMS.map((program) => ({
        key: program,
        header: t.programs[program],
        numeric: true,
        cell: (centre: CentreOption) => {
          const value = values[cellKey(centre.slug, program)];
          return value === undefined ? <Dash label={common.common.notSet} /> : formatCount(value, locale);
        },
      })),
      {
        key: "total",
        header: t.total,
        numeric: true,
        cell: (centre) => {
          const set = CONSOLE_PROGRAMS.map((program) => values[cellKey(centre.slug, program)]).filter((value): value is number => value !== undefined);
          return set.length === 0 ? <Dash label={common.common.notSet} /> : <strong>{formatCount(set.reduce((a, b) => a + b, 0), locale)}</strong>;
        },
      },
    ];
    return (
      <div className="space-y-3">
        {heading}
        <ConsoleTable
          id={`targets-${metric}`}
          caption={format(t.gridCaption, { metric: metricName, session: session.label })}
          regionLabel={format(t.regionLabel, { metric: metricName })}
          columns={columns}
          rows={centres}
          rowKey={(centre) => centre.slug}
          minWidth="40rem"
        />
      </div>
    );
  };

  const [main, ...optional] = TARGET_METRICS;
  return (
    <div className="space-y-4">
      <ReadOnlyNotice canEdit={canEdit} t={crm} />
      {managerScope && <p className="text-sm text-muted">{t.managerNote}</p>}
      {grid.cells.length === 0 && (
        <p role="note" className="rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold text-navy">
          {format(t.empty, { session: session.label })} {canEdit ? t.emptyEdit : t.emptyRead}
        </p>
      )}
      <p className="text-xs text-muted">
        {changed ? (grid.updatedBy ? format(t.lastChanged, { when: changed, who: grid.updatedBy }) : format(t.lastChangedNoName, { when: changed })) : t.neverChanged}
      </p>
      {centres.length === 0 ? (
        <p className="text-sm text-muted">{t.noCentres}</p>
      ) : (
        <>
          <section className="rounded-card border border-line bg-white p-4 shadow-soft md:p-5">{block(main)}</section>
          <details className="rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-blue">{t.showOptional}</summary>
            <p className="mt-2 text-sm text-muted">{t.optionalNote}</p>
            <div className="mt-4 space-y-6">
              {optional.map((metric) => (
                <div key={metric}>{block(metric)}</div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
