import type { NextBatchRow } from "@/components/hero/NextBatchCard";
import type { PickerProgram } from "@/components/hero/program-picker-data";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import type { Program } from "@/lib/types";
import { EXAM_ORDER, programTracks, trackLabel, type TrackLabels } from "./exam-meta";
import { formatHours } from "./program-facts";

/**
 * View-model helpers for the Programs heroes (2026-10-22 hero redesign: B frame + D picker on
 * /programs, B frame with the program's own facts on /programs/[slug]). Pure; every value is a
 * field of the program records, as stated. Absent fields are left out, never estimated.
 */

/**
 * The tracks the listed programs prepare for, in display order, as the hero's eyebrow line
 * ("IIT JEE · NEET · Foundation · Integrated"). Empty when no program is listed (production
 * while the records are placeholders), so the eyebrow then disappears.
 */
export function programTrackLine(
  programs: readonly Pick<Program, "exam" | "tracks">[],
  labels?: TrackLabels,
): string {
  const tracks = new Set(programs.flatMap((program) => programTracks(program)));
  return EXAM_ORDER.filter((track) => tracks.has(track))
    .map((track) => trackLabel(track, labels))
    .join(" · ");
}

/**
 * The picker's chips must tell the programs apart: each chip is a toggle button named by its text.
 * A class level shared by two programs (separate JEE and NEET batches for Class XI, say) gets the
 * program's tracks added ("Class XI · NEET"); a label still shared after that becomes the program's
 * title. Only record values, nothing invented; unique labels are left as they are.
 */
export function distinctChips<T extends Pick<PickerProgram, "chip" | "eyebrow" | "title">>(views: readonly T[]): T[] {
  const isShared = (labels: readonly string[]) => {
    const counts = new Map<string, number>();
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
    return (label: string) => (counts.get(label) ?? 0) > 1;
  };
  const sharedChip = isShared(views.map((view) => view.chip));
  const withTracks = views.map((view) =>
    sharedChip(view.chip) && view.eyebrow ? `${view.chip} · ${view.eyebrow}` : view.chip,
  );
  const stillShared = isShared(withTracks);
  return views.map((view, i) => {
    const chip = stillShared(withTracks[i]) ? view.title : withTracks[i];
    return chip === view.chip ? view : { ...view, chip };
  });
}

/**
 * Rows of the white card beside a program page's headline: batch / cohort, delivery mode, daily
 * teaching hours and fees (`feeDisplay` is stored only once Aspire has verified it). The class,
 * duration and batch size sit in the facts strip under the headline, so they are not repeated.
 * Rows without a value are hidden by `NextBatchCard`.
 */
export function programBatchRows(
  program: Pick<Program, "cohortName" | "deliveryMode" | "dailyContactHours" | "feeDisplay" | "status">,
  t: Pick<Messages<"programs">, "detail" | "schedule" | "units">,
): NextBatchRow[] {
  const hours = program.dailyContactHours;
  const placeholder = program.status === "placeholder";
  const rows: NextBatchRow[] = [
    { label: t.detail.facts.cohort, value: program.cohortName },
    { label: t.schedule.facts.deliveryMode, value: program.deliveryMode },
    {
      label: t.schedule.facts.dailyContactHours,
      value:
        typeof hours === "number" && Number.isFinite(hours)
          ? format(t.units.perDay, { value: formatHours(hours, t.units) })
          : undefined,
    },
    { label: t.schedule.facts.fees, value: program.feeDisplay },
  ];
  return rows.map((row) => ({ ...row, placeholder }));
}
