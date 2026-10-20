"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { addDays, dateRange, dayNumber, fromDayNumber, weekStart, type DateKey } from "@/lib/planner/dates";
import { planDayFor } from "@/lib/planner/plan";
import { isBitSet, type PlannerState } from "@/lib/planner/state";
import type { DayKind, StudyPlan } from "@/lib/planner/types";
import { BlockList } from "./BlockList";
import { DAY_KIND_STYLE, formatDate, LONG_DATE, SHORT_DATE, type PlannerData, type PlannerMessages } from "./model";

type View = "week" | "month";
const KINDS: DayKind[] = ["study", "revision", "mock", "buffer", "light"];

function monthStart(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

function addMonths(key: DateKey, months: number): DateKey {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)) - 1 + months;
  return fromDayNumber(Math.round(Date.UTC(year, month, 1) / 86_400_000));
}

function visibleDays(view: View, anchor: DateKey): DateKey[] {
  if (view === "week") {
    const start = weekStart(anchor);
    return dateRange(start, addDays(start, 6));
  }
  const first = monthStart(anchor);
  const last = addDays(addMonths(first, 1), -1);
  return dateRange(weekStart(first), addDays(weekStart(last), 6));
}

export function CalendarView({
  t,
  locale,
  data,
  today,
  state,
  plan,
  onToggle,
}: {
  t: PlannerMessages;
  locale: Locale;
  data: PlannerData;
  today: DateKey;
  state: PlannerState;
  plan: StudyPlan;
  onToggle: (index: number, done: boolean) => void;
}) {
  const id = useId();
  const [view, setView] = useState<View>("month");
  const [selected, setSelected] = useState<DateKey>(today);
  const focusPending = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const examDate = state.settings!.examDate;

  const days = visibleDays(view, selected);
  const anchorMonth = selected.slice(0, 7);
  const selectedDay = planDayFor(plan, selected);

  // After arrow-key navigation, move focus to the newly selected day (roving tabindex).
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus();
  }, [selected, view]);

  function move(delta: number) {
    setSelected((current) => (view === "week" ? addDays(current, delta * 7) : addMonths(current, delta)));
  }

  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    focusPending.current = true;
    setSelected((current) => addDays(current, step));
  }

  const heading =
    view === "month"
      ? new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
          new Date(dayNumber(monthStart(selected)) * 86_400_000),
        )
      : `${formatDate(days[0], locale, SHORT_DATE)} – ${formatDate(days[6], locale, SHORT_DATE)}`;

  const weekdayNames = days.slice(0, 7).map((d) => formatDate(d, locale, { weekday: "short" }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl font-bold text-navy" aria-live="polite">
          {heading}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t.calendar.title} className="inline-flex rounded-control border border-[#b9cbe0] bg-white p-0.5">
            {(["week", "month"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`min-h-9 rounded-[8px] px-3 text-sm font-semibold ${view === value ? "bg-navy text-white" : "text-navy hover:bg-blue-soft"}`}
              >
                {t.calendar[value]}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => move(-1)} aria-label={t.calendar.previous}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(today)}>
            {t.calendar.jumpToday}
          </Button>
          <Button size="sm" variant="outline" onClick={() => move(1)} aria-label={t.calendar.next}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      <div>
        <div aria-hidden="true" className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-semibold uppercase text-muted">
          {weekdayNames.map((name, index) => (
            <span key={index}>{name}</span>
          ))}
        </div>
        <div ref={gridRef} role="group" aria-label={heading} onKeyDown={onGridKey} className="grid grid-cols-7 gap-1">
          {days.map((date) => {
            const planDay = planDayFor(plan, date);
            const isExam = date === examDate;
            const outside = view === "month" && date.slice(0, 7) !== anchorMonth;
            const total = planDay?.blocks.length ?? 0;
            const done = planDay ? planDay.blocks.filter((b) => isBitSet(state.done[date], b.index)).length : 0;
            const kindLabel = isExam ? t.calendar.examDay : planDay ? t.dayKinds[planDay.kind] : t.calendar.noPlan;
            const label = `${formatDate(date, locale, LONG_DATE)} · ${kindLabel}${total && date <= today ? ` · ${format(t.calendar.doneOf, { done, total })}` : ""}`;
            const style = isExam
              ? "bg-gold text-ink border-gold-2"
              : planDay
                ? DAY_KIND_STYLE[planDay.kind]
                : "bg-white text-[#9fb2c8] border-line";
            return (
              <button
                key={date}
                type="button"
                data-date={date}
                tabIndex={date === selected ? 0 : -1}
                aria-pressed={date === selected}
                aria-current={date === today ? "date" : undefined}
                aria-label={label}
                title={label}
                onClick={() => setSelected(date)}
                className={`relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md border px-0.5 py-1 text-sm font-semibold ${style} ${
                  outside ? "opacity-45" : ""
                } ${date === selected ? "ring-2 ring-navy ring-offset-1" : ""} ${view === "week" ? "sm:min-h-20" : "sm:min-h-14"}`}
              >
                <span className={date === today ? "rounded-full bg-navy px-1.5 text-white" : ""}>{Number(date.slice(8))}</span>
                {view === "week" && (
                  <span aria-hidden="true" className="mt-0.5 hidden max-w-full truncate text-[11px] font-medium sm:block">
                    {kindLabel}
                  </span>
                )}
                {total > 0 && date <= today && (
                  <span aria-hidden="true" className="text-[10px] font-medium leading-tight">
                    {done}/{total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="sr-only" id={`${id}-legend`}>
          {t.calendar.legend}
        </h3>
        <ul aria-labelledby={`${id}-legend`} className="flex flex-wrap gap-2 text-xs">
          {KINDS.map((kind) => (
            <li key={kind} className={`rounded-full border px-2.5 py-1 font-semibold ${DAY_KIND_STYLE[kind]}`}>
              {t.dayKinds[kind]}
            </li>
          ))}
          <li className="rounded-full border border-gold-2 bg-gold px-2.5 py-1 font-semibold text-ink">{t.calendar.examDay}</li>
        </ul>
      </div>

      <section aria-labelledby={`${id}-day`} className="rounded-card border border-line bg-surface p-4">
        <h3 id={`${id}-day`} className="font-extrabold text-navy">
          {format(t.calendar.dayDetails, { date: formatDate(selected, locale, LONG_DATE) })}
          {selectedDay && <span className="ml-2 text-sm font-semibold text-muted">· {t.dayKinds[selectedDay.kind]}</span>}
        </h3>
        <div className="mt-3">
          {selectedDay ? (
            <>
              <BlockList
                t={t}
                data={data}
                day={selectedDay}
                mask={state.done[selected]}
                onToggle={selected === today ? onToggle : undefined}
              />
              {selected !== today && <p className="mt-2 text-xs text-muted">{t.calendar.readOnly}</p>}
            </>
          ) : (
            <p className="text-sm text-muted">{selected === examDate ? t.today.examDay : t.today.noBlocks}</p>
          )}
        </div>
      </section>
    </div>
  );
}
