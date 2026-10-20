"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { format } from "@/i18n/format";
import { addDays, isDateKey, type DateKey } from "@/lib/planner/dates";
import { PLAN_LIMITS } from "@/lib/planner/plan";
import { DEFAULT_REMINDER_MINUTES, STATE_LIMITS, type PlannerSettings } from "@/lib/planner/state";
import { BATCH_IDS, EXAM_IDS, type BatchId, type ExamId, type SubjectId } from "@/lib/planner/types";
import { topicsForExam, type PlannerData, type PlannerMessages } from "./model";

const HOURS = Array.from({ length: (PLAN_LIMITS.maxDailyHours - PLAN_LIMITS.minDailyHours) * 2 + 1 }, (_, i) => PLAN_LIMITS.minDailyHours + i / 2);
const SENIOR: readonly ExamId[] = ["jee-main", "jee-advanced", "neet"];

function defaultBatch(exam: ExamId, current?: BatchId): BatchId {
  const senior = SENIOR.includes(exam);
  if (!current) return senior ? "12" : "10";
  const seniorBatch = current === "11" || current === "12" || current === "dropper";
  if (senior && !seniorBatch) return "12";
  if (!senior && seniorBatch) return "10";
  return current;
}

const fieldClass =
  "mt-1 block min-h-11 w-full min-w-0 rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-sm text-ink focus:border-blue focus:outline-2 focus:outline-offset-1 focus:outline-blue";

/**
 * Builds (or edits) the plan input. A new plan starts today; editing a planning field rebuilds it
 * from today (see `applySettings`).
 */
export function PlanForm({
  t,
  data,
  today,
  settings,
  onSubmit,
}: {
  t: PlannerMessages;
  data: PlannerData;
  today: DateKey;
  settings: PlannerSettings | null;
  onSubmit: (settings: PlannerSettings) => void;
}) {
  const id = useId();
  const [exam, setExam] = useState<ExamId>(settings?.exam ?? "jee-main");
  const [batch, setBatch] = useState<BatchId>(settings?.batch ?? defaultBatch(settings?.exam ?? "jee-main"));
  const [examDate, setExamDate] = useState<string>(settings?.examDate ?? "");
  const [hours, setHours] = useState<number>(settings?.dailyHours ?? 6);
  const [weak, setWeak] = useState<string[]>(settings?.weakTopics ?? []);
  const [error, setError] = useState<string | null>(null);

  const topics = topicsForExam(data, exam);
  const subjects = [...new Set(topics.map((topic) => topic.subject))] as SubjectId[];
  const min = addDays(today, 1);
  const max = addDays(today, PLAN_LIMITS.maxDays);

  function changeExam(next: ExamId) {
    setExam(next);
    setBatch((current) => defaultBatch(next, current));
    const allowed = new Set(data.examTopics[next]);
    setWeak((current) => current.filter((topicId) => allowed.has(topicId)));
  }

  function toggleWeak(topicId: string, on: boolean) {
    setWeak((current) =>
      on ? (current.includes(topicId) || current.length >= STATE_LIMITS.maxWeakTopics ? current : [...current, topicId]) : current.filter((x) => x !== topicId),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDateKey(examDate) || examDate < min) {
      setError(t.form.errors.examDate);
      return;
    }
    if (examDate > max) {
      setError(t.form.errors.examDateFar);
      return;
    }
    setError(null);
    onSubmit({
      exam,
      batch,
      startDate: settings?.startDate ?? today,
      examDate,
      dailyHours: hours,
      weakTopics: weak,
      reminderMinutes: settings?.reminderMinutes ?? DEFAULT_REMINDER_MINUTES,
      notifications: settings?.notifications ?? false,
    });
  }

  const errorId = `${id}-date-error`;
  return (
    <form onSubmit={submit} noValidate className="grid gap-5" aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className="font-serif text-2xl font-bold text-navy">
          {settings ? t.form.editTitle : t.form.title}
        </h2>
        {!settings && <p className="mt-1 text-sm text-muted">{t.form.intro}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0 text-sm font-semibold text-navy">
          {t.form.exam}
          <select className={fieldClass} value={exam} onChange={(e) => changeExam(e.target.value as ExamId)}>
            {EXAM_IDS.map((value) => (
              <option key={value} value={value}>
                {t.exams[value]}
              </option>
            ))}
          </select>
        </label>

        <div className="min-w-0">
          <label htmlFor={`${id}-date`} className="block text-sm font-semibold text-navy">
            {t.form.examDate}
          </label>
          <input
            id={`${id}-date`}
            type="date"
            required
            min={min}
            max={max}
            value={examDate}
            onChange={(e) => {
              setExamDate(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-date-hint${error ? ` ${errorId}` : ""}`}
            className={fieldClass}
          />
          <p id={`${id}-date-hint`} className="mt-1 text-xs text-muted">
            {t.form.examDateHint}
          </p>
          {error && (
            <p id={errorId} role="alert" className="mt-1 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
        </div>

        <label className="block min-w-0 text-sm font-semibold text-navy">
          {t.form.batch}
          <select
            className={fieldClass}
            value={batch}
            onChange={(e) => {
              setBatch(e.target.value as BatchId);
            }}
          >
            {BATCH_IDS.map((value) => (
              <option key={value} value={value}>
                {t.batches[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0 text-sm font-semibold text-navy">
          {t.form.hours}
          <select
            className={fieldClass}
            value={hours}
            onChange={(e) => {
              setHours(Number(e.target.value));
            }}
          >
            {HOURS.map((value) => (
              <option key={value} value={value}>
                {format(t.form.hoursOption, { hours: value })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="rounded-control border border-line bg-white p-3 open:pb-4">
        <summary className="cursor-pointer text-sm font-semibold text-navy">
          {t.form.weak} <span className="font-normal text-muted">({format(t.form.weakCount, { count: weak.length })})</span>
        </summary>
        <p className="mt-2 text-xs text-muted">{t.form.weakHint}</p>
        <div className="mt-3 grid gap-4">
          {subjects.map((subject) => (
            <fieldset key={subject} className="min-w-0">
              <legend className="text-sm font-bold text-navy">{t.subjects[subject]}</legend>
              <div className="mt-1 grid gap-x-4 sm:grid-cols-2">
                {topics
                  .filter((topic) => topic.subject === subject)
                  .map((topic) => (
                    <label key={topic.id} className="flex min-h-9 items-start gap-2 py-1 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-blue"
                        checked={weak.includes(topic.id)}
                        onChange={(e) => toggleWeak(topic.id, e.target.checked)}
                      />
                      <span className="min-w-0">{topic.name}</span>
                    </label>
                  ))}
              </div>
            </fieldset>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={settings ? "dark" : "primary"}>
          {settings ? t.form.update : t.form.submit}
        </Button>
        {settings && <p className="text-xs text-muted">{t.form.updateNote}</p>}
      </div>
    </form>
  );
}
