import type { QbDifficulty, QbMix } from "@/lib/qb/types";
import { QB_ADMIN_DIFFICULTIES } from "./constants";

/**
 * Difficulty-mix sliders of the blueprint editor (§B1.3, §B9.3). A mix is three whole percentages
 * that always add up to 100. Moving one slider shares the change among the other two in
 * proportion to their current values (evenly when both are 0), with largest-remainder rounding.
 * Client-safe and pure.
 */

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));

export function mixSum(mix: QbMix): number {
  return mix.easy + mix.medium + mix.hard;
}

/** Whole numbers 0–100 that add up to exactly 100. */
export function isValidMix(mix: QbMix): boolean {
  return QB_ADMIN_DIFFICULTIES.every((key) => Number.isInteger(mix[key]) && mix[key] >= 0 && mix[key] <= 100) && mixSum(mix) === 100;
}

/** Splits `total` over `weights` by largest remainder (ties go to the earlier key). */
function apportion(total: number, keys: readonly QbDifficulty[], weights: Record<QbDifficulty, number>): Record<QbDifficulty, number> {
  const out: Record<QbDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
  const weightSum = keys.reduce((sum, key) => sum + Math.max(0, weights[key]), 0);
  const shares = keys.map((key) => {
    const exact = weightSum > 0 ? (total * Math.max(0, weights[key])) / weightSum : total / keys.length;
    return { key, floor: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = total - shares.reduce((sum, share) => sum + share.floor, 0);
  for (const share of shares) out[share.key] = share.floor;
  for (const share of [...shares].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    out[share.key] += 1;
    left -= 1;
  }
  return out;
}

/** Sets one difficulty to `value` (clamped to 0–100) and rebalances the other two so the sum is 100. */
export function setMixValue(mix: QbMix, key: QbDifficulty, value: number): QbMix {
  const target = clampPercent(value);
  const others = QB_ADMIN_DIFFICULTIES.filter((other) => other !== key);
  const rest = apportion(100 - target, others, mix);
  return { ...rest, [key]: target } as QbMix;
}

/** Scales any non-negative mix to whole percentages that add up to 100 (`{0,0,0}` → an even split). */
export function normaliseMix(mix: QbMix): QbMix {
  return apportion(100, QB_ADMIN_DIFFICULTIES, mix);
}

/** Question counts per difficulty for a section of `count` questions (largest remainder, as the generator does). */
export function mixCounts(mix: QbMix, count: number): Record<QbDifficulty, number> {
  return apportion(Math.max(0, Math.trunc(count)), QB_ADMIN_DIFFICULTIES, mix);
}
