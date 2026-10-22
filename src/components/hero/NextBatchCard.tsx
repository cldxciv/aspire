import { DemoBadge } from "@/components/ui/Feedback";
import { cn } from "@/lib/cn";
import { HeroAction } from "./HeroAction";
import { isFilled } from "./hero-text";

/** One row of the card. `value` from the data only; a missing or "[…]" value hides the row. */
export type NextBatchRow = { label: string; value?: string | number | null; placeholder?: boolean };

export type HeroLink = { label: string; href: string };

/**
 * B · "Next batch" card: a white card beside (or, on Admissions, over the collage of) the hero
 * copy. Eyebrow, an optional title (e.g. a start date from the data), rows only for facts that
 * exist (centres, seats, scholarship test …), a primary call to action and a secondary link.
 * Nothing is estimated: without a date the title is omitted, without facts the rows are, and the
 * card is then simply the eyebrow and its calls to action. `placeholder` (or a row's own flag)
 * adds the DEMO badge (D-005). `data-surface="light"`: blue focus rings on white. Server-safe.
 */
export function NextBatchCard({
  eyebrow,
  title,
  rows = [],
  action,
  secondary,
  demoLabel,
  placeholder = false,
  compact = false,
  className,
}: {
  eyebrow: string;
  title?: string | null;
  rows?: readonly NextBatchRow[];
  action?: HeroLink;
  secondary?: HeroLink;
  /** `common.labels.demo`; required to show DEMO badges. */
  demoLabel?: string;
  /** The facts on the card are placeholder records. */
  placeholder?: boolean;
  /** Smaller padding and title, for the collage's corner on Admissions. */
  compact?: boolean;
  className?: string;
}) {
  const shownRows = rows.filter((row) => isFilled(row.value) && row.label.trim() !== "");
  const demo = demoLabel && (placeholder || shownRows.some((row) => row.placeholder));
  return (
    <div
      data-surface="light"
      className={cn(
        "rounded-card bg-white text-ink shadow-[0_28px_56px_-28px_rgb(0_0_0/0.65)]",
        compact ? "p-4" : "p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs font-bold tracking-[0.12em] text-blue uppercase">{eyebrow}</p>
        {demo && <DemoBadge label={demoLabel} />}
      </div>
      {isFilled(title) && (
        <p className={cn("m-0 mt-1 font-serif leading-tight font-bold text-navy", compact ? "text-xl" : "text-[1.75rem]")}>{title}</p>
      )}
      {shownRows.length > 0 && (
        <dl className="m-0 mt-3 flex flex-col text-sm">
          {shownRows.map((row, i) => (
            <div key={`${row.label}-${i}`} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-t border-line py-2.5">
              <dt className="text-muted">{row.label}</dt>
              <dd className="m-0 font-semibold break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(action || secondary) && (
        <div className={cn("flex flex-col", shownRows.length > 0 || isFilled(title) ? "mt-3" : "mt-4")}>
          {action && (
            <HeroAction href={action.href} variant="dark" className="w-full">
              {action.label}
            </HeroAction>
          )}
          {secondary && (
            <HeroAction href={secondary.href} variant="link" className="mt-1 w-full">
              {secondary.label}
            </HeroAction>
          )}
        </div>
      )}
    </div>
  );
}
