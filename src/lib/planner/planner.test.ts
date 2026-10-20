import { describe, expect, it } from "vitest";
import { getSyllabusTopics, MOCK_MINUTES } from "@/content/planner/syllabus";
import { applySettings, dueItems, openBlocksToday, recordReview, toggleBlock } from "./actions";
import { addDays, dateRange, diffDays, isDateKey, istDateKey, istInstant, istMinutesOfDay, weekday, weekStart } from "./dates";
import { buildIcs, foldIcsLine, revisionEvents } from "./ics";
import { nicknameIssue, normaliseNickname, suggestNickname } from "./nickname";
import { dailyShape, finalPhaseLength, generatePlan, planDayFor, PLAN_LIMITS } from "./plan";
import { applyBlockToggle, applyDailyGoal, applyReview, computeStreak, maxXpFor, weeklyXp, XP, type ActivityLog } from "./progress";
import { dueIds, newReviewState, previewIntervals, review, SRS } from "./srs";
import {
  DEFAULT_REMINDER_MINUTES,
  emptyState,
  isBitSet,
  parseState,
  pruneState,
  sanitizeState,
  STATE_LIMITS,
  type PlannerSettings,
  type PlannerState,
} from "./state";
import type { PlanInput } from "./types";

const topics = getSyllabusTopics("jee-main");
const options = { topics, mockMinutes: MOCK_MINUTES["jee-main"] };
const START = "2026-10-20";

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return { exam: "jee-main", batch: "12", startDate: START, examDate: "2027-01-24", dailyHours: 6, ...overrides };
}

function settings(overrides: Partial<PlannerSettings> = {}): PlannerSettings {
  return {
    exam: "jee-main",
    batch: "12",
    startDate: START,
    examDate: "2027-01-24",
    dailyHours: 6,
    weakTopics: [],
    reminderMinutes: DEFAULT_REMINDER_MINUTES,
    notifications: false,
    ...overrides,
  };
}

describe("dates (IST calendar days)", () => {
  it("maps instants to the IST day and minute", () => {
    // 2026-10-20 18:45 UTC = 2026-10-21 00:15 IST
    const instant = Date.UTC(2026, 9, 20, 18, 45);
    expect(istDateKey(instant)).toBe("2026-10-21");
    expect(istMinutesOfDay(instant)).toBe(15);
    expect(istInstant("2026-10-21", 15)).toBe(instant);
  });

  it("validates keys and does calendar arithmetic", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("26-1-1")).toBe(false);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-10-20", "2027-01-24")).toBe(96);
    expect(dateRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(weekday("2026-10-20")).toBe(2); // Tuesday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday → Monday before
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });
});

