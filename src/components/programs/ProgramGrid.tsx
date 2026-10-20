import type { Locale } from "@/i18n/config";
import type { Program } from "@/lib/types";
import { ProgramCard, type ProgramCardMessages } from "./ProgramCard";

const columnClasses = {
  3: "grid gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3",
  // Four across only from `xl`, so cards keep readable widths with the wider gutters (2 × 2 below).
  4: "grid gap-6 sm:grid-cols-2 md:gap-8 xl:grid-cols-4 xl:gap-6",
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
