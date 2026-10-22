import { blueprintSubjects, defaultBlueprint } from "@/lib/qb/patterns";
import { SEED_CHAPTERS } from "@/lib/qb/seed/chapters";
import type { Bilingual, QbSlot } from "@/lib/qb/types";

/**
 * Chapter names for a generated paper's result (strengths and review), for SERVER pages only: the
 * seeded NCERT-aligned chapters of the exam's subjects (code constants, so the page stays static and
 * only this small map reaches the browser). They include every sample-test topic. Chapters staff add
 * later are not here and show their id (`chapterLabelOf`).
 */
export function chapterLabelsFor(slot: QbSlot): Record<string, Bilingual> {
  const subjects = new Set(blueprintSubjects(defaultBlueprint(slot)));
  return Object.fromEntries(SEED_CHAPTERS.filter((c) => subjects.has(c.subject)).map((c) => [c.id, { en: c.label.en, hi: c.label.hi }]));
}
