"use client";

import { useId, useState } from "react";
import { Button, EmptyState } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";
import type { ExamTrack, ResultRecord } from "@/lib/types";
import { EXAM_ORDER, trackLabel } from "@/components/programs/exam-meta";
import type { CentreNames } from "./result-view";
import { ResultCard, type ResultCardMessages } from "./ResultCard";

/** Copy the archive reads: `results.archive` plus the card copy. */
export type ResultsArchiveMessages = ResultCardMessages & { archive: Messages<"results">["archive"] };

const selectClass =
  "min-h-11 w-full rounded-control border border-[#d8e2ef] bg-white px-3 text-sm text-ink focus:border-blue " +
  "disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted";

/**
 * Exam + year filters over the server-provided result list. Records must
 * already have names stripped on the server where canShowStudentName() is
 * false (server-view.ts `withPermittedName`), so any name present may be shown.
 * With no records, the controls are disabled and the reason is announced via
 * aria-describedby.
 */
export function ResultsArchive({
  results,
  years,
  centreNames = {},
  messages,
  listClassName = "sm:grid-cols-2 lg:grid-cols-3",
}: {
  results: ResultRecord[];
  years: number[];
  centreNames?: CentreNames;
  messages: ResultsArchiveMessages;
  /** Column classes for the card grid (e.g. two columns when the archive sits beside a photo). */
  listClassName?: string;
}) {
  const locale = useLocale();
  const t = messages.archive;
  const [exam, setExam] = useState<ExamTrack | "">("");
  const [year, setYear] = useState("");
  const examId = useId();
  const yearId = useId();
  const helpId = useId();
  const listId = useId();

  const hasRecords = results.length > 0;
  const placeholderList = results.some((r) => r.status === "placeholder");
  const noun = placeholderList ? t.nounResult : t.nounVerified;
  const nouns = placeholderList ? t.nounResults : t.nounVerifieds;
  const exams = hasRecords ? EXAM_ORDER.filter((e) => results.some((r) => r.exam === e)) : EXAM_ORDER;
  const filtersActive = exam !== "" || year !== "";
  const filtered = results.filter((r) => (!exam || r.exam === exam) && (!year || r.year === Number(year)));

  const reset = () => {
    setExam("");
    setYear("");
  };

  return (
    <div>
      <fieldset className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <legend className="sr-only">{t.filterLegend}</legend>
        <div className="sm:w-56">
          <label htmlFor={examId} className="mb-1 block text-xs font-bold text-[#354b66]">
            {t.exam}
          </label>
          <select
            id={examId}
            value={exam}
            onChange={(e) => setExam(e.target.value as ExamTrack | "")}
            disabled={!hasRecords}
            aria-describedby={hasRecords ? undefined : helpId}
            aria-controls={hasRecords ? listId : undefined}
            className={selectClass}
          >
            <option value="">{t.allExams}</option>
            {exams.map((e) => (
              <option key={e} value={e}>
                {trackLabel(e, messages.tracks)}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-44">
          <label htmlFor={yearId} className="mb-1 block text-xs font-bold text-[#354b66]">
            {t.year}
          </label>
          <select
            id={yearId}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            disabled={!hasRecords}
            aria-describedby={hasRecords ? undefined : helpId}
            aria-controls={hasRecords ? listId : undefined}
            className={selectClass}
          >
            <option value="">{t.allYears}</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {filtersActive && (
          <Button variant="outline" onClick={reset}>
            {t.clearFilters}
          </Button>
        )}
      </fieldset>

      {!hasRecords ? (
        <p id={helpId} className="mt-4 text-sm text-muted">
          {t.disabledHelp}
        </p>
      ) : (
        <>
          <p role="status" className="mb-6 mt-4 text-sm text-muted">
            {filtered.length === 1
              ? format(t.showingOne, { noun })
              : format(t.showingMany, { count: filtered.length, nouns })}
            {exam && ` ${format(t.forExam, { exam: trackLabel(exam, messages.tracks) })}`}
            {year && ` ${format(t.inYear, { year })}`}
          </p>
          {filtered.length > 0 ? (
            <ul id={listId} className={cn("grid gap-5 md:gap-6", listClassName)}>
              {filtered.map((result) => (
                <li key={result.id} className="min-w-0">
                  <ResultCard
                    result={result}
                    showName
                    centreName={result.centreSlug ? centreNames[result.centreSlug] : undefined}
                    t={messages}
                    locale={locale}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div id={listId}>
              <EmptyState
                title={t.noMatchTitle}
                description={t.noMatchBody}
                action={
                  <Button variant="outline" onClick={reset}>
                    {t.clearFilters}
                  </Button>
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
