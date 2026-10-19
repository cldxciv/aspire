"use client";

import { ChevronDown, Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { EXAM_META, EXAM_ORDER } from "@/components/programs/exam-meta";
import { Button, DemoBadge, EmptyState } from "@/components/ui";
import type { ExamTrack } from "@/lib/types";
import type { RankerRow } from "./result-view";

/** Rows rendered at first and added per "Show more" (the list can hold 700+ entries). */
const PAGE_SIZE = 24;

const controlClass =
  "min-h-11 w-full rounded-control border border-[#d8e2ef] bg-white text-sm text-ink focus:border-blue";

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Searchable, filterable rankers list. Rows arrive from the server with names
 * already removed where canShowStudentName() is false, so search can only match
 * names that may be shown. Only `limit` rows are in the DOM; filters reset the
 * page and every change is announced through a polite status message.
 */
export function RankersTable({ rows, sources }: { rows: RankerRow[]; sources: string[] }) {
  const [exam, setExam] = useState<ExamTrack | "">("");
  const [year, setYear] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const searchId = useId();
  const examId = useId();
  const yearId = useId();
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const examOptions = EXAM_ORDER.filter((e) => rows.some((row) => row.exam === e));
  const yearOptions = [...new Set(rows.map((row) => row.year))].sort((a, b) => b - a);

  const q = normalise(query);
  const filtered = rows.filter(
    (row) =>
      (!exam || row.exam === exam) &&
      (!year || row.year === Number(year)) &&
      (!q || normalise(`${row.name ?? ""} ${row.institution ?? ""}`).includes(q)),
  );
  const shown = filtered.slice(0, limit);
  const remaining = filtered.length - shown.length;
  const filtersActive = exam !== "" || year !== "" || query.trim() !== "";

  const filterSummary = [
    exam && EXAM_META[exam].label,
    year,
    query.trim() && `matching “${query.trim()}”`,
  ]
    .filter(Boolean)
    .join(", ");

  const reset = () => {
    setExam("");
    setYear("");
    setQuery("");
    setLimit(PAGE_SIZE);
    searchRef.current?.focus();
  };

  return (
    <div>
      <form
        role="search"
        aria-label="Rankers list"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-3 md:flex-row md:items-end"
      >
        <div className="flex-1">
          <label htmlFor={searchId} className="mb-1 block text-xs font-bold text-[#354b66]">
            Search by name or college
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder="e.g. NIT Hamirpur"
              autoComplete="off"
              aria-controls={listId}
              className={`${controlClass} pl-9 pr-3`}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:flex">
          <div className="md:w-44">
            <label htmlFor={examId} className="mb-1 block text-xs font-bold text-[#354b66]">
              Exam
            </label>
            <select
              id={examId}
              value={exam}
              onChange={(e) => {
                setExam(e.target.value as ExamTrack | "");
                setLimit(PAGE_SIZE);
              }}
              aria-controls={listId}
              className={`${controlClass} px-3`}
            >
              <option value="">All exams</option>
              {examOptions.map((e) => (
                <option key={e} value={e}>
                  {EXAM_META[e].label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:w-36">
            <label htmlFor={yearId} className="mb-1 block text-xs font-bold text-[#354b66]">
              Year
            </label>
            <select
              id={yearId}
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setLimit(PAGE_SIZE);
              }}
              aria-controls={listId}
              className={`${controlClass} px-3`}
            >
              <option value="">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        {filtersActive && (
          <Button variant="outline" onClick={reset}>
            Clear
          </Button>
        )}
      </form>

      <p role="status" className="mb-4 mt-3 text-sm text-muted">
        {filtered.length === 0
          ? `No rankers match${filterSummary ? `: ${filterSummary}` : ""}`
          : `Showing ${shown.length} of ${plural(filtered.length, "ranker")}${filterSummary ? ` (${filterSummary})` : ""}`}
      </p>

      <div id={listId}>
        {filtered.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-card border border-line bg-white shadow-soft">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Rankers, newest first. Columns: student, college or institute, exam and year.
                </caption>
                <thead className="bg-[#f4f7fb] text-xs font-bold text-[#40536b]">
                  <tr>
                    <th scope="col" className="px-3 py-3 sm:px-4">
                      Student
                    </th>
                    <th scope="col" className="px-3 py-3 sm:px-4">
                      College / institute
                    </th>
                    <th scope="col" className="px-3 py-3 sm:px-4">
                      Exam / year
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id} className="border-t border-line align-top">
                      <th scope="row" className="px-3 py-3 font-normal sm:px-4">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={row.name ? "font-semibold text-navy" : "text-muted"}>
                            {row.name ?? "Name withheld"}
                          </span>
                          {row.placeholder && <DemoBadge label="Demo" />}
                        </span>
                        {row.note && <span className="mt-0.5 block text-xs text-muted">{row.note}</span>}
                      </th>
                      <td className="px-3 py-3 text-ink sm:px-4">
                        {row.institution ?? <span className="text-muted">Not stated</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink sm:px-4">
                        {EXAM_META[row.exam].label}
                        <span className="block text-xs text-muted">{row.year}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {remaining > 0 && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  aria-controls={listId}
                  onClick={() => setLimit((current) => current + PAGE_SIZE)}
                >
                  <ChevronDown aria-hidden="true" className="size-4" />
                  Show {Math.min(PAGE_SIZE, remaining)} more
                  <span className="sr-only"> of {plural(remaining, "remaining ranker")}</span>
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title="No rankers match these filters"
            description="Check the spelling, or try another exam or year."
            action={
              <Button variant="outline" onClick={reset}>
                Clear filters
              </Button>
            }
          />
        )}
      </div>

      {sources.length > 0 && (
        <p className="mt-4 break-words text-xs text-muted">
          <span className="font-bold text-[#354b66]">Source:</span> {sources.join(" · ")}
        </p>
      )}
    </div>
  );
}
