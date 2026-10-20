import type { Locale } from "@/i18n/config";
import type { Program } from "@/lib/types";
import { ProgramCard, type ProgramCardMessages } from "./ProgramCard";

/**
 * While two columns show, an odd last card spans the row and is centred at one column's width
 * (half the row minus half the gap: gap-6, then md:gap-8), so it never sits alone at the left edge.
 */
const columnClasses = {
  3: "grid gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3 sm:max-lg:[&>li:last-child:nth-child(odd)]:col-span-2 sm:max-lg:[&>li:last-child:nth-child(odd)]:justify-self-center sm:max-lg:[&>li:last-child:nth-child(odd)]:w-[calc(50%-0.75rem)] md:max-lg:[&>li:last-child:nth-child(odd)]:w-[calc(50%-1rem)]",
  // Four across only from `xl`, so cards keep readable widths with the wider gutters (2 × 2 below).
  4: "grid gap-6 sm:grid-cols-2 md:gap-8 xl:grid-cols-4 xl:gap-6 sm:max-xl:[&>li:last-child:nth-child(odd)]:col-span-2 sm:max-xl:[&>li:last-child:nth-child(odd)]:justify-self-center sm:max-xl:[&>li:last-child:nth-child(odd)]:w-[calc(50%-0.75rem)] md:max-xl:[&>li:last-child:nth-child(odd)]:w-[calc(50%-1rem)]",
} as const;

/** Responsive list of program cards: 1 column on phones, 2 on tablets, 3 on desktop (4 from `xl`). */
export function ProgramGrid({
  programs,
  t,
  locale,
  columns = 4,
  showEnquire = false,
  showFacts = true,
  id,
}: {
  programs: Program[];
  t: ProgramCardMessages;
  locale: Locale;
  columns?: keyof typeof columnClasses;
  showEnquire?: boolean;
  /** Passed to each card; facts render only when the record has them. */
  showFacts?: boolean;
  id?: string;
}) {
  return (
    <ul id={id} className={columnClasses[columns]}>
      {programs.map((program) => (
        <li key={program.id}>
          <ProgramCard program={program} t={t} locale={locale} showEnquire={showEnquire} showFacts={showFacts} />
        </li>
      ))}
    </ul>
  );
}
