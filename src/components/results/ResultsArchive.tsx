"use client";

import { useId, useState } from "react";
import { Button, EmptyState } from "@/components/ui";
import type { ExamTrack, ResultRecord } from "@/lib/types";
import { EXAM_META, EXAM_ORDER } from "@/components/programs/exam-meta";
import type { CentreNames } from "./result-view";
import { ResultCard } from "./ResultCard";

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
}: {
  results: ResultRecord[];
  years: number[];
  centreNames?: CentreNames;
}) {
  const [exam, setExam] = useState<ExamTrack | "">("");
  const [year, setYear] = useState("");
  const examId = useId();
  const yearId = useId();
  const helpId = useId();
  const listId = useId();

  const hasRecords = results.length > 0;
  const noun = results.some((r) => r.status === "placeholder") ? "result" : "verified result";
  const exams = hasRecords ? EXAM_ORDER.filter((e) => results.some((r) => r.exam === e)) : EXAM_ORDER;
  const filtersActive = exam !== "" || year !== "";
  const filtered = results.filter((r) => (!exam || r.exam === exam) && (!year || r.year === Number(year)));

  const reset = () => {
    setExam("");
    setYear("");
  };

  return (
    <div>
      <fieldset className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <legend className="sr-only">Filter the results archive</legend>
        <div className="sm:w-56">
          <label htmlFor={examId} className="mb-1 block text-xs font-bold text-[#354b66]">
            Exam
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
            <option value="">All exams</option>
            {exams.map((e) => (
              <option key={e} value={e}>
                {EXAM_META[e].label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-44">
          <label htmlFor={yearId} className="mb-1 block text-xs font-bold text-[#354b66]">
            Year
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
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {filtersActive && (
          <Button variant="outline" onClick={reset}>
            Clear filters
          </Button>
        )}
      </fieldset>

      {!hasRecords ? (
        <p id={helpId} className="mt-3 text-sm text-muted">
          Filters become available once verified results are published. No result records have been published yet.
        </p>
      ) : (
        <>
          <p role="status" className="mb-5 mt-3 text-sm text-muted">
            {filtered.length === 1 ? `Showing 1 ${noun}` : `Showing ${filtered.length} ${noun}s`}
            {exam && ` for ${EXAM_META[exam].label}`}
            {year && ` in ${year}`}
          </p>
          {filtered.length > 0 ? (
            <ul id={listId} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((result) => (
                <li key={result.id}>
                  <ResultCard
                    result={result}
                    showName
                    centreName={result.centreSlug ? centreNames[result.centreSlug] : undefined}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div id={listId}>
              <EmptyState
                title="No results match these filters"
                description="Try another exam or year."
                action={
                  <Button variant="outline" onClick={reset}>
                    Clear filters
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
