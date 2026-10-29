"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import { fieldClasses, labelClasses } from "@/components/crm/client-kit";
import { istDayKey } from "@/components/crm/format";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import type { RhythmSuggestion } from "@/lib/crm/console/followup/rhythm";
import type { FollowUpContextView } from "@/lib/crm/console/followup/types";
import type { CallsMessages } from "./messages";
import { outsideHoursText, pickerIssue, whenLabel, type PickerChoice, type PickerIssue, type PickerState } from "./outcome-form";

const tile =
  "flex min-h-11 cursor-pointer items-start gap-2 rounded-control border border-line px-3 py-2.5 has-checked:border-blue has-checked:bg-blue-soft";

/**
 * "Next follow-up" (required radio group, docs/admin-phase-1b-plan.md §5.C step 4): Later today /
 * Tomorrow / In 3 days (each with its resolved time), Pick a time (date + time, India time), Keep the
 * existing follow-up (when the lead has another open task) and, for a closed enquiry, no follow-up.
 * The suggested option carries its reason. A time outside calling hours gets a warning ("Save
 * anyway?"); outside 08:00–21:00 IST it is refused. Text, never colour alone.
 */
export function NextFollowUpPicker({
  idBase,
  ctx,
  state,
  onChange,
  suggestion,
  showIssue,
  locale,
  c,
}: {
  idBase: string;
  ctx: FollowUpContextView;
  state: PickerState;
  onChange: (state: PickerState) => void;
  suggestion: RhythmSuggestion | null;
  /** Show "choose one" / incomplete-pick issues (after a save attempt); time-limit issues always show. */
  showIssue: boolean;
  locale: Locale;
  c: CallsMessages["calls"];
}) {
  const now = Date.parse(ctx.now);
  const closed = ctx.stage === "enrolled" || ctx.stage === "lost";
  const live = pickerIssue(state, ctx);
  const visibleIssue: PickerIssue | null = live === "hardWindow" || live === "pastTime" ? live : showIssue ? live : null;
  const issueText = visibleIssue ? c[visibleIssue] : null;
  // The warning names the hours of the CHOSEN day (a short Sunday, a closed date), not today's.
  const outside = outsideHoursText(state, ctx, c);
  const suggested = suggestion && suggestion.choice !== "none" ? suggestion.choice : closed ? "none" : null;
  const hint = suggestion ? c.rules[suggestion.ruleKey] : null;

  const option = (choice: PickerChoice, label: string, detail?: string | null) => (
    <label key={choice} className={tile}>
      <input
        type="radio"
        name={`${idBase}-next`}
        value={choice}
        checked={state.choice === choice}
        onChange={() => onChange({ ...state, choice })}
        className="mt-0.5 size-4 shrink-0 accent-[#1768d4]"
      />
      <span className="min-w-0 text-sm">
        <span className="font-semibold text-ink">{label}</span>
        {detail && <span className="block text-muted">{detail}</span>}
        {suggested === choice && hint && (
          <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-navy">
            <Sparkles aria-hidden="true" className="size-3.5" />
            {hint}
          </span>
        )}
      </span>
    </label>
  );

  const at = (iso: string) => whenLabel(Date.parse(iso), now, locale, c);
  const keepDue = ctx.openTask?.dueAt ? whenLabel(Date.parse(ctx.openTask.dueAt), now, locale, c) : null;

  return (
    <fieldset aria-describedby={issueText ? `${idBase}-next-issue` : undefined}>
      <legend className={labelClasses}>{c.next}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {option("later_today", c.laterToday, at(ctx.presets.later_today))}
        {option("tomorrow", c.tomorrow, at(ctx.presets.tomorrow))}
        {option("in_3_days", c.in3Days, at(ctx.presets.in_3_days))}
        {option("pick", c.pick)}
        {ctx.openTask && option("keep", keepDue ? format(c.keepExisting, { due: keepDue }) : c.keepExistingNoDue, ctx.openTask.title)}
        {closed && option("none", c.rules.closed)}
      </div>
      {state.choice === "pick" && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idBase}-date`} className={labelClasses}>
              {c.pickDate}
            </label>
            <input
              id={`${idBase}-date`}
              type="date"
              value={state.date}
              min={istDayKey(now)}
              aria-invalid={visibleIssue ? true : undefined}
              aria-describedby={issueText ? `${idBase}-next-issue` : undefined}
              onChange={(event) => onChange({ ...state, date: event.target.value })}
              className={fieldClasses}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idBase}-time`} className={labelClasses}>
              {c.pickTime}
            </label>
            <input
              id={`${idBase}-time`}
              type="time"
              value={state.time}
              min="08:00"
              max="21:00"
              aria-invalid={visibleIssue ? true : undefined}
              aria-describedby={issueText ? `${idBase}-next-issue` : undefined}
              onChange={(event) => onChange({ ...state, time: event.target.value })}
              className={fieldClasses}
            />
          </div>
        </div>
      )}
      {issueText && (
        <p id={`${idBase}-next-issue`} role="alert" className="mt-2 text-sm font-semibold text-danger">
          {issueText}
        </p>
      )}
      <p role="status" className={cn("text-sm font-semibold text-[#7a4b00]", outside && !issueText ? "mt-2 flex items-start gap-1.5" : "sr-only")}>
        {outside && !issueText && (
          <>
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {outside}
          </>
        )}
      </p>
    </fieldset>
  );
}
