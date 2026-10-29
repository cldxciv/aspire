import Form from "next/form";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { SOURCE_RANGES, type SourceRange } from "@/lib/crm/console/sources/types";
import type { CentreRef } from "@/lib/crm/console/types";
import type { SourcesMessages } from "./labels";

const control = "min-h-11 rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px] text-ink";

/**
 * The one filter row above everything it scopes (dataviz: date range first): range preset or
 * custom IST dates, and the centre (effective centre). A plain GET form, so every view has a
 * bookmarkable link carrying only enums, dates and a centre slug.
 */
export function SourcesFilters({
  range,
  centre,
  centres,
  sessionLabel,
  invalid,
  locale,
  s,
}: {
  range: SourceRange;
  centre: string | null;
  centres: readonly CentreRef[];
  sessionLabel: string;
  invalid: { range: boolean; centre: boolean };
  locale: Locale;
  s: SourcesMessages;
}) {
  const f = s.filters;
  const custom = range.key === "custom";
  return (
    <section aria-labelledby="sources-filters" className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
      <h2 id="sources-filters" className="mb-3 text-base font-extrabold text-navy">
        {f.title}
      </h2>
      {(invalid.range || invalid.centre) && (
        <div role="alert" className="mb-3 space-y-1 text-sm font-semibold text-danger">
          {invalid.range && <p>{f.invalidRange}</p>}
          {invalid.centre && <p>{f.invalidCentre}</p>}
        </div>
      )}
      <Form action={localePath("/crm/sources", locale)} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="sources-range" className="text-sm font-bold text-navy">
            {f.range}
          </label>
          <select id="sources-range" name="range" defaultValue={range.key} className={control}>
            {SOURCE_RANGES.map((key) => (
              <option key={key} value={key}>
                {key === "session" ? format(f.ranges.session, { session: sessionLabel }) : f.ranges[key]}
              </option>
            ))}
            <option value="custom">{f.ranges.custom}</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="sources-from" className="text-sm font-bold text-navy">
            {f.from}
          </label>
          <input id="sources-from" name="from" type="date" defaultValue={custom ? range.fromDay : undefined} aria-describedby="sources-dates-hint" className={control} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="sources-to" className="text-sm font-bold text-navy">
            {f.to}
          </label>
          <input id="sources-to" name="to" type="date" defaultValue={custom ? range.toDay : undefined} aria-describedby="sources-dates-hint" className={control} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="sources-centre" className="text-sm font-bold text-navy">
            {f.centre}
          </label>
          <select id="sources-centre" name="centre" defaultValue={centre ?? ""} className={control}>
            <option value="">{f.allCentres}</option>
            {centres
              .filter((ref): ref is CentreRef & { slug: string } => ref.slug !== null)
              .map((ref) => (
                <option key={ref.slug} value={ref.slug}>
                  {ref.label}
                </option>
              ))}
            <option value="none">{f.noCentre}</option>
          </select>
        </div>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-control bg-navy px-4 text-sm font-bold text-white hover:bg-navy-2">
          {f.apply}
        </button>
      </Form>
      <p id="sources-dates-hint" className="mt-2 text-xs text-muted">
        {f.datesHint}
      </p>
    </section>
  );
}
