import { describe, expect, it } from "vitest";
import { getSyllabusTopics, MOCK_MINUTES } from "@/content/planner/syllabus";
import { capActivityToPlan, PLANNER_CAPS } from "./caps";
import { addDays } from "./dates";
import { generatePlan } from "./plan";
import { XP } from "./progress";
import { emptyState, type PlannerState } from "./state";

/** QA-SEC-M6 L8: self-reported planner points are capped to what the student's own plan allows. */

const START = "2026-10-20";
const plan = generatePlan(
  { exam: "jee-main", batch: "12", startDate: START, examDate: "2027-01-24", dailyHours: 6 },
  { topics: getSyllabusTopics("jee-main"), mockMinutes: MOCK_MINUTES["jee-main"] },
);
const dayXp = (date: string) => plan.days.find((d) => d.date === date)!.blocks.reduce((sum, b) => sum + XP.block[b.kind], 0);

function withActivity(activity: PlannerState["activity"], done: PlannerState["done"] = {}): PlannerState {
  return { ...emptyState(), activity, done };
}

describe("capActivityToPlan", () => {
  it("keeps an honest day unchanged", () => {
    const day = plan.days[0];
    const xp = XP.block[day.blocks[0].kind] + 3 * XP.review;
    const state = withActivity({ [START]: [xp, 1, 3, 0] }, { [START]: 1 });
    expect(capActivityToPlan(state, plan)).toEqual(state);
  });

  it("caps blocks to the plan day's count, XP to its blocks + reviews + bonus, reviews per day", () => {
    const day = plan.days[0];
    const capped = capActivityToPlan(withActivity({ [START]: [100_000, 9, 5000, 1] }, { [START]: 511 }), plan);
    expect(capped.activity[START]).toEqual([
      Math.min(XP.maxDailyXp, dayXp(START) + XP.maxReviewsPerDay * XP.review + XP.dailyGoalBonus),
      day.blocks.length,
      PLANNER_CAPS.maxReviewsPerDay,
      1,
    ]);
    expect(capped.done[START]).toBe((1 << day.blocks.length) - 1);
  });

  it("the daily-goal bonus needs every block of the day; XP follows the most valuable ticked blocks", () => {
    const capped = capActivityToPlan(withActivity({ [START]: [500, 1, 0, 1] }), plan);
    const best = Math.max(...plan.days[0].blocks.map((b) => XP.block[b.kind]));
    expect(capped.activity[START]).toEqual([best, 1, 0, 0]);
  });

  it("days before the plan started are capped by the plan's busiest day; days on or after the exam have no blocks", () => {
    const busiest = Math.max(...plan.days.map((d) => d.blocks.length));
    const before = addDays(START, -3);
    const examDay = "2027-01-24";
    const capped = capActivityToPlan(withActivity({ [before]: [100_000, 50, 0, 0], [examDay]: [100_000, 5, 0, 1] }), plan);
    expect(capped.activity[before][1]).toBe(busiest);
    expect(capped.activity[before][0]).toBeLessThanOrEqual(busiest * XP.maxBlockXp);
    expect(capped.activity[examDay]).toEqual([0, 0, 0, 0]);
  });

  it("without a plan the generic ceiling applies", () => {
    const capped = capActivityToPlan(withActivity({ [START]: [100_000, 50, 0, 1] }), null);
    expect(capped.activity[START]).toEqual([
      PLANNER_CAPS.genericMaxBlocks * XP.maxBlockXp + XP.dailyGoalBonus,
      PLANNER_CAPS.genericMaxBlocks,
      0,
      1,
    ]);
  });
});