describe("generatePlan", () => {
  it("is deterministic and schedules nothing on or after the exam date", () => {
    const a = generatePlan(input(), options);
    const b = generatePlan(input(), options);
    expect(a).toEqual(b);
    expect(a.days).toHaveLength(96);
    expect(a.days[0].date).toBe(START);
    expect(a.days.at(-1)!.date).toBe("2027-01-23");
    expect(a.days.every((day) => day.date < "2027-01-24")).toBe(true);
  });

  it("keeps every day within the 9-block mask and gives blocks stable ids", () => {
    for (const hours of [1, 3.5, 8, 14]) {
      const plan = generatePlan(input({ dailyHours: hours }), options);
      for (const day of plan.days) {
        expect(day.blocks.length).toBeLessThanOrEqual(9);
        day.blocks.forEach((block, index) => {
          expect(block.index).toBe(index);
          expect(block.id).toBe(`${day.date}#${index}`);
          expect(block.minutes).toBeGreaterThan(0);
        });
      }
    }
  });

  it("covers every topic: learning sessions in the main phase, revision in the final phase", () => {
    const plan = generatePlan(input({ examDate: "2027-04-20" }), options);
    const learnt = new Set(plan.days.flatMap((d) => d.blocks.filter((b) => b.kind === "learn").flatMap((b) => b.topicIds)));
    const revised = new Set(plan.days.filter((d) => d.finalPhase).flatMap((d) => d.blocks.flatMap((b) => b.topicIds)));
    for (const topic of topics) {
      expect(learnt.has(topic.id)).toBe(true);
      expect(revised.has(topic.id)).toBe(true);
    }
    expect(plan.summary.unscheduledTopicIds).toEqual([]);
    expect(plan.days.some((d) => d.kind === "mock")).toBe(true);
    expect(plan.days.some((d) => d.kind === "buffer")).toBe(true);
    expect(plan.days.at(-1)!.kind).toBe("light");
  });

  it("gives weak topics twice the sessions", () => {
    const weak = ["phy-rotation"];
    const plan = generatePlan(input({ examDate: "2027-06-01", weakTopics: weak }), options);
    const count = (id: string) =>
      plan.days.flatMap((d) => d.blocks).filter((b) => (b.kind === "learn" || b.kind === "practice") && b.topicIds.includes(id)).length;
    expect(plan.summary.sessionsPerWeakTopic).toBe(plan.summary.sessionsPerTopic * 2);
    expect(count("phy-rotation")).toBeGreaterThanOrEqual(2 * count("phy-optics") - 1);
  });

  it("makes a short plan entirely final-phase revision", () => {
    const plan = generatePlan(input({ examDate: addDays(START, 10) }), options);
    expect(plan.days).toHaveLength(10);
    expect(plan.days.every((d) => d.finalPhase)).toBe(true);
    expect(finalPhaseLength(10)).toBe(10);
    expect(finalPhaseLength(400)).toBe(45);
  });

  it("returns an empty plan for a past exam date and bounds the horizon", () => {
    expect(generatePlan(input({ examDate: "2026-10-01" }), options).days).toEqual([]);
    expect(generatePlan(input({ examDate: "2035-01-01" }), options).days).toHaveLength(PLAN_LIMITS.maxDays);
  });

  it("splits the day into a spaced-revision block plus learning blocks", () => {
    expect(dailyShape(6)).toEqual({ dailyMinutes: 360, spacedMinutes: 55, learnBlocks: 5, blockMinutes: 60 });
    expect(dailyShape(1).learnBlocks).toBe(1);
    expect(dailyShape(14).learnBlocks).toBe(PLAN_LIMITS.maxLearnBlocks);
  });

  it("plans every exam's syllabus", () => {
    for (const exam of ["jee-main", "jee-advanced", "neet", "boh", "foundation"] as const) {
      const plan = generatePlan(input({ exam, batch: exam === "boh" || exam === "foundation" ? "10" : "11" }), {
        topics: getSyllabusTopics(exam),
        mockMinutes: MOCK_MINUTES[exam],
      });
      expect(plan.days.length).toBe(96);
    }
  });
});

describe("spaced repetition", () => {
  const today = "2026-10-20";

  it("follows the again / hard / good / easy rules", () => {
    const fresh = newReviewState(today);
    expect(fresh.due).toBe("2026-10-21");
    const good1 = review(fresh, "good", "2026-10-21");
    expect(good1.interval).toBe(1);
    const good2 = review(good1, "good", "2026-10-22");
    expect(good2.interval).toBe(3);
    const good3 = review(good2, "good", "2026-10-25");
    expect(good3.interval).toBe(8); // round(3 × 2.5)
    const again = review(good3, "again", "2026-11-02");
    expect(again).toMatchObject({ interval: 0, reps: 0, lapses: 1, ease: 230, due: "2026-11-02" });
    expect(review(undefined, "easy", today)).toMatchObject({ interval: 4, ease: 265 });
    expect(previewIntervals(undefined, today)).toEqual({ again: 0, hard: 1, good: 1, easy: 4 });
  });

  it("keeps ease and interval within bounds", () => {
    let state = newReviewState(today);
    for (let i = 0; i < 30; i += 1) state = review(state, "easy", state.due);
    expect(state.ease).toBe(SRS.maxEase);
    expect(state.interval).toBe(SRS.maxInterval);
    for (let i = 0; i < 30; i += 1) state = review(state, "again", state.due);
    expect(state.ease).toBe(SRS.minEase);
  });

  it("lists due items, most overdue first", () => {
    const states = {
      b: { ...newReviewState(today), due: "2026-10-19" },
      a: { ...newReviewState(today), due: "2026-10-18" },
      c: { ...newReviewState(today), due: "2026-10-21" },
    };
    expect(dueIds(states, today)).toEqual(["a", "b"]);
  });
});

