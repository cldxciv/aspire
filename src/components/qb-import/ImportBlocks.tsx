import { FileText } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge, type BadgeVariant } from "@/components/ui";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import type { ImportJobView } from "@/lib/qb/import/types";
import type { QbImportEstimate, QbImportStatus } from "@/lib/qb/types";

import { formatCount, formatDateTime, formatUsd, type ImportMessages, isAiImportKind } from "./import-view";

/**
 * Presentational blocks of the import screens (no hooks: server- and client-safe). Status is
 * always written out, never colour alone. Same field / button styles as the question-bank console.
 */

export const fieldClasses =
  "min-h-11 w-full rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px] text-ink placeholder:text-[#8a99ad] " +
  "disabled:cursor-not-allowed disabled:bg-[#f4f7fb]";
export const labelClasses = "text-sm font-bold text-navy";
export const smallButton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-line bg-white px-3 py-2 text-sm font-bold text-navy hover:border-blue hover:text-blue disabled:cursor-not-allowed disabled:opacity-60";
export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-[#123a73] disabled:cursor-not-allowed disabled:opacity-60";
export const dangerButton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-[#e7b4b4] bg-white px-3 py-2 text-sm font-bold text-[#a61b1b] hover:bg-[#fff4f4] disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_VARIANT: Record<QbImportStatus, BadgeVariant> = {
  uploaded: "neutral",
  ready: "info",
  running: "info",
  waiting_batch: "info",
  paused: "warning",
  done: "success",
  failed: "warning",
  cancelled: "neutral",
  closed: "neutral",
};

export function StatusBadge({ status, t }: { status: QbImportStatus; t: ImportMessages }) {
  return <Badge variant={STATUS_VARIANT[status]}>{t.status[status]}</Badge>;
}

/** A titled white panel (`<section>` labelled by its `<h2>`). */
export function Panel({ id, title, description, children, className }: { id: string; title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-card border border-line bg-white p-4 shadow-soft md:p-5 ${className ?? ""}`}>
      <h2 id={id} className="text-lg font-extrabold text-navy">
        {title}
      </h2>
      {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function EstimatePanel({ estimate, t, locale }: { estimate: QbImportEstimate | null; t: ImportMessages; locale: Locale }) {
  return (
    <Panel id="import-estimate" title={t.estimate.title}>
      {!estimate || !estimate.aiRequired ? (
        <p className="text-sm text-ink">{t.estimate.none}</p>
      ) : (
        <div className="grid gap-1.5 text-sm text-ink">
          <p className="text-2xl font-extrabold text-navy">{format(t.estimate.range, { low: formatUsd(estimate.usd[0], locale), high: formatUsd(estimate.usd[1], locale) })}</p>
          <p>{format(t.estimate.mode, { mode: t.estimate.modes[estimate.mode], batches: formatCount(estimate.batches, locale) })}</p>
          <p className="text-muted">
            {format(t.estimate.tokens, {
              inLow: formatCount(estimate.inputTokens[0], locale),
              inHigh: formatCount(estimate.inputTokens[1], locale),
              outLow: formatCount(estimate.outputTokens[0], locale),
              outHigh: formatCount(estimate.outputTokens[1], locale),
            })}
          </p>
          <p className="text-muted">{t.estimate.note}</p>
        </div>
      )}
    </Panel>
  );
}

/** The recent imports table (a list of cards below `md`). */
export function ImportList({ imports, t, locale }: { imports: readonly ImportJobView[]; t: ImportMessages; locale: Locale }) {
  if (imports.length === 0) return <p className="text-sm text-muted">{t.list.empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">{t.list.caption}</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-3">{t.list.columns.file}</th>
            <th scope="col" className="py-2 pr-3">{t.list.columns.kind}</th>
            <th scope="col" className="py-2 pr-3">{t.list.columns.status}</th>
            <th scope="col" className="py-2 pr-3 text-right">{t.list.columns.drafts}</th>
            <th scope="col" className="py-2 pr-3 text-right">{t.list.columns.cost}</th>
            <th scope="col" className="py-2">{t.list.columns.created}</th>
          </tr>
        </thead>
        <tbody>
          {imports.map((job) => (
            <tr key={job.id} className="border-b border-line align-top last:border-b-0">
              <td className="max-w-[16rem] py-2 pr-3">
                <Link href={localePath(`/admin/questions/import/${job.id}`, locale)} className="inline-flex items-start gap-1.5 font-bold text-blue underline-offset-2 hover:underline">
                  <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span className="break-all">{job.fileName}</span>
                </Link>
              </td>
              <td className="py-2 pr-3">
                {t.form.kinds[job.kind]}
                {isAiImportKind(job.kind) && <span className="block text-xs text-muted">{t.form.aiKind}</span>}
              </td>
              <td className="py-2 pr-3">
                <StatusBadge status={job.status} t={t} />
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatCount(job.draftsCreated, locale)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatUsd(job.usage.usd, locale)}</td>
              <td className="py-2 tabular-nums">{formatDateTime(job.createdAt, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
