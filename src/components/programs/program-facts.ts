import { format } from "@/i18n/format";
import enPrograms from "@/i18n/messages/en/programs";
import type { Messages } from "@/i18n/messages/types";
import type { Program } from "@/lib/types";

/**
 * Display strings for the course fields imported with each program. Values are
 * shown as stated by the record; absent fields are omitted, never estimated.
 * Pure functions, safe in server and client components. Labels and units come from the
 * `programs` messages (English defaults).
 */

export type ProgramUnits = Messages<"programs">["units"];
export type CardFactLabels = Messages<"programs">["card"]["facts"];
export type ScheduleFactLabels = Messages<"programs">["schedule"]["facts"];

export function formatHours(hours: number, units: ProgramUnits = enPrograms.units): string {
  return format(hours === 1 ? units.hourOne : units.hourMany, { count: hours });
}

export function formatMinutes(minutes: number, units: ProgramUnits = enPrograms.units): string {
  return format(units.minutes, { count: minutes });
}

export type ProgramFact = { label: string; value: string };

function present(facts: { label: string; value: string | undefined | false }[]): ProgramFact[] {
  return facts.filter((fact): fact is ProgramFact => typeof fact.value === "string" && fact.value.trim() !== "");
}

/** Short facts for a program card (class, duration, daily teaching, batch size). */
export function cardFacts(
  program: Program,
  labels: CardFactLabels = enPrograms.card.facts,
  units: ProgramUnits = enPrograms.units,
): ProgramFact[] {
  return present([
    { label: labels.class, value: program.classLevel },
    { label: labels.duration, value: program.duration },
    {
      label: labels.dailyTeaching,
      value: program.dailyContactHours !== undefined && formatHours(program.dailyContactHours, units),
    },
    { label: labels.batchSize, value: program.batchSize !== undefined && format(units.upTo, { count: program.batchSize }) },
  ]);
}

/** Schedule facts for the program detail page (everything time- or batch-related, plus fees if verified). */
export function scheduleFacts(
  program: Program,
  labels: ScheduleFactLabels = enPrograms.schedule.facts,
  units: ProgramUnits = enPrograms.units,
): ProgramFact[] {
  return present([
    { label: labels.duration, value: program.duration },
    { label: labels.deliveryMode, value: program.deliveryMode },
    {
      label: labels.dailyContactHours,
      value:
        program.dailyContactHours !== undefined &&
        format(units.perDay, { value: formatHours(program.dailyContactHours, units) }),
    },
    {
      label: labels.doubtResolution,
      value:
        program.doubtMinutesPerDay !== undefined &&
        format(units.perDay, { value: formatMinutes(program.doubtMinutesPerDay, units) }),
    },
    {
      label: labels.batchSize,
      value: program.batchSize !== undefined && format(units.upToStudents, { count: program.batchSize }),
    },
    { label: labels.fees, value: program.feeDisplay },
  ]);
}