describe("XP and streaks", () => {
  it("moves block XP and the daily bonus both ways", () => {
    let day = applyBlockToggle(undefined, "learn", true);
    expect(day).toEqual([10, 1, 0, 0]);
    day = applyDailyGoal(day, true);
    expect(day).toEqual([30, 1, 0, 1]);
    day = applyDailyGoal(applyBlockToggle(day, "learn", false), false);
    expect(day).toEqual([0, 0, 0, 0]);
  });

  it("stops review XP after the daily cap and clamps what the server accepts", () => {
    let day = undefined as ReturnType<typeof applyReview> | undefined;
    for (let i = 0; i < XP.maxReviewsPerDay + 10; i += 1) day = applyReview(day);
    expect(day).toEqual([XP.maxReviewsPerDay * XP.review, 0, XP.maxReviewsPerDay + 10, 0]);
    expect(maxXpFor([0, 2, 0, 1])).toBe(2 * XP.maxBlockXp + XP.dailyGoalBonus);
    expect(maxXpFor([0, 9, 9999, 1])).toBe(9 * XP.maxBlockXp + XP.maxReviewsPerDay * XP.review + XP.dailyGoalBonus);
    expect(maxXpFor([0, 100, 9999, 1])).toBe(XP.maxDailyXp);
  });

  it("counts streaks with freezes; today stays open", () => {
    const log: ActivityLog = {};
    for (const date of dateRange("2026-10-01", "2026-10-07")) log[date] = [10, 1, 0, 0];
    // 10-08 missed (freeze used), 10-09 active, 10-10 (today) not yet.
    log["2026-10-09"] = [10, 1, 0, 0];
    const streak = computeStreak(log, "2026-10-10");
    expect(streak).toMatchObject({ current: 8, best: 8, freezes: 0, frozenDates: ["2026-10-08"], todayDone: false });
    // Two missed days with no freeze left → reset.
    expect(computeStreak(log, "2026-10-12").current).toBe(0);
    expect(computeStreak({}, "2026-10-10")).toMatchObject({ current: 0, best: 0 });
  });

  it("sums this IST week (Monday to today)", () => {
    const log: ActivityLog = { "2026-10-18": [50, 1, 0, 0], "2026-10-19": [20, 1, 0, 0], "2026-10-20": [5, 0, 1, 0] };
    expect(weeklyXp(log, "2026-10-20")).toBe(25);
  });
});

