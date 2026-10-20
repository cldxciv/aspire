import "server-only";

import { getSyllabusTopics, MOCK_MINUTES } from "@/content/planner/syllabus";
import { capActivityToPlan } from "../caps";
import type { DateKey } from "../dates";
import { generatePlan } from "../plan";
import { planInputOf, sanitizeState, type PlannerState, type PlannerSettings } from "../state";
import type { StudyPlan } from "../types";

/** The plan the student's browser shows for these settings (same inputs as PlannerApp). */
export function planForSettings(settings: PlannerSettings | null): StudyPlan | null {
  if (!settings) return null;
  return generatePlan(planInputOf(settings), { topics: getSyllabusTopics(settings.exam), mockMinutes: MOCK_MINUTES[settings.exam] });
}

/**
 * PUT /api/planner/state clean-up (D-034, QA-SEC-M6 L8): history window and per-day XP clamp
 * (`sanitizeState`), then the plausibility caps from the student's own plan (`capActivityToPlan`).
 */
export function plausibleState(state: PlannerState, today: DateKey): PlannerState {
  const clean = sanitizeState(state, today);
  return capActivityToPlan(clean, planForSettings(clean.settings));
}
