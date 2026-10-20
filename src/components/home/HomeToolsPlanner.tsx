"use client";

import { useId, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { addDays, istDateKey, type DateKey } from "@/lib/planner/dates";
import { PLAN_LIMITS } from "@/lib/planner/plan";
import { EXAM_IDS, type ExamId } from "@/lib/planner/types";
import { countdownRanchoDetail, examCountdown, msUntilNextIstMidnight, splitTemplate, type ExamCountdown } from "./home-tools";
import { AskRanchoLink } from "./HomeToolsAskRancho";
import { controlClass, labelClass } from "./HomeToolsPredictor";

/** Strings from `planner` (form, exams, today) and `home.tools.planner`, picked on the server. */
export interface HomeToolsPlannerMessages {
  exam: string;
  exams: Record<ExamId, string>;
  examDate: string;
  prompt: string;
  daysLeft: string;
  today: string;
  tomorrow: string;
  past: string;
  tooFar: string;
  askRancho: string;
  askRanchoPrompt: string;
  askRanchoContext: string;
}

/**
 * Tells React to re-read "today" at the next IST midnight (then re-arms), and when the tab is
 * shown again (background tabs may delay timers), so an idle page rolls the countdown and the
 * date input's min / max over to the new day. Snapshots are strings, so a re-read that finds the
 * same day does not re-render.
 */
function subscribeToday(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    timer = setTimeout(() => {
      onChange();
      arm();
    }, msUntilNextIstMidnight(Date.now()));
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") onChange();
  };
  arm();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
/** Today in India time, read in the browser only (never during the server render, CLAUDE.md). */
const browserToday = (): DateKey => istDateKey(Date.now());
const serverToday = (): DateKey | null => null;

/**
 * Exam countdown for the homepage tools widget: exam + date → "N days to go", computed in the
 * browser with the planner's IST date helpers. Nothing is stored or sent, and the inputs have no
 * `name`, so nothing typed can reach a URL.
 */
export function HomeToolsPlanner({ locale, messages: t }: { locale: Locale; messages: HomeToolsPlannerMessages }) {
  const ids = useId();
  const today = useSyncExternalStore(subscribeToday, browserToday, serverToday);
  const [exam, setExam] = useState<ExamId>(EXAM_IDS[0]);
  const [examDate, setExamDate] = useState("");
  const countdown = examCountdown(examDate, today);
  const examLabel = t.exams[exam];
  const ranchoDetail = countdownRanchoDetail(countdown, examLabel, t);

  return (
    <div>
      <form onSubmit={(event) => event.preventDefault()} noValidate className="grid gap-3 @sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${ids}-exam`} className={labelClass}>
            {t.exam}
          </label>
          <select id={`${ids}-exam`} value={exam} onChange={(event) => setExam(event.target.value as ExamId)} className={controlClass}>
            {EXAM_IDS.map((option) => (
              <option key={option} value={option}>
                {t.exams[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-date`} className={labelClass}>
            {t.examDate}
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            autoComplete="off"
            min={today ?? undefined}
            max={today ? addDays(today, PLAN_LIMITS.maxDays) : undefined}
            value={examDate}
            onChange={(event) => setExamDate(event.target.value)}
            className={controlClass}
          />
        </div>
      </form>
      <div aria-live="polite" aria-atomic="true" className="mt-4">
        <CountdownView countdown={countdown} exam={examLabel} messages={t} />
      </div>
      {ranchoDetail && (
        <AskRanchoLink href={localePath("/tools/ask", locale)} detail={ranchoDetail} size="sm" className="mt-3">
          {t.askRancho}
        </AskRanchoLink>
      )}
    </div>
  );
}

/** Exported for tests. */
export function CountdownView({
  countdown,
  exam,
  messages: t,
}: {
  countdown: ExamCountdown;
  exam: string;
  messages: Pick<HomeToolsPlannerMessages, "prompt" | "daysLeft" | "today" | "tomorrow" | "past" | "tooFar">;
}) {
  if (countdown.kind === "days") {
    const [before, after] = splitTemplate(t.daysLeft, "days");
    return (
      <p className="rounded-control bg-navy p-4 text-base font-semibold text-white" data-surface="dark">
        {format(before, { exam })}
        <span className="font-serif text-[2rem] leading-none font-semibold text-gold">{countdown.days.toLocaleString("en-IN")}</span>
        {format(after, { exam })}
      </p>
    );
  }
  if (countdown.kind === "today" || countdown.kind === "tomorrow") {
    return (
      <p className="rounded-control bg-navy p-4 text-base font-semibold text-white" data-surface="dark">
        {format(countdown.kind === "today" ? t.today : t.tomorrow, { exam })}
      </p>
    );
  }
  if (countdown.kind === "past" || countdown.kind === "tooFar") {
    return (
      <p className="rounded-control border border-[#f2dfa0] bg-gold-soft p-4 text-sm font-semibold text-[#5c4a12]">
        {countdown.kind === "past" ? t.past : t.tooFar}
      </p>
    );
  }
  return (
    <p className="rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-4 text-sm text-muted">{t.prompt}</p>
  );
}
