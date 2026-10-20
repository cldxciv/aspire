import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Non-interactive progress indicator for the hero enquiry form.
 *
 * - `<ol aria-label={label}>`; the current step carries `aria-current="step"`.
 * - Current: gold circle with a 2px navy ring. Completed: navy circle + check, and an
 *   sr-only "(completed)". Upcoming: white circle with a border. State is never colour-only.
 * - Short labels are visible below `xl` and sr-only from `xl` (the card is narrow there);
 *   the visible "Step N of 3" text lives in each step's heading.
 */
export function StepProgress({
  steps,
  current,
  complete = false,
  className,
  label = "Enquiry steps",
  completedSuffix = "(completed)",
}: {
  steps: readonly { short: string }[];
  /** Index of the current step. */
  current: number;
  /** Every step is done (the enquiry was received). */
  complete?: boolean;
  className?: string;
  /** Accessible name of the list (localised). */
  label?: string;
  /** Screen-reader suffix of a completed step (localised). */
  completedSuffix?: string;
}) {
  return (
    <ol aria-label={label} className={cn("flex items-start gap-1.5", className)}>
      {steps.map((step, index) => {
        const done = complete || index < current;
        const active = !complete && index === current;
        return (
          <li
            key={step.short}
            aria-current={active ? "step" : undefined}
            className="flex min-w-11 flex-col items-center gap-1 xl:min-w-0"
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-sm font-bold",
                done && "bg-navy text-white",
                active && "bg-gold text-navy ring-2 ring-navy",
                !done && !active && "border border-[#c3d1e2] bg-white text-muted",
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
            </span>
            <span className="text-[11px] font-semibold leading-none text-muted xl:sr-only">
              {step.short}
              {done && <span className="sr-only"> {completedSuffix}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
