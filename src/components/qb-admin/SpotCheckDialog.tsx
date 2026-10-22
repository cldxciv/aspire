"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { QbExam } from "@/lib/qb/types";
import { qbCall, qbFailureMessage, qbRequests, type QbMessages } from "./api";
import { dangerButton, primaryButton, QbDialog, smallButton } from "./client-kit";
import type { QbBulkCommitResult, QbBulkOp, QbBulkStartResult, QbQuestionDetail } from "./contract";
import { optionLetter } from "./format";
import { FlagChip, SourceKindBadge } from "./QbBlocks";
import { RichPreview } from "./RichPreview";
import { canCommit, commitBody, SPOT_CHECK_IDLE, spotCheckReducer, spotProgress } from "./spot-check";

/**
 * The bulk-action spot check (§B7) as a dialog: starts the batch, lets the reviewer open every
 * sampled question (which fetches its one-time token), mark each OK or not, then commits. One "not
 * right" aborts the whole batch on the server. Closing an unfinished check cancels the batch.
 */
export function SpotCheckDialog({
  op,
  ids,
  exam,
  t,
  locale,
  onFinished,
  onClose,
}: {
  op: QbBulkOp;
  ids: readonly string[];
  exam: QbExam | null;
  t: QbMessages;
  locale: Locale;
  /** The batch went through (`done`) or was stopped (`aborted`): reload the list. */
  onFinished: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [state, dispatch] = useReducer(spotCheckReducer, SPOT_CHECK_IDLE);
  const [viewing, setViewing] = useState<QbQuestionDetail | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    dispatch({ type: "start", op, ids });
    void qbCall<QbBulkStartResult>(qbRequests.bulkStart(op, ids, exam)).then((result) => {
      if (result.ok) dispatch({ type: "started", result: result.data });
      else dispatch({ type: "failed", message: qbFailureMessage(result, t) });
    });
  }, [exam, ids, op, t]);

  useEffect(() => {
    if (state.phase !== "committing") return;
    void qbCall<QbBulkCommitResult>(qbRequests.bulkCommit(state.op, commitBody(state))).then((result) => {
      if (result.ok) {
        dispatch({ type: "committed", result: result.data });
        onFinished();
      } else {
        dispatch({ type: "failed", message: qbFailureMessage(result, t) });
      }
    });
    // Commit once per entry into "committing".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  function close() {
    if (state.phase === "checking") void qbCall(qbRequests.bulkCancel(state.op, state.batchId));
    onClose();
  }

  async function open(questionId: string) {
    if (state.phase !== "checking") return;
    setOpening(questionId);
    setOpenError(null);
    const result = await qbCall<QbQuestionDetail>(qbRequests.getQuestion(questionId, state.batchId));
    setOpening(null);
    if (!result.ok) {
      setOpenError(qbFailureMessage(result, t));
      return;
    }
    setViewing(result.data);
    if (result.data.spotToken) dispatch({ type: "opened", id: questionId, token: result.data.spotToken });
  }

  const progress = spotProgress(state);
  const r = t.review;

  return (
    <QbDialog open titleId={titleId} onClose={close} wide>
      <h2 id={titleId} className="text-xl font-extrabold text-navy">
        {r.spotTitle}
      </h2>
      <p className="mt-1 text-sm text-muted">{r.spotLead}</p>

      {state.phase === "starting" && (
        <p role="status" className="mt-4 text-sm text-muted">
          {r.spotStarting}
        </p>
      )}

      {(state.phase === "checking" || state.phase === "committing") && (
        <div className="mt-4 space-y-4">
          <p className="text-sm font-semibold text-navy">{format(r.spotEligible, { count: state.eligible.length })}</p>
          {state.skipped.length > 0 && (
            <details className="text-sm text-muted">
              <summary className="cursor-pointer">{format(r.spotSkipped, { count: state.skipped.length })}</summary>
              <ul className="mt-1 list-disc pl-5" lang="en">
                {state.skipped.map((item) => (
                  <li key={item.id}>
                    <span className="font-mono">{item.id}</span>: {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p role="status" className="text-sm text-muted">
            {format(r.spotProgress, progress)}
          </p>
          <ul className="space-y-2">
            {state.sample.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-control border border-line p-2">
                <span className="font-mono text-sm">{item.id}</span>
                <button type="button" className={smallButton} disabled={opening !== null || state.phase !== "checking"} onClick={() => void open(item.id)}>
                  {item.token ? r.spotOpened : r.spotOpen}
                </button>
                <button
                  type="button"
                  className={smallButton}
                  aria-pressed={item.verdict === "ok"}
                  disabled={item.token === null || state.phase !== "checking"}
                  onClick={() => dispatch({ type: "verdict", id: item.id, ok: true })}
                >
                  {r.spotOk}
                </button>
                <button
                  type="button"
                  className={dangerButton}
                  disabled={item.token === null || state.phase !== "checking"}
                  onClick={() => dispatch({ type: "verdict", id: item.id, ok: false })}
                >
                  {r.spotFail}
                </button>
              </li>
            ))}
          </ul>
          {openError && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {openError}
            </p>
          )}
          {viewing && <SampledQuestion detail={viewing} t={t} locale={locale} />}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={smallButton} onClick={close}>
              {t.common.cancel}
            </button>
            <button type="button" className={primaryButton} disabled={!canCommit(state)} onClick={() => dispatch({ type: "commit" })}>
              {r.spotCommit}
            </button>
          </div>
        </div>
      )}

      {state.phase === "done" && <Final message={format(r.spotDone, { count: state.count })} closeLabel={t.common.close} onClose={onClose} />}
      {state.phase === "aborted" && <Final message={format(r.spotAborted, { id: state.failedId })} closeLabel={t.common.close} onClose={onClose} alert />}
      {state.phase === "error" && (
        <Final message={state.message === "nothing_eligible" ? r.spotNothing : state.message} closeLabel={t.common.close} onClose={onClose} alert />
      )}
    </QbDialog>
  );
}

function Final({ message, closeLabel, onClose, alert = false }: { message: string; closeLabel: string; onClose: () => void; alert?: boolean }) {
  return (
    <div className="mt-4 space-y-4">
      <p role={alert ? "alert" : "status"} className={alert ? "font-semibold text-danger" : "font-semibold text-success"}>
        {message}
      </p>
      <div className="flex justify-end">
        <button type="button" className={primaryButton} onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

/** Read-only view of the sampled question: text, options with the key marked, source and flags. */
function SampledQuestion({ detail, t, locale }: { detail: QbQuestionDetail; t: QbMessages; locale: Locale }) {
  const { question } = detail;
  const answer = question.content.answer;
  const correct = new Set(answer?.kind === "single" ? [answer.index] : answer?.kind === "multiple" ? answer.indices : []);
  return (
    <article aria-label={question.id} className="space-y-3 rounded-control border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <SourceKindBadge kind={question.source.kind} t={t} />
        <span lang="en">{detail.sourceLabel}</span>
        <span className="text-muted">· {t.subjects[question.subject]}</span>
      </div>
      <RichPreview text={question.content.stem.en} lang="en" emptyLabel={t.editor.previewEmpty} />
      {question.content.options.length > 0 && (
        <ol className="space-y-1">
          {question.content.options.map((option, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className={correct.has(index) ? "font-extrabold text-success" : "font-bold text-muted"}>
                {optionLetter(index)}
                {correct.has(index) ? " ✓" : ""}
              </span>
              <RichPreview text={option.en} lang="en" emptyLabel="—" className="flex-1 py-1" />
            </li>
          ))}
        </ol>
      )}
      {answer?.kind === "numerical" && (
        <p className="text-sm font-semibold">
          {t.editor.answerValue}: {answer.low !== undefined && answer.high !== undefined ? `${answer.low} – ${answer.high}` : answer.value}
          {answer.unit ? ` ${locale === "hi" && answer.unit.hi ? answer.unit.hi : answer.unit.en}` : ""}
        </p>
      )}
      {question.flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {question.flags.map((flag) => (
            <FlagChip key={flag} flag={flag} t={t} />
          ))}
        </div>
      )}
    </article>
  );
}
