"use client";

import { Plus, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { Button, DemoBadge } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * LOCAL DEMO ONLY. Fictional "Sample applicant" rows held in component state:
 * nothing is fetched, saved, sent or logged, and everything resets on reload.
 * Exists to review the admin table layout before a real enquiry store (with
 * server-side authorisation and audit logging) is connected.
 */

type DemoStatus = "new" | "contacted" | "in_review";
type DemoRow = { ref: string; applicant: string; program: string; status: DemoStatus };

const STATUS_LABEL: Record<DemoStatus, string> = {
  new: "New",
  contacted: "Contacted",
  in_review: "In review",
};

const STATUS_STYLE: Record<DemoStatus, string> = {
  new: "bg-[#fff3d2] text-[#8b5b00]",
  contacted: "bg-success-soft text-[#14744d]",
  in_review: "bg-[#e8f2ff] text-[#1457a5]",
};

const PROGRAMS = ["JEE", "NEET", "Foundation", "Integrated"] as const;
const MAX_ROWS = 10;

function sampleRow(index: number, status: DemoStatus = "new"): DemoRow {
  return {
    ref: `DEMO-${String(index + 1).padStart(3, "0")}`,
    applicant: `Sample applicant ${String.fromCharCode(65 + index)}`,
    program: PROGRAMS[index % PROGRAMS.length],
    status,
  };
}

const INITIAL_ROWS: DemoRow[] = [sampleRow(0, "new"), sampleRow(1, "in_review"), sampleRow(2, "contacted")];

type Filter = "all" | DemoStatus;

export function DemoEnquiriesTable() {
  const [rows, setRows] = useState<DemoRow[]>(INITIAL_ROWS);
  const [filter, setFilter] = useState<Filter>("all");
  const [announcement, setAnnouncement] = useState("");
  const filterId = useId();

  const visible = filter === "all" ? rows : rows.filter((row) => row.status === filter);

  function addRow() {
    if (rows.length >= MAX_ROWS) return;
    const row = sampleRow(rows.length);
    setRows([...rows, row]);
    setAnnouncement(`${row.applicant} added to this page only. Nothing was saved.`);
  }

  function changeStatus(ref: string, status: DemoStatus) {
    setRows(rows.map((row) => (row.ref === ref ? { ...row, status } : row)));
    const row = rows.find((r) => r.ref === ref);
    if (row) setAnnouncement(`${row.applicant} set to ${STATUS_LABEL[status]} on this page only. Nothing was saved.`);
  }

  function reset() {
    setRows(INITIAL_ROWS);
    setFilter("all");
    setAnnouncement("Demo table reset.");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={filterId} className="text-xs font-bold text-[#354b66]">
            Filter by status
          </label>
          <select
            id={filterId}
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
            className="min-h-11 rounded-control border border-line bg-white px-3 text-sm"
          >
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABEL) as DemoStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="primary" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
            <Plus aria-hidden="true" className="size-4" />
            Add sample row
          </Button>
          <Button variant="outline" onClick={reset}>
            <RotateCcw aria-hidden="true" className="size-4" />
            Reset demo
          </Button>
        </div>
      </div>

      {/* Visible notice sits outside the horizontal scroller so it is never clipped on mobile. */}
      <p className="rounded-t-control border border-b-0 border-line bg-gold-soft px-3 py-2 text-xs text-[#5c4a12]">
        <span className="mr-2 inline-block align-middle">
          <DemoBadge label="Demo · local only" />
        </span>
        Fictional sample rows. Changes stay in this browser tab and are never saved or sent.
      </p>
      <div className="overflow-x-auto rounded-b-control border border-line">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Demo enquiries: fictional sample rows, local to this browser tab only.
          </caption>
          <thead>
            <tr className="bg-[#f4f7fb] text-xs text-[#40536b]">
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                Reference
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                Applicant
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                Program
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                Status
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                Change status
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  No sample rows with this status.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.ref} className="border-t border-line">
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{row.ref}</td>
                  <th scope="row" className="whitespace-nowrap px-3 py-3 font-semibold text-navy">
                    {row.applicant}
                  </th>
                  <td className="whitespace-nowrap px-3 py-3">{row.program}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className={cn("inline-block rounded-full px-2 py-1 text-[11px] font-extrabold", STATUS_STYLE[row.status])}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <select
                      aria-label={`Status for ${row.applicant}`}
                      value={row.status}
                      onChange={(event) => changeStatus(row.ref, event.target.value as DemoStatus)}
                      className="min-h-11 rounded-control border border-line bg-white px-2 text-sm"
                    >
                      {(Object.keys(STATUS_LABEL) as DemoStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
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
