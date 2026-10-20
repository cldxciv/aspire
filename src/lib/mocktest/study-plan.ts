import type { StrengthLevel } from "./scoring";

/**
 * Personalised 30-day study plan (pure, client-safe, rule-based — no AI, no invented outcomes).
 * Exported for reuse by the study planner (A4-PLANNER).
 *
 * Rules:
 * 1. Topics are ordered by need: weak and skipped first (lowest mastery first), then developing,
 *    then strong.
 * 2. Each topic becomes study sessions: weak / skipped → learn + practice + practice;
 *    developing → learn + practice; strong → practice.
 * 3. Study days take two sessions each, alternating subjects where possible. When the queue runs
 *    out, mixed practice of the weakest topics fills the remaining study days.
 * 4. Every 7th day (7, 14, 21, 28) is a revision day: the topics studied in the previous six days
 *    (spaced repetition), plus one strong topic for upkeep.
 * 5. Day 29 revises the weakest topics again; day 30 is a full timed mock test with analysis.
 */

export interface PlanTopicInput {
  subject: string;
  topic: string;
  /** 0–1: share of the topic's questions answered correctly. */
  mastery: number;
  level: StrengthLevel;
}

export type StudyBlockKind = "learn" | "practice" | "revise" | "mock";

export interface StudyBlock {
  kind: StudyBlockKind;
  /** Absent for the full mock block. */
  subject?: string;
  topic?: string;
  minutes: number;
}

export type StudyDayType = "study" | "revision" | "mock";

export interface StudyDay {
  /** 1-based day number. */
  day: number;
  type: StudyDayType;
  blocks: StudyBlock[];
}

export interface StudyPlanOptions {
  /** Default 30. */
  days?: number;
  /** Minutes per block (defaults: learn 60, practice 45, revise 30, mock 180). */
  minutes?: Partial<Record<StudyBlockKind, number>>;
}

const DEFAULT_MINUTES: Record<StudyBlockKind, number> = { learn: 60, practice: 45, revise: 30, mock: 180 };
const REVISION_DAY_INTERVAL = 7;
const MAX_REVISION_BLOCKS = 4;

const LEVEL_ORDER: Record<StrengthLevel, number> = { skipped: 0, weak: 0, developing: 1, strong: 2 };

/** Topics in priority order (most need first; stable for equal values). */
export function prioritiseTopics<T extends PlanTopicInput>(topics: readonly T[]): T[] {
  return topics
    .map((topic, index) => ({ topic, index }))
    .sort(
      (a, b) =>
        LEVEL_ORDER[a.topic.level] - LEVEL_ORDER[b.topic.level] || a.topic.mastery - b.topic.mastery || a.index - b.index,
    )
    .map(({ topic }) => topic);
}

function sessionsFor(topic: PlanTopicInput): StudyBlockKind[] {
  switch (topic.level) {
    case "weak":
    case "skipped":
      return ["learn", "practice", "practice"];
    case "developing":
      return ["learn", "practice"];
    case "strong":
      return ["practice"];
  }
}

/** Queue of sessions, interleaving subjects so consecutive sessions differ where possible. */
function sessionQueue(ordered: readonly PlanTopicInput[]): { kind: StudyBlockKind; topic: PlanTopicInput }[] {
  // Expand: first session of every topic in priority order, then second sessions, and so on.
  const lists = ordered.map((topic) => sessionsFor(topic).map((kind) => ({ kind, topic })));
  const rounds = Math.max(0, ...lists.map((list) => list.length));
  const queue: { kind: StudyBlockKind; topic: PlanTopicInput }[] = [];
  for (let round = 0; round < rounds; round += 1) {
    const roundItems = lists.flatMap((list) => (list[round] ? [list[round]] : []));
    // Interleave subjects inside the round: pick the next item whose subject differs from the last.
    const pending = roundItems.slice();
    while (pending.length > 0) {
      const last = queue[queue.length - 1]?.topic.subject;
      const at = pending.findIndex((item) => item.topic.subject !== last);
      queue.push(pending.splice(at === -1 ? 0 : at, 1)[0]);
    }
  }
  return queue;
}

