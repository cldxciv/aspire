"use client";

import { ChevronDown, Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { EXAM_ORDER, trackLabel, type TrackLabels } from "@/components/programs/exam-meta";
import { Button, DemoBadge, EmptyState } from "@/components/ui";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import type { ExamTrack } from "@/lib/types";
import type { RankerRow } from "./result-view";

/** Copy the rankers list reads (`results.rankers`, `programs.tracks`, DEMO label). */
export type RankersTableMessages = {
  rankers: Messages<"results">["rankers"];
  tracks: TrackLabels;
  demo: string;
  nameWithheld: string;
};

/** Rows rendered at first and added per "Show more" (the list can hold 700+ entries). */
const PAGE_SIZE = 24;

const controlClass =
  "min-h-11 w-full rounded-control border border-[#d8e2ef] bg-white text-sm text-ink focus:border-blue";

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function plural(count: number, one: string, many: string): string {
  return format(count === 1 ? one : many, { count });
}

/**
 * Searchable, filterable rankers list. Rows arrive from the server with names
 * already removed where canShowStudentName() is false, so search can only match
 * names that may be shown. Only `limit` rows are in the DOM; filters reset the
 * page and every change is announced through a polite status message.
 */
export function RankersTable({
  rows,
  sources,
  messages,
}: {
  rows: RankerRow[];
  sources: string[];
  messages: RankersTableMessages;
}) {
  const t = messages.rankers;
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
    exam && trackLabel(exam, messages.tracks),
    year,
    query.trim() && format(t.matching, { query: query.trim() }),
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
    // Container queries: the list sits in half the page width beside a sticky photo (D-030).
    <div className="@container">
      <form
        role="search"
        aria-label={t.formLabel}
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-4 @2xl:flex-row @2xl:items-end"
      >
        <div className="flex-1">
          <label htmlFor={searchId} className="mb-1 block text-xs font-bold text-[#354b66]">
            {t.searchLabel}
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
              placeholder={t.searchPlaceholder}
              autoComplete="off"
              aria-controls={listId}
              className={`${controlClass} pl-9 pr-3`}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 @2xl:flex">
          <div className="@2xl:w-44">
            <label htmlFor={examId} className="mb-1 block text-xs font-bold text-[#354b66]">
              {t.exam}
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
              <option value="">{t.allExams}</option>
              {examOptions.map((e) => (
                <option key={e} value={e}>
                  {trackLabel(e, messages.tracks)}
                </option>
              ))}
            </select>
          </div>
          <div className="@2xl:w-36">
            <label htmlFor={yearId} className="mb-1 block text-xs font-bold text-[#354b66]">
              {t.year}
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
              <option value="">{t.allYears}</option>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        {filtersActive && (
          <Button variant="outline" onClick={reset} className="self-start @2xl:self-auto">
            {t.clear}
          </Button>
        )}
      </form>

      <p role="status" className="mb-5 mt-4 text-sm text-muted">
        {filtered.length === 0
          ? filterSummary
            ? format(t.noMatchFor, { filters: filterSummary })
            : t.noMatch
          : format(filterSummary ? t.showingFiltered : t.showing, {
              shown: shown.length,
              total: plural(filtered.length, t.rankerOne, t.rankerMany),
              filters: filterSummary,
            })}
      </p>

      <div id={listId}>
        {filtered.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-card border border-line bg-white shadow-soft">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t.caption}</caption>
                <thead className="bg-[#f4f7fb] text-xs font-bold text-[#40536b]">
                  <tr>
                    <th scope="col" className="px-3 py-3.5 sm:px-5">
                      {t.student}
                    </th>
                    <th scope="col" className="px-3 py-3.5 sm:px-5">
                      {t.institution}
                    </th>
                    <th scope="col" className="px-3 py-3.5 sm:px-5">
                      {t.examYear}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id} className="border-t border-line align-top">
                      <th scope="row" className="px-3 py-3.5 font-normal sm:px-5">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={row.name ? "font-semibold text-navy" : "text-muted"}>
                            {row.name ?? messages.nameWithheld}
                          </span>
                          {row.placeholder && <DemoBadge label={messages.demo} />}
                        </span>
                        {row.note && <span className="mt-1 block text-xs text-muted">{row.note}</span>}
                      </th>
                      <td className="px-3 py-3.5 text-ink sm:px-5">
                        {row.institution ?? <span className="text-muted">{t.notStated}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-ink sm:px-5">
                        {trackLabel(row.exam, messages.tracks)}
                        <span className="block text-xs text-muted">{row.year}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {remaining > 0 && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  aria-controls={listId}
                  onClick={() => setLimit((current) => current + PAGE_SIZE)}
                >
                  <ChevronDown aria-hidden="true" className="size-4" />
                  {format(t.showMore, { count: Math.min(PAGE_SIZE, remaining) })}
                  <span className="sr-only"> {format(remaining === 1 ? t.remainingOne : t.remainingMany, { count: remaining })}</span>
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title={t.noMatchTitle}
            description={t.noMatchBody}
            action={
              <Button variant="outline" onClick={reset}>
                {t.clearFilters}
              </Button>
            }
          />
        )}
      </div>

      {sources.length > 0 && (
        <p className="mt-6 text-xs text-muted [overflow-wrap:anywhere]">
          <span className="font-bold text-[#354b66]">{t.source}</span> {sources.join(" · ")}
        </p>
      )}
    </div>
  );
}
