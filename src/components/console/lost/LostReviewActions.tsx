"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { focusIfLost, useOutcomeStatus } from "@/components/console/calls/outcome-status";
import { familyRequests } from "@/components/console/details/api";
import type { FamilyMessages } from "@/components/console/details/messages";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "@/components/crm/client-kit";
import { istDueAt, type CrmMessages } from "@/components/crm/format";
import { Button } from "@/components/ui";
import { format } from "@/i18n/format";
import { REOPEN_FOLLOW_UP_PRESETS, REOPEN_STAGES, type ReopenFollowUp, type ReopenStage } from "@/lib/crm/console/lost/types";
import type { LeadStage } from "@/lib/crm/types";

type Option = { value: string; label: string };
type FollowUpChoice = (typeof REOPEN_FOLLOW_UP_PRESETS)[number] | "pick";

function Spinner() {
  return <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />;
}

/** "HH:MM" inside decision 9's outer limit (08:00–21:00 IST, both ends allowed). */
export function insideHardWindow(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hours, minutes] = time.split(":").map(Number);
  const total = hours * 60 + minutes;
  return total >= 8 * 60 && total <= 21 * 60;
}

/**
 * The review buttons of one lost event (docs/admin-phase-1b-plan.md §5.H; owner: 1B-FAMILY):
 * "Keep lost" (one click) and "Reopen…" (a dialog: stage to move back to — never Enrolled —, who
 * holds it, when to follow up). After a save the page refreshes and this row goes away, so the
 * result is announced by the list's status region and focus moves to the list heading.
 */
