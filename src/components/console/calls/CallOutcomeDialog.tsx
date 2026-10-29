"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, Notice } from "@/components/ui";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "@/components/crm/client-kit";
import type { CrmMessages } from "@/components/crm/format";
import { useLocale } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { streakAfter } from "@/lib/crm/console/followup/attempts";
import { CALL_OUTCOMES, type FollowUpContextView } from "@/lib/crm/console/followup/types";
import type { OutcomeInput, OutcomeResult } from "@/lib/crm/console/types";
import { callsRequests } from "./api";
import { AttemptLine } from "./AttemptLine";
import type { CallsMessages } from "./messages";
import { NextFollowUpPicker } from "./NextFollowUpPicker";
import { NotReachableHint } from "./NotReachableHint";
import {
  buildCallOutcome,
  notReachableOffered,
  OUTCOME_NOTE_MAX,
  pickerFromSuggestion,
  pickerOutsideHours,
  pickerVisible,
  savedMessage,
  suggestionFor,
  type CallFormIssue,
  type CallFormState,
  type CallOutcomeChoice,
} from "./outcome-form";
import { useFollowUpContext } from "./use-follow-up-context";

const tile =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line px-3 py-2.5 has-checked:border-blue has-checked:bg-blue-soft";

function Spinner() {
  return <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />;
}

export type CallOutcomeDialogProps = {
  open: boolean;
  leadId: string;
  leadName: string;
  /** Opened from a task's Done button: the task is ticked off in the same save. */
  taskId?: string | null;
  taskTitle?: string | null;
  pagePath: string;
  t: Pick<CrmMessages, "errors">;
  c: CallsMessages;
  onClose: () => void;
  /** Saved: the parent announces `message` (role="status"); the page refreshes. */
  onDone: (message: string) => void;
};

/**
 * One-step call outcome (docs/admin-phase-1b-plan.md §5.C; owner: 1B-CALLS). Opens from "Log a
 * call", from "Back from the call? → Log the call" and from every task's Done button. Loads the
 * lead's follow-up context, asks what happened (large tiles), an optional note and the REQUIRED next
 * follow-up (the suggestion pre-selected), then saves everything in one atomic request. `CrmDialog`
 * traps focus, closes on Esc and returns focus to the opener; it is a full-height sheet on phones.
 */
export function CallOutcomeDialog({ open, onClose, ...props }: CallOutcomeDialogProps) {
  const titleId = `${useId()}-title`;
  return (
    <CrmDialog open={open} titleId={titleId} onClose={onClose} drawer>
      {/* CrmDialog renders its children only while open: every opening loads a fresh context. */}
      <CallOutcomeBody {...props} titleId={titleId} onClose={onClose} />
    </CrmDialog>
  );
}

