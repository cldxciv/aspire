import Link from "next/link";
import { Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { CrmImportMessages } from "./types";
import type { ResultTotals } from "./wizard-model";

/**
 * What the import did (the server's batch counts), and the lost families that appeared again: one
 * link per family (`totals.lost` is already one entry per lead), listing the file rows it was on.
 */
export function ImportResultView({
  totals,
  startClock,
  locale,
  t,
}: {
  totals: ResultTotals;
  startClock: boolean;
  locale: Locale;
  t: CrmImportMessages;
}) {
  const rows: [string, number][] = [
    [t.result.created, totals.created],
    [t.result.attached, totals.attached],
    [t.result.skipped, totals.skipped],
    [t.result.invalid, totals.invalid],
  ];
  return (
    <div className="space-y-4">
      <Notice variant="success" role="status" title={t.result.title}>
        {totals.created > 0 ? (startClock ? t.result.clockOn : t.result.clockOff) : ""}
      </Notice>
      <dl className="grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 rounded-control border border-line bg-white px-3 py-2">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-lg font-extrabold tabular-nums text-navy">{value}</dd>
          </div>
        ))}
      </dl>
      {totals.lost.length > 0 && (
        <section aria-labelledby="import-lost-title" className="rounded-control border border-[#f2dfa0] bg-gold-soft p-4">
          <h3 id="import-lost-title" className="font-extrabold text-navy">
            {t.result.lostTitle} ({totals.lost.length})
          </h3>
          <p className="mt-1 text-sm text-[#5c4a12]">{t.result.lostBody}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {totals.lost.map((item) => (
              <li key={item.leadId}>
                <Link
                  href={localePath(`/crm/leads/${encodeURIComponent(item.leadId)}`, locale)}
                  className="inline-flex min-h-11 items-center rounded-control border border-[#d9b64a] bg-white px-3 text-sm font-bold text-blue hover:underline"
                >
                  {format("{open} · {row}", { open: t.result.openLead, row: item.rows.map((row) => `#${row}`).join(", ") })}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
