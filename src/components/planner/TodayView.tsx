"use client";

import { CalendarClock, Flame, Snowflake, Sparkles, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { AskRanchoLink } from "@/components/home/HomeToolsAskRancho";
import { Badge, Button, ButtonLink } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { DueItems } from "@/lib/planner/actions";
import { diffDays, type DateKey } from "@/lib/planner/dates";
import { planDayFor } from "@/lib/planner/plan";
import { computeStreak, consistency, totalXp, weeklyXp, XP } from "@/lib/planner/progress";
import { isBitSet, type PlannerState } from "@/lib/planner/state";
import type { StudyPlan } from "@/lib/planner/types";
import { BlockList } from "./BlockList";
import { formatDate, formatNumber, LONG_DATE, SHORT_DATE, type PlannerData, type PlannerMessages } from "./model";
import { plannerRanchoDetail } from "./rancho";

function Stat({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-white p-4 shadow-soft">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold text-navy">{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

export function TodayView({
  t,
  locale,
  data,
  today,
  state,
  plan,
  due,
  mockTestsHref,
  onToggle,
  onStartReview,
}: {
  t: PlannerMessages;
  locale: Locale;
  data: PlannerData;
  today: DateKey;
  state: PlannerState;
  plan: StudyPlan;
  due: DueItems;
  mockTestsHref: string;
  onToggle: (index: number, done: boolean) => void;
  onStartReview: () => void;
}) {
  const settings = state.settings!;
  const exam = t.exams[settings.exam];
  const daysLeft = diffDays(today, settings.examDate);
  const day = planDayFor(plan, today);
  const mask = state.done[today];
  const doneCount = day ? day.blocks.filter((b) => isBitSet(mask, b.index)).length : 0;
  const allDone = !!day && day.blocks.length > 0 && doneCount === day.blocks.length;
  const streak = computeStreak(state.activity, today);
  const strip = consistency(state.activity, today, 14);
  const frozen = new Set(streak.frozenDates);
  const n = (value: number) => formatNumber(value, locale);
  const dueTotal = due.topics.length + due.cards.length;
  // Exam, days left and today's topic names only (./rancho.ts); none on days without topics.
  const ranchoDetail = day
    ? plannerRanchoDetail(
        { exam: settings.exam, daysLeft, day, data, locale },
        {
          exams: t.exams,
          subjects: t.subjects,
          askRanchoPrompt: t.today.askRanchoPrompt,
          askRanchoContext: t.today.askRanchoContext,
          askRanchoContextTomorrow: t.today.askRanchoContextTomorrow,
        },
      )
    : null;

  let countdown: string;
  if (daysLeft > 1) countdown = format(t.today.countdown, { days: n(daysLeft), exam });
  else if (daysLeft === 1) countdown = format(t.today.countdownTomorrow, { exam });
  else if (daysLeft === 0) countdown = t.today.examDay;
  else countdown = t.today.examPassed;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-navy p-5 text-white">
        <div className="min-w-0">
          <p className="text-sm text-[#b9d3f3]">{formatDate(today, locale, LONG_DATE)}</p>
          <p className="mt-1 flex items-center gap-2 text-xl font-extrabold">
            <CalendarClock aria-hidden="true" className="size-5 shrink-0 text-gold" />
            {countdown}
          </p>
        </div>
        {day && (
          <Badge variant="info" className="shrink-0">
            {t.dayKinds[day.kind]}
          </Badge>
        )}
      </div>

      <div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            icon={<Flame aria-hidden="true" className="size-4 text-[#d9480f]" />}
            label={t.stats.streak}
            value={n(streak.current)}
            note={`${format(t.stats.best, { days: n(streak.best) })} · ${format(t.stats.freezes, { count: n(streak.freezes) })}`}
          />
          <Stat icon={<Sparkles aria-hidden="true" className="size-4 text-[#b07d00]" />} label={t.stats.xpToday} value={n(state.activity[today]?.[0] ?? 0)} />
          <Stat icon={<Sparkles aria-hidden="true" className="size-4 text-[#b07d00]" />} label={t.stats.xpWeek} value={n(weeklyXp(state.activity, today))} />
          <Stat icon={<Trophy aria-hidden="true" className="size-4 text-[#b07d00]" />} label={t.stats.xpTotal} value={n(totalXp(state.activity))} />
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <Snowflake aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-blue" />
          {t.stats.freezeHelp}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start">
        <section aria-labelledby="planner-today-blocks" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="planner-today-blocks" className="text-lg font-extrabold text-navy">
              {t.today.blocksHeading}
            </h2>
            {day && day.blocks.length > 0 && (
              <p className="text-sm text-muted" aria-live="polite">
                {format(t.today.progress, { done: n(doneCount), total: n(day.blocks.length) })}
              </p>
            )}
          </div>
          <div className="mt-3">
            {day ? (
              <>
                <BlockList t={t} data={data} day={day} mask={mask} onToggle={onToggle} />
                <p className="mt-2 text-xs text-muted">{t.today.tickHint}</p>
                {ranchoDetail && (
                  <AskRanchoLink href={localePath("/tools/ask", locale)} detail={ranchoDetail} size="sm" className="mt-3">
                    {t.today.askRancho}
                  </AskRanchoLink>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">
                {today < settings.startDate ? format(t.today.beforeStart, { date: formatDate(settings.startDate, locale, LONG_DATE) }) : daysLeft >= 0 ? t.today.examDay : t.today.examPassed}
              </p>
            )}
            {allDone && (
              <p role="status" className="mt-3 rounded-control border border-[#bfe5cf] bg-success-soft p-3 text-sm font-semibold text-[#0f5a3c]">
                {format(t.today.allDone, { xp: XP.dailyGoalBonus })}
              </p>
            )}
          </div>
        </section>

        <div className="grid min-w-0 gap-4">
          <section aria-labelledby="planner-due" className="rounded-card border border-line bg-white p-4 shadow-soft">
            <h2 id="planner-due" className="font-extrabold text-navy">
              {t.today.due.title}
            </h2>
            {dueTotal > 0 ? (
              <>
                <ul className="mt-2 text-sm text-ink">
                  <li>{format(t.today.due.topics, { count: n(due.topics.length) })}</li>
                  <li>{format(t.today.due.cards, { count: n(due.cards.length) })}</li>
                </ul>
                <Button className="mt-3" size="sm" variant="dark" onClick={onStartReview}>
                  {t.today.due.start}
                </Button>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">{t.today.due.none}</p>
            )}
          </section>

          <section aria-labelledby="planner-dpp" className="rounded-card border border-dashed border-[#b9cbe0] bg-surface p-4">
            <h2 id="planner-dpp" className="font-extrabold text-navy">
              {t.today.dpp.title}
            </h2>
            <p className="mt-1 text-sm text-muted">{t.today.dpp.body}</p>
            <ButtonLink href={mockTestsHref} size="sm" variant="outline" className="mt-3">
              {t.today.dpp.cta}
            </ButtonLink>
          </section>
        </div>
      </div>

      <section aria-labelledby="planner-strip">
        <h2 id="planner-strip" className="text-sm font-bold text-navy">
          {t.today.strip}
        </h2>
        <ol className="mt-2 grid grid-cols-7 gap-1.5 sm:flex sm:flex-wrap">
          {strip.map((entry) => {
            const isFrozen = frozen.has(entry.date);
            const label = entry.active
              ? format(t.today.stripActive, { date: formatDate(entry.date, locale, SHORT_DATE), xp: n(entry.xp) })
              : isFrozen
                ? format(t.today.stripFrozen, { date: formatDate(entry.date, locale, SHORT_DATE) })
                : format(t.today.stripMissed, { date: formatDate(entry.date, locale, SHORT_DATE) });
            return (
              <li key={entry.date} title={label} className="sm:w-9">
                <span
                  aria-hidden="true"
                  className={`flex aspect-square items-center justify-center rounded-md border text-[11px] font-semibold ${
                    entry.active
                      ? "border-[#14845a] bg-success text-white"
                      : isFrozen
                        ? "border-[#b9d3f3] bg-blue-soft text-blue"
                        : "border-line bg-white text-muted"
                  } ${entry.date === today ? "outline-2 outline-offset-1 outline-navy" : ""}`}
                >
                  {isFrozen ? "❄" : Number(entry.date.slice(8))}
                </span>
                <span className="sr-only">{label}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