describe("saved state", () => {
  it("parses only valid documents", () => {
    expect(parseState(emptyState())).toEqual(emptyState());
    expect(parseState({ ...emptyState(), v: 2 })).toBeNull();
    expect(parseState({ ...emptyState(), done: { "2026-02-30": 1 } })).toBeNull();
    expect(parseState({ ...emptyState(), settings: settings({ dailyHours: 2.25 }) })).toBeNull();
    expect(parseState("nope")).toBeNull();
  });

  it("server sanitising drops old / future days and clamps XP to the counts", () => {
    const today = "2026-10-20";
    const state: PlannerState = {
      ...emptyState(),
      activity: {
        "2026-10-20": [99_999, 1, 0, 0],
        "2026-10-21": [10, 1, 0, 0],
        "2024-01-01": [10, 1, 0, 0],
        "2026-10-19": [8, 1, 0, 0],
      },
      done: { "2026-10-20": 1, "2026-10-21": 1, "2026-10-25": 1, "2026-10-19": 0 },
    };
    const clean = sanitizeState(state, today);
    expect(clean.activity).toEqual({ "2026-10-20": [30, 1, 0, 0], "2026-10-19": [8, 1, 0, 0] });
    expect(clean.done).toEqual({ "2026-10-20": 1, "2026-10-21": 1 });
  });

  it("a full year of heavy use stays far below the request limit", () => {
    const today = "2026-10-20";
    let state: PlannerState = { ...emptyState(), settings: settings({ weakTopics: topics.slice(0, 40).map((t) => t.id) }) };
    for (const date of dateRange(addDays(today, -399), today)) {
      state.activity[date] = [400, 9, 2000, 1];
      state.done[date] = STATE_LIMITS.maxDoneMask;
    }
    for (let i = 0; i < STATE_LIMITS.maxReviewItems; i += 1) {
      state.cards[`card-${i}`] = [250, 180, 99, 9, today];
      state.topics[`topic-${i}`] = [250, 180, 99, 9, today];
    }
    state = pruneState(state, today);
    expect(parseState(state)).not.toBeNull();
    expect(new TextEncoder().encode(JSON.stringify({ state })).length).toBeLessThan(STATE_LIMITS.maxBytes);
  });
});

describe("actions", () => {
  const today = "2026-10-20";
  const plan = generatePlan(input({ startDate: today }), options);
  const day = planDayFor(plan, today)!;
  const base: PlannerState = { ...emptyState(), settings: settings({ startDate: today }) };

  it("ticks today's blocks, adds topics to revision and pays the daily bonus once all are done", () => {
    let state = toggleBlock(base, plan, today, 0, true);
    expect(isBitSet(state.done[today], 0)).toBe(true);
    expect(state.activity[today][0]).toBe(XP.block[day.blocks[0].kind]);
    expect(Object.keys(state.topics)).toEqual(day.blocks[0].topicIds);
    expect(state.topics[day.blocks[0].topicIds[0]][4]).toBe("2026-10-21");
    expect(toggleBlock(state, plan, today, 0, true)).toBe(state); // no double tick

    for (const block of day.blocks) state = toggleBlock(state, plan, today, block.index, true);
    expect(state.activity[today][3]).toBe(1);
    expect(openBlocksToday(state, plan, today)).toBe(0);

    state = toggleBlock(state, plan, today, 0, false);
    expect(state.activity[today][3]).toBe(0);
    expect(openBlocksToday(state, plan, today)).toBe(1);
  });

  it("only ticks days that exist in the plan", () => {
    expect(toggleBlock(base, plan, "2030-01-01", 0, true)).toBe(base);
    expect(toggleBlock(base, plan, today, 42, true)).toBe(base);
  });

  it("records reviews with XP and finds due items", () => {
    let state = recordReview(base, "card", "phy-projectile", "good", today);
    expect(state.cards["phy-projectile"][4]).toBe("2026-10-21");
    expect(state.activity[today]).toEqual([XP.review, 0, 1, 0]);
    state = recordReview(state, "topic", "phy-units", "again", today);
    const due = dueItems(state, today, new Set(["phy-projectile"]), new Set(["phy-units"]));
    expect(due).toEqual({ topics: ["phy-units"], cards: [] });
    expect(dueItems(state, "2026-10-21", new Set(["phy-projectile"]), new Set()).cards).toEqual(["phy-projectile"]);
  });

  it("rebuilds the plan from today only when a planning field changes", () => {
    const withTicks: PlannerState = { ...base, done: { "2026-10-18": 1, [today]: 3 }, activity: { [today]: [20, 2, 0, 0] } };
    const later = "2026-10-20";
    const sameInput = applySettings(withTicks, { ...withTicks.settings!, reminderMinutes: 7 * 60 }, later);
    expect(sameInput.settings!.reminderMinutes).toBe(420);
    expect(sameInput.done).toEqual(withTicks.done);
    expect(applySettings(withTicks, withTicks.settings!, later)).toBe(withTicks);

    const changed = applySettings(withTicks, { ...withTicks.settings!, dailyHours: 4, startDate: "2026-01-01" }, later);
    expect(changed.settings!.startDate).toBe(later);
    expect(changed.done).toEqual({ "2026-10-18": 1 });
    expect(changed.activity).toEqual(withTicks.activity);
  });
});

