import type { Program } from "@/lib/types";

/**
 * Display strings for the course fields imported with each program. Values are
 * shown as stated by the record; absent fields are omitted, never estimated.
 * Pure functions, safe in server and client components.
 */

export function formatHours(hours: number): string {
  return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
}

export function formatMinutes(minutes: number): string {
  return `${minutes} min`;
}

export type ProgramFact = { label: string; value: string };

function present(facts: { label: string; value: string | undefined | false }[]): ProgramFact[] {
  return facts.filter((fact): fact is ProgramFact => typeof fact.value === "string" && fact.value.trim() !== "");
}

/** Short facts for a program card (class, duration, daily teaching, batch size). */
export function cardFacts(program: Program): ProgramFact[] {
  return present([
    { label: "Class", value: program.classLevel },
    { label: "Duration", value: program.duration },
    {
      label: "Daily teaching",
      value: program.dailyContactHours !== undefined && formatHours(program.dailyContactHours),
    },
    { label: "Batch size", value: program.batchSize !== undefined && `Up to ${program.batchSize}` },
  ]);
}

/** Schedule facts for the program detail page (everything time- or batch-related, plus fees if verified). */
export function scheduleFacts(program: Program): ProgramFact[] {
  return present([
    { label: "Duration", value: program.duration },
    { label: "Delivery mode", value: program.deliveryMode },
    {
      label: "Daily contact hours",
      value: program.dailyContactHours !== undefined && `${formatHours(program.dailyContactHours)} per day`,
    },
    {
      label: "Doubt resolution",
      value: program.doubtMinutesPerDay !== undefined && `${formatMinutes(program.doubtMinutesPerDay)} per day`,
    },
    { label: "Batch size", value: program.batchSize !== undefined && `Up to ${program.batchSize} students` },
    { label: "Fees", value: program.feeDisplay },
  ]);
}
