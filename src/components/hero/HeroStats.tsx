import { DemoBadge } from "@/components/ui/Feedback";
import { cn } from "@/lib/cn";
import { isFilled } from "./hero-text";
import { HERO_DIVIDED_ROW, dividedCols } from "./hero-styles";

/** One proof figure. `value` exactly as stated by the data (e.g. a `Stat.value`); a missing or "[N]" value hides the figure. */
export type ProofStat = { value?: string | number | null; label: string; placeholder?: boolean };

/**
 * A · three proof figures under the hero's calls to action: big gold serif values over short
 * labels, hairline dividers between them. Shows only figures whose value exists (at most `max`,
 * default 3) and renders nothing when none does, so a missing fact is omitted, never estimated.
 * Placeholder figures carry the DEMO badge (D-005). A labelled list, read as "13+ Years". Server-safe.
 */
export function ProofStats({
  stats,
  label,
  demoLabel,
  max = 3,
  className,
}: {
  stats: readonly ProofStat[];
  /** Accessible name of the list, e.g. "Aspire in numbers". */
  label: string;
  /** `common.labels.demo`. */
  demoLabel: string;
  max?: number;
  className?: string;
}) {
  const shown = stats.filter((stat) => isFilled(stat.value) && stat.label.trim() !== "").slice(0, Math.max(max, 0));
  if (shown.length === 0) return null;
  return (
    <ul aria-label={label} className={cn("m-0 list-none p-0", HERO_DIVIDED_ROW, dividedCols(shown.length), className)}>
      {shown.map((stat, i) => (
        <li key={`${stat.label}-${i}`} className="min-w-0">
          <span className="block font-serif text-[1.625rem] leading-none font-bold break-words text-gold sm:text-[1.875rem]">
            {stat.value}
          </span>{" "}
          <span className="mt-1.5 block text-[13px] leading-snug text-[#b9d3f3]">{stat.label}</span>
          {stat.placeholder && <DemoBadge label={demoLabel} className="mt-2" />}
        </li>
      ))}
    </ul>
  );
}

/** One fact of a program (class, duration, batch size …), value as stated by the record. */
export type HeroFact = { label: string; value?: string | number | null };

/**
 * D · facts strip: small labels over bold values with hairline dividers (a `<dl>`). Only facts
 * with a value render (at most `max`, default 3); nothing renders when none has one, so "Next
 * batch" or "Duration" simply disappear when the data has no date or duration. Server-safe (also
 * used inside the `ProgramPicker` island).
 */
export function HeroFactsStrip({
  facts,
  label,
  max = 3,
  className,
}: {
  facts: readonly HeroFact[];
  /** Optional accessible name, e.g. the program title. */
  label?: string;
  max?: number;
  className?: string;
}) {
  const shown = facts.filter((fact) => isFilled(fact.value) && fact.label.trim() !== "").slice(0, Math.max(max, 0));
  if (shown.length === 0) return null;
  return (
    <dl aria-label={label} className={cn("m-0", HERO_DIVIDED_ROW, dividedCols(shown.length), className)}>
      {shown.map((fact, i) => (
        <div key={`${fact.label}-${i}`} className="min-w-0">
          <dt className="text-xs leading-snug text-[#b9d3f3]">{fact.label}</dt>
          <dd className="m-0 mt-1 text-sm leading-snug font-bold break-words text-white sm:text-base">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
