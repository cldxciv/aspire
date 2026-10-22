import { defaultBlueprint } from "@/lib/qb/patterns";
import { QB_SLOTS, type QbBlueprint } from "@/lib/qb/types";

/**
 * The four default blueprints of docs/question-bank-plan.md §B1.3, seeded as version-1 DRAFTS
 * (QB-SEED). Nothing goes live until an admin publishes a blueprint; the BOH blueprint is a marked
 * placeholder (`placeholder: true`) that cannot be published until an admin confirms its pattern
 * (QB-CORE-B enforces that). The definitions come straight from `defaultBlueprint()` (patterns.ts), so
 * the seed never holds pattern numbers of its own.
 */
export function seedBlueprints(): QbBlueprint[] {
  return QB_SLOTS.map((slot) => {
    const blueprint = defaultBlueprint(slot);
    if (blueprint.status !== "draft" || blueprint.version !== 1) {
      throw new Error(`defaultBlueprint(${slot}) must be a v1 draft`);
    }
    return blueprint;
  });
}
