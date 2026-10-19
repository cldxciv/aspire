"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";
import { Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ExamTrack, Program } from "@/lib/types";
import { EXAM_META, EXAM_ORDER, programTracks } from "./exam-meta";
import { ProgramGrid } from "./ProgramGrid";

type ExamFilter = ExamTrack | "all";

/**
 * Programs directory with an exam filter (toggle buttons with aria-pressed).
 * A program matches when it prepares for the chosen exam (any of its `tracks`),
 * so dual JEE / NEET courses appear under both. Filters the server-provided list
 * in the browser; nothing is fetched.
 */
export function ProgramDirectory({ programs }: { programs: Program[] }) {
  const [exam, setExam] = useState<ExamFilter>("all");
  const listId = useId();

  const exams = EXAM_ORDER.filter((e) => programs.some((p) => programTracks(p).includes(e)));
  const options: { value: ExamFilter; label: string }[] = [
    { value: "all", label: "All programs" },
    ...exams.map((e) => ({ value: e, label: EXAM_META[e].label })),
  ];
  const visible = exam === "all" ? programs : programs.filter((p) => programTracks(p).includes(exam));

  return (
    <div>
      <div role="group" aria-label="Filter programs by exam" className="mb-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const pressed = exam === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              aria-controls={listId}
              onClick={() => setExam(option.value)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition",
                pressed
                  ? "border-navy bg-navy text-white"
                  : "border-[#b9cbe0] bg-white text-navy hover:border-blue hover:text-blue",
              )}
            >
              {pressed && <Check aria-hidden="true" className="size-4" />}
              {option.label}
            </button>
          );
        })}
      </div>
      {/* Includes the filter name so the announcement changes even when the count doesn't. */}
      <p role="status" className="mb-5 text-sm text-muted">
        {visible.length === 1 ? "Showing 1 program" : `Showing ${visible.length} programs`}
        {exam !== "all" && ` that prepare for ${EXAM_META[exam].label}`}
      </p>
      {visible.length > 0 ? (
        <ProgramGrid id={listId} programs={visible} showEnquire />
      ) : (
        <div id={listId}>
          <EmptyState
            title="No programs match this filter"
            description="Choose another exam, or ask a counsellor which pathway suits the learner."
            action={
              <Button variant="outline" onClick={() => setExam("all")}>
                Show all programs
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
