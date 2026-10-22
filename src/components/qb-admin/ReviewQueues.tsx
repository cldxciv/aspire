"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { QbExam } from "@/lib/qb/types";
import { qbRequests, type QbMessages } from "./api";
import { dangerButton, fieldClasses, labelClasses, QbFeedback, smallButton, useQbAction, useQbData } from "./client-kit";
import { isOneOf, QB_ADMIN_EXAMS, QB_BULK_MAX, QB_QUESTION_QUEUES, QB_QUEUES, type QbCapabilityMap, type QbQueue } from "./constants";
import type { QbBulkOp, QbDuplicateView, QbPage, QbReportView } from "./contract";
import { DEFAULT_QUESTION_FILTERS } from "./filters";
import { formatDateTime, formatShare } from "./format";
import { QbPanel, SourceKindBadge, StatusBadge } from "./QbBlocks";
import { QuestionList } from "./QuestionList";
import { SpotCheckDialog } from "./SpotCheckDialog";

const PAGE = "/admin/questions/review";

/**
 * Review queues (§B7): to review, flagged, duplicates, difficulty checks, possible wrong key,
 * student reports and Hindi. Question queues get bulk actions (approve; accept AI chapter and
 * difficulty; confirm syllabus) behind the spot check. Nothing changes automatically.
 */
