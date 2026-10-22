"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { CALLING_HOURS_LIMITS, WEEKDAYS, type CallingHours } from "@/lib/crm/lead-ops-types";
import { fieldClasses, labelClasses } from "../client-kit";
import { formatDate } from "../format";
import { addClosedDate, setDay, type SpeedMessages } from "./model";

/**
 * "Hours when executives are at their phones" (owner: LR-SLA; docs/lead-routing-plan.md §15, Q1,
 * A7): one window per weekday (open, from, until; India time) and closed dates. Controlled: the
 * parent form owns the value and saves it. `disabled` = read-only for area heads and admins.
 */
export function CallingHoursEditor({
  value,
  onChange,
  disabled,
  issues,
  locale,
  t,
}: {
  value: CallingHours;
  onChange: (next: CallingHours) => void;
  disabled: boolean;
  /** Field → message (`week`, `week.mon`, `closedDates`). */
  issues: Readonly<Record<string, string>>;
  locale: Locale;
  t: SpeedMessages["hours"];
}) {
  const id = useId();
  const [date, setDate] = useState("");
  const [dateIssue, setDateIssue] = useState<string | null>(null);

  function addDate() {
    const result = addClosedDate(value, date, t);
    if (!result.ok) {
      setDateIssue(result.issue);
      return;
    }
    setDateIssue(null);
    setDate("");
    onChange(result.value);
  }

  const closedIssue = dateIssue ?? issues.closedDates ?? null;
  return (
    <div className="space-y-5">
      <fieldset className="min-w-0" aria-describedby={issues.week ? `${id}-week-issue` : undefined}>
        <legend className={labelClasses}>{t.legend}</legend>
        {issues.week && (
          <p id={`${id}-week-issue`} role="alert" className="mt-1 text-sm font-semibold text-danger">
            {issues.week}
          </p>
        )}
        <ul className="mt-2 divide-y divide-line">
          {WEEKDAYS.map((day) => {
            const spec = value.week[day];
            const name = t.days[day];
            const issue = issues[`week.${day}`];
            const issueId = `${id}-${day}-issue`;
            return (
              <li key={day} className="flex flex-wrap items-end gap-x-4 gap-y-2 py-3">
                <label className="flex min-h-11 w-40 items-center gap-2 text-sm font-bold text-navy">
                  <input
                    type="checkbox"
                    checked={spec.open}
                    disabled={disabled}
                    onChange={(event) => onChange(setDay(value, day, { open: event.target.checked }))}
                    className="size-5 accent-[#0755b5]"
                  />
                  <span aria-hidden="true">{name}</span>
                  <span className="sr-only">{format(t.open, { day: name })}</span>
                </label>
                {spec.open ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${id}-${day}-start`} className="text-xs font-bold text-muted">
                        {format(t.from, { day: name })}
                      </label>
                      <input
                        id={`${id}-${day}-start`}
                        type="time"
                        step={300}
                        value={spec.start}
                        disabled={disabled}
                        aria-invalid={issue ? true : undefined}
                        aria-describedby={issue ? issueId : undefined}
                        onChange={(event) => onChange(setDay(value, day, { start: event.target.value }))}
                        className={`${fieldClasses} w-32`}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${id}-${day}-end`} className="text-xs font-bold text-muted">
                        {format(t.to, { day: name })}
                      </label>
                      <input
                        id={`${id}-${day}-end`}
                        type="time"
                        step={300}
                        value={spec.end}
                        disabled={disabled}
                        aria-invalid={issue ? true : undefined}
                        aria-describedby={issue ? issueId : undefined}
                        onChange={(event) => onChange(setDay(value, day, { end: event.target.value }))}
                        className={`${fieldClasses} w-32`}
                      />
                    </div>
                  </>
                ) : (
                  <p className="min-h-11 py-2.5 text-sm text-muted">{t.closedDay}</p>
                )}
                {issue && (
                  <p id={issueId} className="w-full text-sm font-semibold text-danger">
                    {issue}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className={labelClasses}>{t.closedDates}</legend>
        <p className="mt-1 text-sm text-muted">{format(t.closedDatesHint, { max: CALLING_HOURS_LIMITS.closedDates })}</p>
        {value.closedDates.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t.noClosedDates}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {value.closedDates.map((day) => {
              const label = formatDate(`${day}T06:30:00.000Z`, locale) ?? day;
              return (
                <li key={day} className="inline-flex items-center gap-1 rounded-control border border-line bg-surface py-1 pr-1 pl-3 text-sm font-semibold">
                  <time dateTime={day}>{label}</time>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...value, closedDates: value.closedDates.filter((other) => other !== day) })}
                      aria-label={format(t.removeDate, { date: label })}
                      className="inline-flex size-11 items-center justify-center rounded-control text-muted hover:text-danger"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!disabled && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-closed-date`} className="text-xs font-bold text-muted">
                {t.addDate}
              </label>
              <input
                id={`${id}-closed-date`}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-invalid={closedIssue ? true : undefined}
                aria-describedby={closedIssue ? `${id}-closed-issue` : undefined}
                className={`${fieldClasses} w-44`}
              />
            </div>
            <button
              type="button"
              onClick={addDate}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-[#b9cbe0] bg-white px-3 text-sm font-bold text-navy hover:border-blue"
            >
              <Plus aria-hidden="true" className="size-4" />
              {t.addDate}
            </button>
          </div>
        )}
        {closedIssue && (
          <p id={`${id}-closed-issue`} role="alert" className="mt-2 text-sm font-semibold text-danger">
            {closedIssue}
          </p>
        )}
      </fieldset>
    </div>
  );
}
