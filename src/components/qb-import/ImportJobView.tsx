"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Notice } from "@/components/ui";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import type { ImportJobView as Job } from "@/lib/qb/import/types";

import { dangerButton, EstimatePanel, Panel, primaryButton, smallButton, StatusBadge } from "./ImportBlocks";
import { getImportJob, importAction, type ImportActionRequest, type ImportSummaryView, type ImportViewerInfo, sourcePath } from "./import-api";
import {
  applyReasonMessage,
  availableActions,
  creatableRows,
  formatCount,
  formatDateTime,
  formatUsd,
  type ImportMessages,
  jobErrorMessage,
  type JobActionKey,
  progressPercent,
  reasonMessage,
  reportCodeMessage,
  reviewLink,
  shouldPoll,
} from "./import-view";

type Loaded = { job: Job; summary: ImportSummaryView; viewer: ImportViewerInfo };

const POLL_MS = 10_000;

/**
 * One import: details, estimate and spend, progress (polled every 10 s while it runs), actions,
 * page marks (third-party warning), the pattern snapshot, and the dry-run / key / pairing report.
 */
export function ImportJobView({ id, t, locale }: { id: string; t: ImportMessages; locale: Locale }) {
  const ids = useId();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<{ notFound: boolean; message: string } | null>(null);
  const [action, setAction] = useState<{ pending: boolean; error: string | null; status: string }>({ pending: false, error: null, status: "" });
  const [confirming, setConfirming] = useState<"cancel" | "close" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The confirmation takes focus when it opens and gives it back to the button that opened it (or,
  // when that button is gone after the action, to the status line).
  const confirmYes = useRef<HTMLButtonElement | null>(null);
  const confirmTrigger = useRef<HTMLButtonElement | null>(null);
  const statusLine = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (confirming) confirmYes.current?.focus();
  }, [confirming]);

  const restoreFocus = useCallback(() => {
    const trigger = confirmTrigger.current;
    confirmTrigger.current = null;
    if (trigger && trigger.isConnected && !trigger.disabled) trigger.focus();
    else statusLine.current?.focus();
  }, []);

  const failureText = useCallback(
    (failure: { error: string; status: number; reason: string | null }) => {
      if (failure.error === "network") return t.errors.network;
      if (failure.status === 401) return t.errors.signIn;
      if (failure.status === 403) return t.errors.forbidden;
      if (failure.status === 429) return t.errors.rateLimited;
      if (failure.reason) return reasonMessage(t, failure.reason, (status) => t.status[status as keyof ImportMessages["status"]] ?? status);
      return t.errors.generic;
    },
    [t],
  );

  const apply = useCallback(
    (result: Awaited<ReturnType<typeof getImportJob>>) => {
      if (result.ok) {
        setData(result.data);
        setLoadError(null);
      } else {
        setLoadError({ notFound: result.status === 404, message: failureText(result) });
      }
    },
    [failureText],
  );

  const load = useCallback(async () => apply(await getImportJob(id)), [apply, id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getImportJob(id);
      if (!cancelled) apply(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, id]);

  // Poll while the job works on its own (reading, or waiting for a batch).
  const status = data?.job.status ?? null;
  useEffect(() => {
    if (status === null || !shouldPoll(status)) return;
    timer.current = setTimeout(() => void load(), POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, data, load]);

  async function run(key: JobActionKey) {
    const requests: Record<JobActionKey, ImportActionRequest> = {
      run: { action: "run" },
      runFast: { action: "run", options: { mode: "sync" } },
      resume: { action: "run" },
      pause: { action: "pause" },
      cancel: { action: "cancel" },
      retry: { action: "retry_failed" },
      close: { action: "close" },
      createDrafts: { action: "create_drafts" },
      confirmSnapshot: { action: "confirm_snapshot" },
    };
    const confirmed = confirming !== null;
    setConfirming(null);
    setAction({ pending: true, error: null, status: t.actions.working });
    const result = await importAction(id, requests[key]);
    if (result.ok) {
      setData(result.data);
      setAction({ pending: false, error: null, status: t.actions.done });
    } else {
      if (result.report && data) setData({ ...data, job: { ...data.job, report: result.report } });
      setAction({ pending: false, error: failureText(result), status: "" });
    }
    if (confirmed) requestAnimationFrame(restoreFocus);
  }

  function closeConfirm() {
    setConfirming(null);
    requestAnimationFrame(restoreFocus);
  }

  if (loadError) {
    return (
      <Notice variant={loadError.notFound ? "info" : "error"} role="alert" title={loadError.notFound ? t.page.notFoundTitle : undefined}>
        {loadError.notFound ? t.page.notFoundBody : loadError.message}
      </Notice>
    );
  }
  if (!data) {
    return (
      <p role="status" className="text-sm text-muted">
        {t.page.loading}
      </p>
    );
  }

  const { job, summary, viewer } = data;
  const actions = availableActions(job, viewer.can, summary.ai.enabled);
  const label = (key: JobActionKey): string => {
    const rows = creatableRows(job.report);
    switch (key) {
      case "createDrafts":
        return job.kind === "csv_key" ? format(t.actions.applyKey, { n: rows }) : format(t.actions.createDrafts, { n: rows });
      case "retry":
        return t.actions.retry;
      default:
        return t.actions[key];
    }
  };
  const waiting = job.items.pending + job.items.submitted + job.items.running;
  const failed = job.items.failed + job.items.refused;
  const review = reviewLink(job);

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={job.status} t={t} />
        <span className="break-all font-bold text-navy">{job.fileName}</span>
        <span className="text-sm text-muted">{t.form.kinds[job.kind]}</span>
      </div>

      {job.pauseReason && job.status === "paused" && (
        <Notice variant="warning" role="status">
          {t.pause[job.pauseReason as keyof ImportMessages["pause"]] ?? t.pause.staff}
        </Notice>
      )}
      {job.thirdParty && (
        <Notice variant="error" role="alert" title={t.marks.title}>
          {t.marks.thirdParty}
        </Notice>
      )}
      {job.warnings.map((warning) => (
        <Notice key={warning} variant="warning">
          {t.warnings[warning as keyof ImportMessages["warnings"]] ?? warning}
        </Notice>
      ))}
      {job.error && (
        <Notice variant="warning" role="status">
          {jobErrorMessage(t, job.error)}
        </Notice>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel id={`${ids}-progress`} title={t.job.progress} description={shouldPoll(job.status) ? t.job.polling : undefined}>
          <div className="grid gap-3 text-sm text-ink">
            {job.progress.total > 0 && (
              <>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent(job.progress.done, job.progress.total)}
                  aria-label={t.job.progress}
                  className="h-2.5 overflow-hidden rounded-full bg-surface"
                >
                  <div className="h-full rounded-full bg-navy" style={{ width: `${progressPercent(job.progress.done, job.progress.total)}%` }} />
                </div>
                <p>{format(t.job.progressLine, { done: formatCount(job.progress.done, locale), total: formatCount(job.progress.total, locale) })}</p>
              </>
            )}
            {job.progress.total > 0 && job.kind !== "csv_bank" && job.kind !== "xlsx_bank" && job.kind !== "csv_key" && (
              <p>{format(t.job.items, { done: formatCount(job.items.done, locale), waiting: formatCount(waiting, locale), failed: formatCount(failed, locale) })}</p>
            )}
            <p className="font-bold">{format(t.job.drafts, { n: formatCount(job.draftsCreated, locale) })}</p>
            <p>{format(t.job.usage, { usd: formatUsd(job.usage.usd, locale), calls: formatCount(job.usage.calls, locale) })}</p>
            {review && (
              <Link href={localePath(review, locale)} className="font-bold text-blue underline-offset-2 hover:underline">
                {t.job.review}
              </Link>
            )}
            {!review && job.draftsCreated > 0 && <p className="text-muted">{t.job.reviewAfterRun}</p>}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {actions
              .filter((key) => key !== "cancel" && key !== "close")
              .map((key) => (
                <button key={key} type="button" className={key === "run" || key === "resume" || key === "createDrafts" ? primaryButton : smallButton} disabled={action.pending} onClick={() => void run(key)}>
                  {label(key)}
                </button>
              ))}
            {(["cancel", "close"] as const)
              .filter((key) => actions.includes(key))
              .map((key) => (
                <button
                  key={key}
                  type="button"
                  className={dangerButton}
                  disabled={action.pending}
                  aria-expanded={confirming === key}
                  aria-controls={confirming === key ? `${ids}-confirm-box` : undefined}
                  onClick={(event) => {
                    confirmTrigger.current = event.currentTarget;
                    setConfirming(key);
                  }}
                >
                  {t.actions[key]}
                </button>
              ))}
            <button type="button" className={smallButton} onClick={() => void load()} disabled={action.pending}>
              {t.job.refresh}
            </button>
          </div>
          {confirming && (
            <div
              id={`${ids}-confirm-box`}
              role="group"
              aria-labelledby={`${ids}-confirm`}
              className="mt-3 grid gap-2 rounded-control border border-[#e7b4b4] bg-[#fff4f4] p-3 text-sm"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeConfirm();
                }
              }}
            >
              <p id={`${ids}-confirm`} className="font-bold text-[#7a1212]">
                {confirming === "cancel" ? t.actions.confirmCancel : t.actions.confirmClose}
              </p>
              <div className="flex gap-2">
                <button ref={confirmYes} type="button" className={dangerButton} aria-describedby={`${ids}-confirm`} onClick={() => void run(confirming)}>
                  {t.actions.yes}
                </button>
                <button type="button" className={smallButton} onClick={closeConfirm}>
                  {t.actions.no}
                </button>
              </div>
            </div>
          )}
          {action.error && (
            <Notice variant="error" role="alert" className="mt-3">
              {action.error}
            </Notice>
          )}
          <p ref={statusLine} tabIndex={-1} role="status" className="mt-2 text-sm text-muted focus:outline-none">
            {action.status}
          </p>
        </Panel>
        <div className="grid content-start gap-6">
          <EstimatePanel estimate={job.estimate} t={t} locale={locale} />
          <Panel id={`${ids}-details`} title={t.job.details}>
            <ul className="grid gap-1.5 text-sm text-ink">
              {job.pages !== null && <li>{format(t.job.pages, { n: formatCount(job.pages, locale) })}</li>}
              {job.rows !== null && <li>{format(t.job.rows, { n: formatCount(job.rows, locale) })}</li>}
              {job.meta.exam && <li>{t.form.exams[job.meta.exam]}</li>}
              {job.meta.year !== undefined && <li>{[job.meta.year, job.meta.date, job.meta.session, job.meta.shift, job.meta.paper, job.meta.booklet].filter(Boolean).join(" · ")}</li>}
              <li>{t.form.sourceKinds[job.meta.sourceKind]}</li>
              {job.encrypted && <li>{t.job.encrypted}</li>}
              <li className="text-muted">{format(t.job.licence, { date: formatDateTime(job.licence.at, locale) })}</li>
              {job.licence.note && <li className="break-words text-muted">{format(t.job.licenceNote, { note: job.licence.note })}</li>}
            </ul>
            {job.kind.startsWith("pdf_") &&
              (job.fileAvailable ? (
                <a href={sourcePath(job.id)} target="_blank" rel="noopener" className={`${smallButton} mt-3`}>
                  <ExternalLink aria-hidden="true" className="size-4" />
                  {t.job.source}
                </a>
              ) : (
                <p className="mt-3 text-sm text-muted">{t.job.sourceGone}</p>
              ))}
          </Panel>
        </div>
      </div>

      {job.report && (
        <Panel id={`${ids}-report`} title={t.report.title} description={format(job.report.kind === "key" ? t.report.keySummary : t.report.summary, { valid: job.report.valid, rows: job.report.rows })}>
          {job.report.errors.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-navy">{t.report.errors}</h3>
              <ul className="mt-1 grid gap-1 text-sm text-ink">
                {job.report.errors.map((entry, index) => (
                  <li key={`${entry.row}-${entry.column}-${index}`}>
                    {format(t.report.row, { row: entry.row })}
                    {entry.column ? `, ${format(t.report.column, { column: entry.column })}` : ""}: {reportCodeMessage(t, entry.code)}
                  </li>
                ))}
              </ul>
              {job.report.moreErrors > 0 && <p className="mt-1 text-sm text-muted">{format(t.report.more, { n: job.report.moreErrors })}</p>}
            </>
          )}
          {job.report.warnings.length > 0 && (
            <>
              <h3 className="mt-3 text-sm font-bold text-navy">{t.report.warnings}</h3>
              <ul className="mt-1 grid gap-1 text-sm text-muted">
                {job.report.warnings.slice(0, 50).map((entry, index) => (
                  <li key={`${entry.row}-${entry.column}-${index}`}>
                    {format(t.report.row, { row: entry.row })}: {reportCodeMessage(t, entry.code)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      )}

      {job.apply && (
        <Panel
          id={`${ids}-apply`}
          title={job.kind === "pdf_paper" ? t.apply.pairTitle : t.apply.keyTitle}
          description={format(job.kind === "pdf_paper" ? t.apply.pairSummary : t.apply.keySummary, {
            matched: job.apply.matched,
            rows: job.apply.rows,
            dropped: job.apply.dropped,
            multiple: job.apply.multiple,
            conflicts: job.apply.conflicts,
          })}
        >
          {job.apply.unmatched.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-navy">{t.apply.unmatched}</h3>
              <ul className="mt-1 grid gap-1 text-sm text-ink">
                {job.apply.unmatched.map((entry, index) => (
                  <li key={`${entry.line}-${index}`}>
                    {format(t.apply.line, { line: entry.line })}
                    {entry.qno ? ` (${format(t.apply.qno, { qno: entry.qno })})` : ""}: {applyReasonMessage(t, entry.reason)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      )}

      {job.kind !== "csv_bank" && job.kind !== "xlsx_bank" && job.kind !== "csv_key" && (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Panel id={`${ids}-marks`} title={t.marks.title}>
            {job.pageMarks.length === 0 ? (
              <p className="text-sm text-muted">{t.marks.none}</p>
            ) : (
              <>
                {!job.thirdParty && <p className="mb-2 text-sm text-ink">{t.marks.clean}</p>}
                <ul className="grid gap-1 text-sm text-ink">
                  {job.pageMarks.map((mark, index) => (
                    <li key={`${mark.kind}-${index}`} className="break-words">
                      <span className="font-bold">{t.marks.kinds[mark.kind]}</span> · {format(t.marks.page, { page: mark.page })} · {mark.text}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
          {job.kind !== "pdf_key" && (
            <Panel id={`${ids}-snapshot`} title={t.snapshot.title} description={t.snapshot.lead}>
              {job.patternSnapshot?.confirmedAt && <p className="mb-2 text-sm font-bold text-ink">{format(t.snapshot.confirmed, { date: formatDateTime(job.patternSnapshot.confirmedAt, locale) })}</p>}
              {!job.patternSnapshot || job.patternSnapshot.sections.length === 0 ? (
                <p className="text-sm text-muted">{t.snapshot.empty}</p>
              ) : (
                <ol className="grid gap-2 text-sm text-ink">
                  {job.patternSnapshot.sections.map((section, index) => (
                    <li key={index} className="rounded-control border border-line p-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted">
                        {[section.subject, section.section, format(t.snapshot.page, { page: section.page })].filter(Boolean).join(" · ")}
                      </p>
                      <p className="whitespace-pre-line break-words">{section.text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
