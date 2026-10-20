"use client";

import { useId, useState } from "react";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";
import { formatNumber } from "./format";

/** Count row as sent to the browser: no names, no ids — only exam, year, college and a count. */
export interface AdmitCount {
  exam: "JEE" | "NEET";
  year: number;
  key: string;
  institution: string;
  count: number;
}

interface CollegeTotal {
  key: string;
  institution: string;
  count: number;
  from: number;
  to: number;
}

/** Totals per college for `exam` (and `year`, or all years), most entries first. */
export function collegeTotals(rows: AdmitCount[], exam: AdmitCount["exam"], year: number | "all"): CollegeTotal[] {
  const totals = new Map<string, CollegeTotal>();
  for (const row of rows) {
    if (row.exam !== exam || (year !== "all" && row.year !== year)) continue;
    const total = totals.get(row.key) ?? { key: row.key, institution: row.institution, count: 0, from: row.year, to: row.year };
    total.count += row.count;
    total.from = Math.min(total.from, row.year);
    total.to = Math.max(total.to, row.year);
    totals.set(row.key, total);
  }
  return [...totals.values()].sort((a, b) => b.count - a.count || a.institution.localeCompare(b.institution));
}

const VISIBLE = 10;
const selectClass =
  "w-full min-h-11 rounded-lg border border-[#d8e2ef] bg-white px-3 py-2.5 text-[15px] text-ink transition-colors focus:border-blue";

/** Exam / year filter over the aggregated counts of Aspire's results list. */
export function AspireAdmits({ rows, years, messages }: { rows: AdmitCount[]; years: number[]; messages: Messages<"predictor">["admits"] }) {
  const locale = useLocale();
  const ids = useId();
  const [exam, setExam] = useState<AdmitCount["exam"]>("JEE");
  const [year, setYear] = useState<number | "all">("all");
  const totals = collegeTotals(rows, exam, year);
  const shown = totals.slice(0, VISIBLE);
  const rest = totals.length - shown.length;

  return (
    <div>
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-exam`} className="text-[13px] font-bold text-[#354b66]">
            {messages.exam}
          </label>
          <select id={`${ids}-exam`} value={exam} onChange={(e) => setExam(e.target.value as AdmitCount["exam"])} className={selectClass}>
            <option value="JEE">JEE</option>
            <option value="NEET">NEET</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-year`} className="text-[13px] font-bold text-[#354b66]">
            {messages.year}
          </label>
          <select
            id={`${ids}-year`}
            value={String(year)}
            onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))}
            className={selectClass}
          >
            <option value="all">{messages.allYears}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-5 text-sm text-muted">{messages.empty}</p>
      ) : (
        <ol aria-label={messages.listLabel} className="mt-5 grid list-none gap-2 p-0 sm:grid-cols-2">
          {shown.map((college, index) => (
            <li
              key={college.key}
              className={cn(
                "flex items-center justify-between gap-3 rounded-control border border-line bg-white p-3",
                index === 0 && "border-l-4 border-l-gold",
              )}
            >
              <span className="min-w-0">
                <span lang="en" className="block font-bold break-words text-navy">
                  {college.institution}
                </span>
                <span className="block text-xs text-muted">
                  {college.from === college.to
                    ? format(messages.yearsOne, { exam, year: college.from })
                    : format(messages.years, { exam, from: college.from, to: college.to })}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm font-extrabold text-navy">
                {college.count === 1
                  ? messages.countOne
                  : format(messages.count, { count: formatNumber(college.count, locale) })}
              </span>
            </li>
          ))}
        </ol>
      )}
      {rest > 0 && <p className="mt-3 text-sm text-muted">{format(messages.more, { count: formatNumber(rest, locale) })}</p>}
    </div>
  );
}