function CallOutcomeBody({
  titleId,
  leadId,
  leadName,
  taskId = null,
  taskTitle = null,
  pagePath,
  t,
  c,
  onClose,
  onDone,
}: Omit<CallOutcomeDialogProps, "open"> & { titleId: string }) {
  const state = useFollowUpContext(leadId, taskId, t, pagePath);
  const action = useCrmAction(t, pagePath);
  const locale = useLocale();

  async function save(input: OutcomeInput) {
    const result = await action.run<OutcomeResult>(callsRequests.recordOutcome(leadId, input));
    if (result === null) return;
    onDone(savedMessage(input, result, Date.now(), locale, c.calls));
  }

  return (
    <>
      {state.status === "ready" ? (
        <CallOutcomeForm
          titleId={titleId}
          ctx={state.ctx}
          leadName={leadName}
          taskId={taskId}
          taskTitle={taskTitle}
          pending={action.pending}
          error={action.error}
          locale={locale}
          c={c}
          onSubmit={save}
          onCancel={onClose}
        />
      ) : (
        <div className="p-5 md:p-6">
          <h2 id={titleId} className="text-lg font-extrabold text-navy">
            {taskId ? c.calls.titleTask : c.calls.titleCall}
            <span className="block text-sm font-semibold text-muted">{leadName}</span>
          </h2>
          {state.status === "error" ? (
            <div className="mt-4">
              <Notice variant="warning" role="alert">
                {state.message || c.calls.loadFailed}
              </Notice>
            </div>
          ) : (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted">
              <Spinner />
              {c.calls.loading}
            </p>
          )}
          <div className="mt-5 flex justify-end">
            <Button variant="outline" onClick={onClose}>
              {c.calls.cancel}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** The dialog's form once the context is loaded (presentational; tested with static markup). */
export function CallOutcomeForm({
  titleId,
  ctx,
  leadName,
  taskId,
  taskTitle,
  pending,
  error,
  locale,
  c,
  onSubmit,
  onCancel,
}: {
  titleId: string;
  ctx: FollowUpContextView;
  leadName: string;
  taskId: string | null;
  taskTitle?: string | null;
  pending: boolean;
  error: string | null;
  locale: Locale;
  c: CallsMessages;
  onSubmit: (input: OutcomeInput) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const k = c.calls;
  const [form, setForm] = useState<CallFormState>({ outcome: null, note: "", picker: pickerFromSuggestion(null), markWrongNumber: true, markNotReachable: false });
  const [issue, setIssue] = useState<CallFormIssue | null>(null);
  const firstTile = useRef<HTMLInputElement>(null);
  const suggestion = suggestionFor(ctx, form.outcome);
  const fromTask = Boolean(taskId);
  const choices: CallOutcomeChoice[] = fromTask ? [...CALL_OUTCOMES, "no_call"] : [...CALL_OUTCOMES];
  const showPicker = form.outcome !== null && pickerVisible(form, ctx);
  const offerNotReachable = notReachableOffered(form.outcome, ctx);
  const outside = showPicker && pickerOutsideHours(form.picker, ctx);

  useEffect(() => {
    firstTile.current?.focus();
  }, []);

  function chooseOutcome(outcome: CallOutcomeChoice) {
    setIssue(null);
    setForm((current) => ({
      ...current,
      outcome,
      // The suggestion for this outcome is pre-selected; staff can change it.
      picker: pickerFromSuggestion(suggestionFor(ctx, outcome)),
      markWrongNumber: true,
      markNotReachable: false,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = buildCallOutcome(form, ctx, taskId);
    if (!built.ok) {
      setIssue(built.issue);
      if (built.issue === "outcomeRequired") firstTile.current?.focus();
      else if (built.issue === "noteTooLong") document.getElementById(`${id}-note`)?.focus();
      return;
    }
    setIssue(null);
    onSubmit(built.input);
  }

  const outcomeIssue = issue === "outcomeRequired" ? k.outcomeRequired : null;
  const noteIssue = issue === "noteTooLong" ? format(k.noteTooLong, { max: OUTCOME_NOTE_MAX }) : null;
  const pickerIssueShown = issue !== null && issue !== "outcomeRequired" && issue !== "noteTooLong";

  return (
    <form onSubmit={submit} noValidate className="p-5 md:p-6" aria-busy={pending || undefined}>
      <h2 id={titleId} className="text-lg font-extrabold text-navy">
        {fromTask ? k.titleTask : k.titleCall}
        <span className="block text-base font-bold text-ink">{leadName}</span>
      </h2>
      <AttemptLine attempts={ctx.attempts} c={k} />
      {fromTask && taskTitle && <p className="mt-1 text-sm text-muted">{format(k.taskLine, { title: taskTitle })}</p>}

      <fieldset className="mt-4" aria-describedby={outcomeIssue ? `${id}-outcome-issue` : undefined}>
        <legend className={labelClasses}>{k.whatHappened}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {choices.map((value, index) => (
            <label key={value} className={cn(tile, value === "no_call" && "sm:col-span-2")}>
              <input
                ref={index === 0 ? firstTile : undefined}
                type="radio"
                name={`${id}-outcome`}
                value={value}
                checked={form.outcome === value}
                onChange={() => chooseOutcome(value)}
                className="size-4 shrink-0 accent-[#1768d4]"
              />
              <span className="text-sm font-semibold">{value === "no_call" ? k.noCallNeeded : k.outcomes[value]}</span>
            </label>
          ))}
        </div>
        {outcomeIssue && (
          <p id={`${id}-outcome-issue`} role="alert" className="mt-2 text-sm font-semibold text-danger">
            {outcomeIssue}
          </p>
        )}
      </fieldset>

      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className={labelClasses}>
          {k.note}
        </label>
        <textarea
          id={`${id}-note`}
          value={form.note}
          rows={3}
          maxLength={OUTCOME_NOTE_MAX}
          placeholder={k.notePlaceholder}
          aria-invalid={noteIssue ? true : undefined}
          aria-describedby={noteIssue ? `${id}-note-issue` : undefined}
          onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
          className={cn(fieldClasses, "min-h-20")}
        />
        {noteIssue && (
          <p id={`${id}-note-issue`} role="alert" className="text-sm font-semibold text-danger">
            {noteIssue}
          </p>
        )}
      </div>

      {offerNotReachable && (
        <div className="mt-4">
          <NotReachableHint
            id={`${id}-unreachable`}
            streak={streakAfter(ctx.attempts, form.outcome === "no_call" ? null : form.outcome) || ctx.attempts.unansweredStreak}
            checked={form.markNotReachable}
            onChange={(checked) => setForm((current) => ({ ...current, markNotReachable: checked }))}
            c={k}
          />
        </div>
      )}

      {form.outcome === "wrong_number" && (
        <div className="mt-4 rounded-control border border-line bg-[#f4f7fb] p-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={form.markWrongNumber}
              aria-describedby={`${id}-wrong-hint`}
              onChange={(event) => setForm((current) => ({ ...current, markWrongNumber: event.target.checked }))}
              className="size-4 accent-[#1768d4]"
            />
            {k.markLostWrong}
          </label>
          <p id={`${id}-wrong-hint`} className="text-xs text-muted">
            {k.markLostWrongHint}
          </p>
        </div>
      )}

      {showPicker && (
        <div className="mt-4">
          <NextFollowUpPicker
            idBase={id}
            ctx={ctx}
            state={form.picker}
            onChange={(picker) => {
              setIssue(null);
              setForm((current) => ({ ...current, picker }));
            }}
            suggestion={suggestion}
            showIssue={pickerIssueShown}
            locale={locale}
            c={k}
          />
        </div>
      )}

      <ActionFeedback status="" error={error} className="mt-3" />
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {k.cancel}
        </Button>
        <Button type="submit" variant="dark" disabled={pending}>
          {pending && <Spinner />}
          {outside ? k.saveAnyway : k.save}
        </Button>
      </div>
    </form>
  );
}
