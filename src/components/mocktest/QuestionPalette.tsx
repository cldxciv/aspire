import { Check } from "lucide-react";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { PALETTE_STATUSES, type PaletteStatus } from "@/lib/mocktest/runner-state";
import type { MocktestMessages } from "./format";

/**
 * NTA-style palette swatches. Status is carried by colour AND shape AND the accessible label:
 * not visited = plain square, not answered = red square, answered = green square,
 * marked for review = purple circle, answered & marked = purple circle with a green tick.
 */
const SWATCH: Record<PaletteStatus, string> = {
  notVisited: "rounded-md border border-[#b9c6d6] bg-white text-ink",
  notAnswered: "rounded-md border border-danger bg-danger text-white",
  answered: "rounded-md border border-success bg-success text-white",
  marked: "rounded-full border border-[#5b2a9e] bg-[#5b2a9e] text-white",
  answeredMarked: "rounded-full border border-[#5b2a9e] bg-[#5b2a9e] text-white",
};

export function PaletteSwatch({ status, label, className }: { status: PaletteStatus; label: string | number; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-9 shrink-0 items-center justify-center text-xs font-bold", SWATCH[status], className)}>
      {label}
      {status === "answeredMarked" && (
        <span className="absolute -right-1 -bottom-1 inline-flex size-4 items-center justify-center rounded-full bg-success ring-2 ring-white">
          <Check aria-hidden="true" className="size-3 text-white" strokeWidth={3} />
        </span>
      )}
    </span>
  );
}

export function PaletteLegend({
  t,
  counts,
  className,
}: {
  t: MocktestMessages["runner"];
  counts?: Record<PaletteStatus, number>;
  className?: string;
}) {
  return (
    <ul className={cn("grid gap-2 text-sm sm:grid-cols-2", className)}>
      {PALETTE_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-2">
          <PaletteSwatch status={status} label={counts ? counts[status] : ""} className="size-7" />
          <span>{t.status[status]}</span>
        </li>
      ))}
    </ul>
  );
}

export function QuestionPalette({
  t,
  statuses,
  start,
  count,
  current,
  onSelect,
  touch = false,
}: {
  t: MocktestMessages["runner"];
  /** Status of every question in the test. */
  statuses: PaletteStatus[];
  /** First index and number of questions of the section shown. */
  start: number;
  count: number;
  current: number;
  onSelect: (index: number) => void;
  /** 44 px targets (36 px swatch + 4 px padding; the generated-paper runner on tablets). The default keeps the fixed tests' size. */
  touch?: boolean;
}) {
  return (
    <ol className={cn("grid gap-2.5", touch ? "grid-cols-4 sm:grid-cols-5 lg:grid-cols-4" : "grid-cols-5 sm:grid-cols-6 lg:grid-cols-5")}>
      {Array.from({ length: count }, (_, offset) => {
        const index = start + offset;
        const status = statuses[index];
        const isCurrent = index === current;
        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={format(t.paletteItem, { n: index + 1, status: t.status[status] })}
              className={cn(
                "rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue",
                touch ? "p-1" : "p-0.5",
                isCurrent && "ring-2 ring-gold ring-offset-1",
              )}
            >
              <PaletteSwatch status={status} label={index + 1} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