export function ReviewQueues({ t, locale, can, initialQueue }: { t: QbMessages; locale: Locale; can: QbCapabilityMap; initialQueue: QbQueue }) {
  const id = useId();
  const [queue, setQueue] = useState<QbQueue>(initialQueue);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exam, setExam] = useState<QbExam>("JEE_MAIN");
  const [bulk, setBulk] = useState<{ op: QbBulkOp; ids: string[]; exam: QbExam | null } | null>(null);
  const [reload, setReload] = useState(0);
  const r = t.review;

  function choose(next: QbQueue) {
    setQueue(next);
    setSelected(new Set());
    window.history.replaceState(null, "", localePath(`${PAGE}?queue=${next}`, locale));
  }

  function startBulk(op: QbBulkOp) {
    const ids = [...selected].slice(0, QB_BULK_MAX);
    if (ids.length === 0) return;
    setBulk({ op, ids, exam: op === "approve" ? null : exam });
  }

  /** The queue as a question filter; null for duplicates and reports (their own panels). */
  const questionQueue = isOneOf(QB_QUESTION_QUEUES, queue) ? queue : null;
  const canBulk = can.approve || can.set_labels;

  return (
    <div className="space-y-4">
      <div role="group" aria-label={t.review.title} className="flex flex-wrap gap-2">
        {QB_QUEUES.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={queue === key}
            onClick={() => choose(key)}
            className={queue === key ? "inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-bold text-white" : `${smallButton} rounded-full`}
          >
            {r.queues[key]}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">{r.queueLeads[queue]}</p>

      {questionQueue && canBulk && (
        <section aria-labelledby={`${id}-bulk`} className="rounded-card border border-line bg-white p-4 shadow-soft">
          <h2 id={`${id}-bulk`} className="font-extrabold text-navy">
            {r.bulkTitle}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {selected.size > 0 ? format(t.list.selected, { count: selected.size }) : r.bulkNoneSelected} · {format(r.bulkMax, { max: QB_BULK_MAX })}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            {can.approve && (
              <button type="button" className={smallButton} disabled={selected.size === 0} onClick={() => startBulk("approve")}>
                {r.bulkApprove}
              </button>
            )}
            {can.set_labels && (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${id}-exam`} className={labelClasses}>
                    {r.bulkExam}
                  </label>
                  <select id={`${id}-exam`} value={exam} onChange={(event) => setExam(event.target.value as QbExam)} className={fieldClasses}>
                    {QB_ADMIN_EXAMS.map((value) => (
                      <option key={value} value={value}>
                        {t.exams[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className={smallButton} disabled={selected.size === 0} onClick={() => startBulk("accept_ai_labels")}>
                  {r.bulkAcceptAi}
                </button>
                <button type="button" className={smallButton} disabled={selected.size === 0} onClick={() => startBulk("confirm_syllabus")}>
                  {r.bulkConfirmSyllabus}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {questionQueue && (
        <QuestionList
          key={questionQueue}
          initialFilters={{ ...DEFAULT_QUESTION_FILTERS, queue: questionQueue }}
          fixed={{ queue: questionQueue }}
          t={t}
          locale={locale}
          pagePath={PAGE}
          selectable={canBulk}
          selected={selected}
          onSelectedChange={setSelected}
          reloadSignal={reload}
        />
      )}
      {queue === "duplicates" && <DuplicatesPanel t={t} locale={locale} canDecide={can.merge_duplicates} />}
      {queue === "reports" && <ReportsPanel t={t} locale={locale} canClose={can.approve} />}

      {bulk && (
        <SpotCheckDialog
          op={bulk.op}
          ids={bulk.ids}
          exam={bulk.exam}
          t={t}
          locale={locale}
          onFinished={() => {
            setSelected(new Set());
            setReload((n) => n + 1);
          }}
          onClose={() => setBulk(null)}
        />
      )}
    </div>
  );
}

function questionHref(id: string, locale: Locale) {
  return localePath(`/admin/questions/${encodeURIComponent(id)}`, locale);
}

/** Duplicate pairs side by side with the three decisions (§B7). */
export function DuplicatesPanel({ t, locale, canDecide }: { t: QbMessages; locale: Locale; canDecide: boolean }) {
  const [page, setPage] = useState(1);
  const data = useQbData<QbPage<QbDuplicateView>>(qbRequests.duplicates(page), t, PAGE);
  const action = useQbAction(t, PAGE);
  const d = t.duplicates;

  async function decide(pair: QbDuplicateView, decision: "duplicate" | "variant" | "distinct", keep?: string) {
    const result = await action.run<QbDuplicateView>(qbRequests.decideDuplicate(pair.a, pair.b, decision, keep), t.workflow.done);
    if (result) data.reload();
  }

  return (
    <QbPanel id="qb-duplicates" title={t.review.queues.duplicates} description={d.lead}>
      <QbFeedback state={action} detailsLabel={t.common.details} className="mb-2" />
      {data.error && <p role="alert" className="text-sm text-danger">{data.error}</p>}
      {data.data && data.data.items.length === 0 && <p className="text-muted">{d.empty}</p>}
      <ul className="space-y-3">
        {data.data?.items.map((pair) => (
          <li key={`${pair.a}-${pair.b}`} className="rounded-control border border-line p-3">
            <p className="text-sm font-semibold text-navy">
              {d.kinds[pair.kind]} · {format(d.pair, { score: formatShare(pair.score, locale) })}
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {pair.questions.map((question, index) => (
                <div key={index} className="rounded-control bg-surface p-2 text-sm">
                  {question ? (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={question.status} t={t} />
                        <SourceKindBadge kind={question.sourceKind} t={t} />
                      </div>
                      <Link href={questionHref(question.id, locale)} className="mt-1 block font-semibold text-navy hover:underline" lang="en">
                        {question.stemPreview}
                      </Link>
                      <p className="mt-1 text-xs text-muted" lang="en">
                        {question.sourceLabel}
                      </p>
                    </>
                  ) : (
                    <span className="text-muted">{t.common.none}</span>
                  )}
                </div>
              ))}
            </div>
            {canDecide && pair.status === "open" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={smallButton} disabled={action.pending} onClick={() => void decide(pair, "duplicate", pair.a)}>
                  {d.decisions.duplicate} · {format(d.keep, { id: pair.a })}
                </button>
                <button type="button" className={smallButton} disabled={action.pending} onClick={() => void decide(pair, "variant")}>
                  {d.decisions.variant}
                </button>
                <button type="button" className={smallButton} disabled={action.pending} onClick={() => void decide(pair, "distinct")}>
                  {d.decisions.distinct}
                </button>
              </div>
            )}
            {pair.status !== "open" && <p className="mt-2 text-sm text-muted">{format(d.decided, { decision: d.decisions[pair.status] })}</p>}
          </li>
        ))}
      </ul>
      {data.data && data.data.total > data.data.pageSize && (
        <div className="mt-3 flex gap-2">
          <button type="button" className={smallButton} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t.common.previous}
          </button>
          <button type="button" className={smallButton} disabled={page * data.data.pageSize >= data.data.total} onClick={() => setPage((p) => p + 1)}>
            {t.common.next}
          </button>
        </div>
      )}
    </QbPanel>
  );
}

/** Students' "Report a problem" notes; closing one never edits the question by itself. */
export function ReportsPanel({ t, locale, canClose }: { t: QbMessages; locale: Locale; canClose: boolean }) {
  const data = useQbData<QbPage<QbReportView>>(qbRequests.reports(1), t, PAGE);
  const action = useQbAction(t, PAGE);
  const r = t.review;

  async function close(report: QbReportView, status: "resolved" | "dismissed") {
    const result = await action.run<QbReportView>(qbRequests.closeReport(report.id, status), t.workflow.done);
    if (result) data.reload();
  }

  return (
    <QbPanel id="qb-reports" title={r.queues.reports} description={r.queueLeads.reports}>
      <QbFeedback state={action} detailsLabel={t.common.details} className="mb-2" />
      {data.error && <p role="alert" className="text-sm text-danger">{data.error}</p>}
      {data.data && data.data.items.length === 0 && <p className="text-muted">{r.reportsEmpty}</p>}
      <ul className="space-y-3">
        {data.data?.items.map((report) => (
          <li key={report.id} className="rounded-control border border-line p-3 text-sm">
            <p className="font-semibold text-navy">
              {r.reportKinds[report.kind]} · {formatDateTime(report.createdAt, locale)}
            </p>
            {report.note && (
              <p className="mt-1 whitespace-pre-line" lang="en">
                {report.note}
              </p>
            )}
            <Link href={questionHref(report.questionId, locale)} className="mt-1 inline-flex min-h-11 items-center font-bold text-blue hover:underline">
              {format(r.reportOn, { id: report.questionId, version: report.version })}
            </Link>
            {canClose && report.status === "open" && (
              <div className="mt-1 flex flex-wrap gap-2">
                <button type="button" className={smallButton} disabled={action.pending} onClick={() => void close(report, "resolved")}>
                  {r.reportResolve}
                </button>
                <button type="button" className={dangerButton} disabled={action.pending} onClick={() => void close(report, "dismissed")}>
                  {r.reportDismiss}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </QbPanel>
  );
}