export function LostReviewActions({
  leadId,
  lostAt,
  name,
  fromStage,
  assignee,
  staff,
  f,
  t,
  pagePath,
  today,
}: {
  leadId: string;
  lostAt: string;
  name: string;
  fromStage: LeadStage | null;
  assignee: { userId: string; displayName: string } | null;
  /** People lead routing lets this viewer hand the enquiry to (the server re-checks eligibility). */
  staff: Option[];
  f: FamilyMessages["lost"];
  t: Pick<CrmMessages, "errors" | "common" | "stages">;
  /** LOCALE-FREE path + query of the list. */
  pagePath: string;
  /** Today's IST date (`YYYY-MM-DD`), the earliest pickable date. */
  today: string;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const region = useOutcomeStatus();
  const saved = useRef(false);
  const keep = useCrmAction(t, pagePath);
  const reopen = useCrmAction(t, pagePath);
  const [open, setOpen] = useState(false);
  const defaultStage: ReopenStage = (REOPEN_STAGES as readonly string[]).includes(fromStage ?? "") ? (fromStage as ReopenStage) : "contacted";
  const [stage, setStage] = useState<ReopenStage>(defaultStage);
  const [assignTo, setAssignTo] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpChoice>("tomorrow");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [issue, setIssue] = useState<"pickRequired" | "hardWindow" | "assigneeInvalid" | null>(null);
  const focusTargetId = region?.focusTargetId ?? null;

  useEffect(
    () => () => {
      // Unmounted after a save: the row (and the button that held focus) is gone.
      if (saved.current) window.requestAnimationFrame(() => focusIfLost(focusTargetId));
    },
    [focusTargetId],
  );

  function done(message: string) {
    saved.current = true;
    region?.announce(message);
  }

  async function keepLost() {
    region?.announce("");
    const data = await keep.run(familyRequests.keepLost(leadId, lostAt), f.kept);
    if (data !== null) done(f.kept);
  }

  function openDialog() {
    region?.announce("");
    reopen.reset();
    setStage(defaultStage);
    setAssignTo("");
    setFollowUp("tomorrow");
    setDate(today);
    setTime("");
    setIssue(null);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let next: ReopenFollowUp;
    if (followUp === "pick") {
      const at = time ? istDueAt(date, time) : null;
      if (!at) {
        setIssue("pickRequired");
        document.getElementById(`${id}-date`)?.focus();
        return;
      }
      if (!insideHardWindow(time)) {
        setIssue("hardWindow");
        document.getElementById(`${id}-time`)?.focus();
        return;
      }
      next = { kind: "at", at };
    } else {
      next = { kind: "preset", preset: followUp };
    }
    setIssue(null);
    const data = await reopen.run(familyRequests.reopenLost(leadId, { lostAt, reopenTo: stage, assigneeId: assignTo || null, followUp: next }), f.reopened, (failure) => {
      if (failure.status !== 422) return null;
      if ("assigneeId" in failure.fieldErrors) {
        setIssue("assigneeInvalid");
        return f.assigneeInvalid;
      }
      if ("followUp" in failure.fieldErrors) {
        setIssue("hardWindow");
        return f.hardWindow;
      }
      return null;
    });
    if (data === null) return;
    setOpen(false);
    done(f.reopened);
  }

  const issueId = `${id}-issue`;
  const others = staff.filter((option) => option.value !== assignee?.userId);
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={keepLost} disabled={keep.pending} aria-label={format(f.keepLabel, { name })}>
          {keep.pending && <Spinner />}
          {f.keep}
        </Button>
        <Button variant="dark" onClick={openDialog} aria-label={format(f.reopenLabel, { name })}>
          {f.reopen}
        </Button>
      </div>
      <p role="alert" className="text-sm font-semibold text-danger">
        {keep.error ?? ""}
      </p>
      <CrmDialog open={open} titleId={titleId} onClose={() => setOpen(false)}>
        <form onSubmit={submit} noValidate className="p-5 md:p-6" aria-busy={reopen.pending || undefined}>
          <h2 id={titleId} className="text-lg font-extrabold text-navy">
            {f.reopenTitle}
          </h2>
          <p className="mt-1 text-sm font-semibold text-ink">{name}</p>
          <p className="mt-2 text-sm text-muted">{f.reopenIntro}</p>
          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-stage`} className={labelClasses}>
                {f.moveTo}
              </label>
              <select id={`${id}-stage`} value={stage} onChange={(event) => setStage(event.target.value as ReopenStage)} aria-describedby={`${id}-stage-hint`} className={fieldClasses}>
                {REOPEN_STAGES.map((value) => (
                  <option key={value} value={value}>
                    {t.stages[value]}
                  </option>
                ))}
              </select>
              <p id={`${id}-stage-hint`} className="text-xs text-muted">
                {f.moveToHint}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-assignee`} className={labelClasses}>
                {f.assignTo}
              </label>
              <select
                id={`${id}-assignee`}
                value={assignTo}
                onChange={(event) => setAssignTo(event.target.value)}
                aria-invalid={issue === "assigneeInvalid" ? true : undefined}
                aria-describedby={issue === "assigneeInvalid" ? issueId : undefined}
                className={fieldClasses}
              >
                <option value="">{assignee ? format(f.keepAssignee, { name: assignee.displayName }) : f.keepUnassigned}</option>
                {others.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className={labelClasses}>{f.followUp}</legend>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {([...REOPEN_FOLLOW_UP_PRESETS, "pick"] as const).map((choice) => (
                  <label
                    key={choice}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-[#b9cbe0] bg-white px-3 text-sm has-[:checked]:border-blue has-[:checked]:bg-[#edf4ff] has-[:checked]:font-bold"
                  >
                    <input type="radio" name={`${id}-follow-up`} value={choice} checked={followUp === choice} onChange={() => setFollowUp(choice)} className="size-4 accent-blue" />
                    {f.followUpPresets[choice]}
                  </label>
                ))}
              </div>
            </fieldset>
            {followUp === "pick" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-date`} className={labelClasses}>
                    {f.pickDate}
                  </label>
                  <input
                    id={`${id}-date`}
                    type="date"
                    min={today}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    aria-invalid={issue === "pickRequired" ? true : undefined}
                    aria-describedby={issue === "pickRequired" ? issueId : undefined}
                    className={fieldClasses}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-time`} className={labelClasses}>
                    {f.pickTime}
                  </label>
                  <input
                    id={`${id}-time`}
                    type="time"
                    min="08:00"
                    max="21:00"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    aria-invalid={issue === "pickRequired" || issue === "hardWindow" ? true : undefined}
                    aria-describedby={issue === "pickRequired" || issue === "hardWindow" ? issueId : undefined}
                    className={fieldClasses}
                  />
                </div>
              </div>
            )}
            <p id={issueId} className="text-sm font-semibold text-danger">
              {issue ? f[issue] : ""}
            </p>
          </div>
          <ActionFeedback status="" error={issue ? null : reopen.error} className="mt-1" />
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={reopen.pending}>
              {reopen.pending && <Spinner />}
              {f.reopenConfirm}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </div>
  );
}
