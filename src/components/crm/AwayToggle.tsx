"use client";

import { CalendarOff, UserCheck } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { AVAILABILITY_MAX_DAYS, AVAILABILITY_NOTE_MAX } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "./client-kit";
import { formatDate, istDayKey, istDayStart, type CrmMessages } from "./format";
import { leadOpsRequests } from "./lead-ops-api";

export type AwayMessages = Pick<CrmMessages, "away" | "common" | "errors">;

const DAY_MS = 86_400_000;

/**
 * "Away until …" (docs/lead-routing-plan.md §13.7, A5): a person marks themselves away so new
 * families go to colleagues; "I'm back" clears it. The day chosen is the day they are BACK (away
 * until 00:00 IST that day), at most 60 days ahead. Writes PUT /api/crm/availability (the server
 * checks who may set whose availability).
 */
export function validateAwayDay(day: string, now: number): "untilRequired" | "past" | "tooFar" | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(istDayStart(day))) return "untilRequired";
  const today = istDayKey(now);
  if (day <= today) return "past";
  if (istDayStart(day) - istDayStart(today) > AVAILABILITY_MAX_DAYS * DAY_MS) return "tooFar";
  return null;
}

export function AwayToggle({
  userId,
  awayUntil,
  pagePath,
  t,
}: {
  userId: string;
  /** ISO, or null when available. */
  awayUntil: string | null;
  /** LOCALE-FREE path to come back to after signing in again. */
  pagePath: string;
  t: AwayMessages;
}) {
  const locale = useLocale();
  const id = useId();
  const action = useCrmAction(t, pagePath);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const a = t.away;
  const away = awayUntil !== null && Date.parse(awayUntil) > 0;
  const until = away ? formatDate(awayUntil, locale) ?? "" : "";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateAwayDay(day, Date.now());
    if (problem) {
      setIssue(problem === "tooFar" ? format(a.tooFar, { days: AVAILABILITY_MAX_DAYS }) : a[problem]);
      return;
    }
    setIssue(null);
    const result = await action.run(
      leadOpsRequests.setAvailability({ userId, awayUntil: new Date(istDayStart(day)).toISOString(), note: note.trim() || null }),
      format(a.saved, { date: formatDate(istDayStart(day), locale) ?? day }),
    );
    if (result !== null) setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5 font-semibold text-[#354b66]">
        {away ? <CalendarOff aria-hidden="true" className="size-4" /> : <UserCheck aria-hidden="true" className="size-4" />}
        <span className="sr-only">{a.label}: </span>
        {away ? format(a.awayUntil, { date: until }) : a.available}
      </span>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={action.pending}>
        {away ? a.change : a.set}
      </Button>
      {away && (
        <Button
          variant="outline"
          disabled={action.pending}
          onClick={() => action.run(leadOpsRequests.setAvailability({ userId, awayUntil: null }), a.cleared)}
        >
          {a.clear}
        </Button>
      )}
      <ActionFeedback status={action.status} error={action.error} />
      <CrmDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)}>
        <form onSubmit={save} noValidate className="space-y-4 p-5 md:p-6">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {a.title}
          </h2>
          <p className="text-sm text-muted">{a.intro}</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-day`} className={labelClasses}>
              {a.until}
            </label>
            <input
              id={`${id}-day`}
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              aria-invalid={issue ? true : undefined}
              aria-describedby={issue ? `${id}-issue` : undefined}
              className={fieldClasses}
            />
            {issue && (
              <p id={`${id}-issue`} role="alert" className="text-sm font-semibold text-danger">
                {issue}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-note`} className={labelClasses}>
              {a.note}
            </label>
            <input
              id={`${id}-note`}
              value={note}
              maxLength={AVAILABILITY_NOTE_MAX}
              placeholder={a.notePlaceholder}
              onChange={(event) => setNote(event.target.value)}
              className={fieldClasses}
            />
          </div>
          <ActionFeedback status="" error={action.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending}>
              {action.pending ? t.common.saving : a.save}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </div>
  );
}
