import type { Program } from "@/lib/types";
import { ProgramCard } from "./ProgramCard";

const columnClasses = {
  3: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
} as const;

/** Responsive list of program cards: 1 column on phones, 2 on tablets, 3–4 on desktop. */
export function ProgramGrid({
  programs,
  columns = 4,
  showEnquire = false,
  showFacts = true,
  id,
}: {
  programs: Program[];
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
          <ProgramCard program={program} showEnquire={showEnquire} showFacts={showFacts} />
        </li>
      ))}
    </ul>
  );
}