export function dayType(day: number, days: number): StudyDayType {
  if (day === days) return "mock";
  if (day === days - 1 || day % REVISION_DAY_INTERVAL === 0) return "revision";
  return "study";
}

/**
 * Builds the plan from topic results (e.g. `ScoreResult.topics` of a mock test). With no topics it
 * returns an empty list.
 */
export function buildStudyPlan(topics: readonly PlanTopicInput[], options: StudyPlanOptions = {}): StudyDay[] {
  const days = Math.max(1, Math.floor(options.days ?? 30));
  const minutes = { ...DEFAULT_MINUTES, ...options.minutes };
  if (topics.length === 0) return [];

  const ordered = prioritiseTopics(topics);
  const needy = ordered.filter((t) => t.level !== "strong");
  const strong = ordered.filter((t) => t.level === "strong");
  const queue = sessionQueue(ordered);
  let cursor = 0;
  let fillCursor = 0;
  let strongCursor = 0;
  const studiedOn = new Map<number, PlanTopicInput[]>();
  const plan: StudyDay[] = [];

  const block = (kind: StudyBlockKind, topic: PlanTopicInput): StudyBlock => ({
    kind,
    subject: topic.subject,
    topic: topic.topic,
    minutes: minutes[kind],
  });

  for (let day = 1; day <= days; day += 1) {
    const type = dayType(day, days);

    if (type === "mock") {
      plan.push({ day, type, blocks: [{ kind: "mock", minutes: minutes.mock }] });
      continue;
    }

    if (type === "revision") {
      let candidates: PlanTopicInput[];
      if (day === days - 1) {
        // Final revision: the weakest topics again.
        candidates = needy.length > 0 ? needy : ordered;
      } else {
        // Spaced repetition: what was studied in the previous six days.
        candidates = [];
        for (let d = Math.max(1, day - (REVISION_DAY_INTERVAL - 1)); d < day; d += 1) {
          for (const topic of studiedOn.get(d) ?? []) if (!candidates.includes(topic)) candidates.push(topic);
        }
      }
      const toRevise = candidates.slice(0, MAX_REVISION_BLOCKS);
      if (strong.length > 0 && toRevise.length < MAX_REVISION_BLOCKS) {
        const keep = strong[strongCursor % strong.length];
        strongCursor += 1;
        if (!toRevise.includes(keep)) toRevise.push(keep);
      }
      if (toRevise.length === 0) toRevise.push(ordered[0]);
      plan.push({ day, type, blocks: toRevise.map((topic) => block("revise", topic)) });
      continue;
    }

    const blocks: StudyBlock[] = [];
    const today: PlanTopicInput[] = [];
    for (let slot = 0; slot < 2; slot += 1) {
      if (cursor < queue.length) {
        const { kind, topic } = queue[cursor];
        cursor += 1;
        blocks.push(block(kind, topic));
        today.push(topic);
      } else {
        // Mixed practice of the topics that still need work (or all topics when none do).
        const pool = needy.length > 0 ? needy : ordered;
        const topic = pool[fillCursor % pool.length];
        fillCursor += 1;
        if (today.includes(topic) && pool.length > 1) {
          const other = pool[fillCursor % pool.length];
          fillCursor += 1;
          blocks.push(block("practice", other));
          today.push(other);
        } else {
          blocks.push(block("practice", topic));
          today.push(topic);
        }
      }
    }
    studiedOn.set(day, today);
    plan.push({ day, type, blocks });
  }
  return plan;
}

/** Total planned minutes of one day. */
export function dayMinutes(day: StudyDay): number {
  return day.blocks.reduce((sum, b) => sum + b.minutes, 0);
}
