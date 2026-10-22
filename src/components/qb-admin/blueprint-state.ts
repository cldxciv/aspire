import type { QbBlueprint, QbBlueprintSection, QbMix } from "@/lib/qb/types";
import type { QbBlueprintEditable } from "./contract";

/** Pure helpers of the blueprint editor (client-safe, tested). */

/** The editable part of a blueprint: identity, status, placeholder, confirmation and sign-off stay out. */
export function editableFromBlueprint(blueprint: QbBlueprint): QbBlueprintEditable {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- these change through actions only
  const { id, slot, version, status, exam, placeholder, patternConfirmedBy, signoff, ...editable } = blueprint;
  return structuredClone(editable);
}

/** Questions, full marks and minutes of a blueprint (all parts). */
export function blueprintTotals(blueprint: Pick<QbBlueprintEditable, "parts">): { questions: number; marks: number; minutes: number } {
  let questions = 0;
  let marks = 0;
  let minutes = 0;
  for (const part of blueprint.parts) {
    minutes += part.durationMinutes;
    for (const section of part.sections) {
      questions += section.count;
      marks += section.count * section.marking.correct;
    }
  }
  return { questions, marks, minutes };
}

/** Updates one section (by part index and section index), leaving the rest untouched. */
export function updateSection(
  blueprint: QbBlueprintEditable,
  partIndex: number,
  sectionIndex: number,
  change: Partial<QbBlueprintSection>,
): QbBlueprintEditable {
  return {
    ...blueprint,
    parts: blueprint.parts.map((part, p) =>
      p !== partIndex ? part : { ...part, sections: part.sections.map((section, s) => (s !== sectionIndex ? section : { ...section, ...change })) },
    ),
  };
}

/** A section's own mix, or undefined to use the blueprint's. */
export function sectionMix(section: QbBlueprintSection, fallback: QbMix): QbMix {
  return section.difficultyMix ?? fallback;
}

/** 0.2 → "20"; null → "". For percent inputs over 0–1 shares. */
export function shareToPercentText(share: number | null): string {
  return share === null ? "" : String(Math.round(share * 1000) / 10);
}

/** "20" → 0.2; "" → null; out of range or not a number → undefined (keep the old value). */
export function percentTextToShare(text: string): number | null | undefined {
  if (text.trim() === "") return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 100) return undefined;
  return Math.round(value * 10) / 1000;
}
