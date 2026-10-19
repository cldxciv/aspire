import type { CardTint } from "@/components/ui";
import { aspireAssets, type AspireAsset } from "@/content/aspire-assets";
import type { ExamTrack } from "@/lib/types";

/**
 * Home-page presentation per exam track: label, program illustration (D-019) and
 * card tint from the mockup. Kept local to the home components so the home page
 * does not depend on the programs/results components' internals.
 */
export const TRACK_META: Record<ExamTrack, { label: string; illustration: AspireAsset; tint: CardTint }> = {
  JEE: { label: "IIT JEE", illustration: aspireAssets.iconIitProgram, tint: "blue" },
  NEET: { label: "NEET", illustration: aspireAssets.iconNeetProgram, tint: "gold" },
  Foundation: { label: "Foundation", illustration: aspireAssets.iconFoundationProgram, tint: "green" },
  Integrated: { label: "Integrated", illustration: aspireAssets.iconIntegratedProgram, tint: "violet" },
};
