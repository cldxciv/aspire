import { Atom, BookOpen, Stethoscope, Target, type LucideIcon } from "lucide-react";
import type { CardTint } from "@/components/ui";
import { aspireAssets, type AspireAsset } from "@/content/aspire-assets";
import type { Messages } from "@/i18n/messages/types";
import type { ExamTrack } from "@/lib/types";

/**
 * Presentation metadata per exam track (icon, card tint and program
 * illustration). Shared by program, result and centre components. No content claims here.
 */
export interface ExamMeta {
  label: string;
  Icon: LucideIcon;
  tint: CardTint;
  /** Decorative program illustration (alt=""); render with <AspireImage>, never past its maxWidth. */
  illustration: AspireAsset;
}

export const EXAM_META: Record<ExamTrack, ExamMeta> = {
  JEE: { label: "IIT JEE", Icon: Atom, tint: "blue", illustration: aspireAssets.iconIitProgram },
  NEET: { label: "NEET", Icon: Stethoscope, tint: "gold", illustration: aspireAssets.iconNeetProgram },
  Foundation: { label: "Foundation", Icon: BookOpen, tint: "green", illustration: aspireAssets.iconFoundationProgram },
  Integrated: { label: "Integrated", Icon: Target, tint: "violet", illustration: aspireAssets.iconIntegratedProgram },
};

/** Display order for filters and option lists. */
export const EXAM_ORDER: readonly ExamTrack[] = ["JEE", "NEET", "Foundation", "Integrated"];

/** Every track a program prepares for (`tracks`, else its primary `exam`), in display order. */
export function programTracks(program: { exam: ExamTrack; tracks?: ExamTrack[] }): ExamTrack[] {
  const tracks = program.tracks && program.tracks.length > 0 ? program.tracks : [program.exam];
  return EXAM_ORDER.filter((track) => tracks.includes(track));
}

/** Localised track labels (`programs.tracks` messages). */
export type TrackLabels = Messages<"programs">["tracks"];

/** A track's display label in the page's language (English EXAM_META label without `labels`). */
export function trackLabel(track: ExamTrack, labels?: TrackLabels): string {
  return labels?.[track] ?? EXAM_META[track].label;
}