describe(".ics export", () => {
  it("writes a valid calendar with UTC times from IST, escaped and folded", () => {
    const ics = buildIcs(
      [{ uid: "x@planner.aspire", date: "2026-10-21", startMinutes: 18 * 60, durationMinutes: 30, summary: "Revise; maths, physics", alarmMinutesBefore: 10 }],
      { calendarName: "Aspire", now: Date.UTC(2026, 9, 20, 6, 0, 0) },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261021T123000Z");
    expect(ics).toContain("DTEND:20261021T130000Z");
    expect(ics).toContain("SUMMARY:Revise\\; maths\\, physics");
    expect(ics).toContain("TRIGGER:-PT10M");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long Hindi lines without splitting a character", () => {
    const line = `SUMMARY:${"विषय: गति के नियम, ".repeat(10)}`;
    const folded = foldIcsLine(line);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n ").join("")).toBe(line);
  });

  it("creates one event per revision or mock day from today", () => {
    const plan = generatePlan(input(), options);
    const events = revisionEvents(plan.days, {
      from: "2026-11-01",
      startMinutes: 18 * 60,
      text: { spaced: "S", revision: "R", mock: "M", describe: (ids) => ids.join(",") },
    });
    expect(events.length).toBeGreaterThan(50);
    expect(events.every((e) => e.date >= "2026-11-01")).toBe(true);
    expect(events.some((e) => e.summary === "M")).toBe(true);
    expect(new Set(events.map((e) => e.uid)).size).toBe(events.length);
  });
});

describe("nicknames", () => {
  it("accepts pseudonyms and rejects ids, numbers and official-looking names", () => {
    expect(nicknameIssue("Riya S.")).toBeNull();
    expect(nicknameIssue("  रिया   एस ")).toBeNull();
    expect(nicknameIssue("x")).toBe("length");
    expect(nicknameIssue("a".repeat(21))).toBe("length");
    expect(nicknameIssue("riya@mail")).toBe("characters");
    expect(nicknameIssue("riya 98765")).toBe("contact");
    expect(nicknameIssue("Aspire Topper")).toBe("reserved");
    expect(normaliseNickname("  a   b ")).toBe("a b");
  });

  it("rejects a nickname that contains the account's login id (QA-SEC-M6, D-034)", () => {
    expect(nicknameIssue("riya.sharma", { loginId: "riya.sharma" })).toBe("contact");
    expect(nicknameIssue("Riya Sharma", { loginId: "riya.sharma" })).toBe("contact");
    expect(nicknameIssue("the RIYA_SHARMA x", { loginId: "riya.sharma" })).toBe("contact");
    expect(nicknameIssue("riya x", { loginId: "riya@x" })).toBe("contact");
    expect(nicknameIssue("Riya S.", { loginId: "riya.sharma" })).toBeNull();
    expect(nicknameIssue("Riya S.", { loginId: null })).toBeNull();
    expect(suggestNickname("Riya Sharma", "riya")).toBeNull();
    expect(suggestNickname("Riya Sharma", "riya.sharma")).toBe("Riya S.");
  });

  it("suggests first name + initial", () => {
    expect(suggestNickname("Riya Sharma")).toBe("Riya S.");
    expect(suggestNickname("Arjun")).toBe("Arjun");
    expect(suggestNickname("Test student 12345")).toBe("Test S.");
    expect(suggestNickname("रिया शर्मा")).toBe("रिया श.");
    expect(suggestNickname("")).toBeNull();
    expect(suggestNickname("Admin User")).toBeNull();
  });
});
