import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import type { ImportBatchSummary } from "@/lib/crm/intake/import";
import { formatDateTime, isoOrUndefined } from "../format";
import type { CrmImportMessages } from "./types";

/** Past imports, newest first: counts only (no family data). Server-safe. */
export function ImportHistory({ batches, locale, t }: { batches: readonly ImportBatchSummary[]; locale: Locale; t: CrmImportMessages }) {
  const h = t.history;
  return (
    <section aria-labelledby="import-history-title" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <h2 id="import-history-title" className="mb-4 text-lg font-extrabold text-navy">
        {h.title}
      </h2>
      {batches.length === 0 ? (
        <p className="text-sm text-muted">{h.empty}</p>
      ) : (
        <div role="region" aria-labelledby="import-history-title" tabIndex={0} className="overflow-x-auto rounded-control border border-line">
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <thead className="bg-[#f4f7fb] text-xs uppercase tracking-wide text-[#354b66]">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  {h.when}
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  {h.file}
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  {h.consent}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  {h.created}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  {h.attached}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  {h.skipped}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  {h.invalid}
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  {h.status}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {batches.map((batch) => (
                <tr key={batch.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <time dateTime={isoOrUndefined(batch.createdAt)}>{formatDateTime(batch.createdAt, locale)}</time>
                    {batch.mine && <span className="block text-xs text-muted">{h.you}</span>}
                  </td>
                  <td className="max-w-[14rem] break-words px-3 py-2.5">{batch.fileName ?? h.noFile}</td>
                  <td className="px-3 py-2.5">{t.consent.bases[batch.consentBasis]}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{batch.created}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{batch.attached}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{batch.skipped}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{batch.invalid}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={batch.status === "finished" ? "success" : "warning"} className="normal-case tracking-normal">
                      {batch.status === "finished" ? h.finished : h.open}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
