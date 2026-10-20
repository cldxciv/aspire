"use client";

import { Plus, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { Button, DemoBadge } from "@/components/ui";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";

/**
 * LOCAL DEMO ONLY (preview mode, never beside a real session). Fictional "Sample applicant"
 * rows held in component state: nothing is fetched, saved, sent or logged, and everything
 * resets on reload. Exists to review the admin table layout before a real enquiry store
 * (with server-side authorisation and audit logging) is connected. Copy from
 * `portal.demoTable` in the page's locale.
 */

type DemoStatus = "new" | "contacted" | "inReview";
type DemoRow = { ref: string; letter: string; program: string; status: DemoStatus };

const STATUSES: DemoStatus[] = ["new", "contacted", "inReview"];

const STATUS_STYLE: Record<DemoStatus, string> = {
  new: "bg-[#fff3d2] text-[#8b5b00]",
  contacted: "bg-success-soft text-[#14744d]",
  inReview: "bg-[#e8f2ff] text-[#1457a5]",
};

// Exam / program names are brand terms and stay in Latin script in both locales.
const PROGRAMS = ["JEE", "NEET", "Foundation", "Integrated"] as const;
const MAX_ROWS = 10;

function sampleRow(index: number, status: DemoStatus = "new"): DemoRow {
  return {
    ref: `DEMO-${String(index + 1).padStart(3, "0")}`,
    letter: String.fromCharCode(65 + index),
    program: PROGRAMS[index % PROGRAMS.length],
    status,
  };
}

const INITIAL_ROWS: DemoRow[] = [sampleRow(0, "new"), sampleRow(1, "inReview"), sampleRow(2, "contacted")];

type Filter = "all" | DemoStatus;

export function DemoEnquiriesTable({ t }: { t: Messages<"portal">["demoTable"] }) {
  const [rows, setRows] = useState<DemoRow[]>(INITIAL_ROWS);
  const [filter, setFilter] = useState<Filter>("all");
  const [announcement, setAnnouncement] = useState("");
  const filterId = useId();

  const visible = filter === "all" ? rows : rows.filter((row) => row.status === filter);
  const applicant = (row: DemoRow) => format(t.applicant, { letter: row.letter });

  function addRow() {
    if (rows.length >= MAX_ROWS) return;
    const row = sampleRow(rows.length);
    setRows([...rows, row]);
    setAnnouncement(format(t.added, { applicant: applicant(row) }));
  }

  function changeStatus(ref: string, status: DemoStatus) {
    setRows(rows.map((row) => (row.ref === ref ? { ...row, status } : row)));
    const row = rows.find((r) => r.ref === ref);
    if (row) setAnnouncement(format(t.changed, { applicant: applicant(row), status: t.statuses[status] }));
  }

  function reset() {
    setRows(INITIAL_ROWS);
    setFilter("all");
    setAnnouncement(t.resetDone);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={filterId} className="text-xs font-bold text-[#354b66]">
            {t.filterLabel}
          </label>
          <select
            id={filterId}
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
            className="min-h-11 rounded-control border border-line bg-white px-3 text-sm"
          >
            <option value="all">{t.allStatuses}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {t.statuses[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="primary" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
            <Plus aria-hidden="true" className="size-4" />
            {t.addRow}
          </Button>
          <Button variant="outline" onClick={reset}>
            <RotateCcw aria-hidden="true" className="size-4" />
            {t.reset}
          </Button>
        </div>
      </div>

      {/* Visible notice sits outside the horizontal scroller so it is never clipped on mobile. */}
      <p className="rounded-t-control border border-b-0 border-line bg-gold-soft px-3 py-2 text-xs text-[#5c4a12]">
        <span className="mr-2 inline-block align-middle">
          <DemoBadge label={t.badge} />
        </span>
        {t.notice}
      </p>
      <div className="overflow-x-auto rounded-b-control border border-line">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{t.caption}</caption>
          <thead>
            <tr className="bg-[#f4f7fb] text-xs text-[#40536b]">
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                {t.columns.reference}
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                {t.columns.applicant}
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                {t.columns.program}
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                {t.columns.status}
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                {t.columns.changeStatus}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  {t.noRows}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.ref} className="border-t border-line">
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs" lang="en">
                    {row.ref}
                  </td>
                  <th scope="row" className="whitespace-nowrap px-3 py-3 font-semibold text-navy">
                    {applicant(row)}
                  </th>
                  <td className="whitespace-nowrap px-3 py-3" lang="en">
                    {row.program}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className={cn("inline-block rounded-full px-2 py-1 text-[11px] font-extrabold", STATUS_STYLE[row.status])}>
                      {t.statuses[row.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <select
                      aria-label={format(t.statusFor, { applicant: applicant(row) })}
                      value={row.status}
                      onChange={(event) => changeStatus(row.ref, event.target.value as DemoStatus)}
                      className="min-h-11 rounded-control border border-line bg-white px-2 text-sm"
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t.statuses[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p role="status" className="mt-3 min-h-5 text-sm text-muted">
        {announcement}
      </p>
    </div>
  );
}
