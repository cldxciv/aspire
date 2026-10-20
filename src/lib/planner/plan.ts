/**
 * Day-by-day study plan generator (A4-PLANNER). Pure, deterministic and client-safe: the same
 * input always gives the same plan, so the plan itself is never stored — only its input and the
 * student's progress. Change any input and the plan is simply generated again.
 *
 * Shape of a plan (all of it a SUGGESTION, not Aspire's official schedule):
 * - Main phase: six study days a week (learning / practice blocks per topic + a short daily
 *   "spaced revision" block), then one weekly day that rotates revision → mock test → revision →
 *   buffer (catch-up) so the plan has slack.
 * - Final phase (the last ~15 %, 7–45 days; the whole plan when it is 21 days or shorter):
 *   revision of every topic, a mock test every third day and a light last day.
 * - Weak topics get twice the learning sessions of other topics and are revised twice as often
 *   in the final phase.
 * - Nothing is scheduled on or after the exam date.
 */
import { addDays, diffDays, type DateKey } from "./dates";
import type {
  BatchId,
  BlockKind,
  DayKind,
  PlanBlock,
  PlanDay,
  PlanInput,
  StudyPlan,
  SubjectId,
  TopicLevel,
} from "./types";

export const PLAN_LIMITS = {
  minDailyHours: 1,
  maxDailyHours: 14,
  /** About three years: longer horizons are refused by the form. */
  maxDays: 1100,
  /** Up to this many days the whole plan is final-phase revision. */
  shortPlanDays: 21,
  /** Learning blocks per study day (bounded so a day's progress fits a small bitmask). */
  maxLearnBlocks: 8,
} as const;

export interface PlanTopic {
  id: string;
  subject: SubjectId;
  level: TopicLevel;
}

export interface PlanOptions {
  /** The exam's topics in syllabus order (src/content/planner/syllabus.ts). */
  topics: readonly PlanTopic[];
  /** Suggested length of a mock-test block in minutes. */
  mockMinutes: number;
}

const roundTo5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Order in which class levels are learnt for each batch (earlier = sooner). */
const LEVEL_ORDER: Readonly<Record<BatchId, readonly TopicLevel[]>> = {
  "9": ["9", "both", "10", "11", "12"],
  "10": ["10", "both", "9", "11", "12"],
  "11": ["11", "both", "12", "9", "10"],
  "12": ["12", "both", "11", "9", "10"],
  dropper: ["11", "both", "12", "9", "10"],
};

/** Topics in learning order for a batch (stable: syllabus order within a level). */
export function orderTopics<T extends PlanTopic>(topics: readonly T[], batch: BatchId): T[] {
  const order = LEVEL_ORDER[batch];
  return topics
    .map((topic, index) => ({ topic, index, rank: order.indexOf(topic.level) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ topic }) => topic);
}

/** Daily time split: a spaced-revision block plus `learnBlocks` equal learning blocks. */
export function dailyShape(dailyHours: number): { dailyMinutes: number; spacedMinutes: number; learnBlocks: number; blockMinutes: number } {
  const dailyMinutes = Math.round(clamp(dailyHours, PLAN_LIMITS.minDailyHours, PLAN_LIMITS.maxDailyHours) * 60);
  const spacedMinutes = roundTo5(clamp(dailyMinutes * 0.15, 15, 60));
  const learnMinutes = dailyMinutes - spacedMinutes;
  const learnBlocks = clamp(Math.round(learnMinutes / 60), 1, PLAN_LIMITS.maxLearnBlocks);
  return { dailyMinutes, spacedMinutes, learnBlocks, blockMinutes: roundTo5(learnMinutes / learnBlocks) };
}

/** Days in the final revision phase for a plan of `totalDays`. */
export function finalPhaseLength(totalDays: number): number {
  if (totalDays <= PLAN_LIMITS.shortPlanDays) return totalDays;
  return clamp(Math.round(totalDays * 0.15), 7, 45);
}

/** Kind of a main-phase day by its index: day 7 of each week rotates revision / mock / revision / buffer. */
export function mainDayKind(index: number, mainDays: number): DayKind {
  if (mainDays < 7 || index % 7 !== 6) return "study";
  const week = Math.floor(index / 7);
  if (week % 4 === 3) return "buffer";
  return week % 2 === 1 ? "mock" : "revision";
}

type Slot = { topicId: string; kind: "learn" | "practice" };

/** Picks the subject with the lowest share of its slots used, preferring subjects not yet used today. */
function pickSubject(
  subjects: readonly SubjectId[],
  remaining: Map<SubjectId, Slot[]>,
  totals: Map<SubjectId, number>,
  usedToday: Set<SubjectId>,
): SubjectId | null {
  const available = subjects.filter((s) => (remaining.get(s)?.length ?? 0) > 0);
  if (available.length === 0) return null;
  const fresh = available.filter((s) => !usedToday.has(s));
  const pool = fresh.length > 0 ? fresh : available;
  let best: SubjectId | null = null;
  let bestShare = Infinity;
  for (const subject of pool) {
    const total = totals.get(subject) ?? 1;
    const share = (total - (remaining.get(subject)?.length ?? 0)) / total;
    if (share < bestShare - 1e-9) {
      best = subject;
      bestShare = share;
    }
  }
  return best;
}

/** Builds the plan. Invalid or past exam dates give an empty plan (the form validates first). */
export function generatePlan(input: PlanInput, options: PlanOptions): StudyPlan {
  const totalDays = clamp(diffDays(input.startDate, input.examDate), 0, PLAN_LIMITS.maxDays);
  const shape = dailyShape(input.dailyHours);
  const topicIds = new Set(options.topics.map((t) => t.id));
  const weak = new Set((input.weakTopics ?? []).filter((id) => topicIds.has(id)));
  const ordered = orderTopics(options.topics, input.batch);
  const subjects = [...new Set(options.topics.map((t) => t.subject))];
  const subjectOf = new Map(options.topics.map((t) => [t.id, t.subject]));
  // Priority for scarce slots and for final revision: weak topics first, then learning order.
  const priority = [...ordered.filter((t) => weak.has(t.id)), ...ordered.filter((t) => !weak.has(t.id))];

  const finalDays = finalPhaseLength(totalDays);
  const mainDays = totalDays - finalDays;
  const kinds = Array.from({ length: mainDays }, (_, i) => mainDayKind(i, mainDays));
  const studyDays = kinds.filter((k) => k === "study").length;

  // --- Learning sessions per topic -------------------------------------------------------------
  const slotsAvailable = studyDays * shape.learnBlocks;
  const weight = (id: string) => (weak.has(id) ? 2 : 1);
  const demand = ordered.reduce((sum, t) => sum + weight(t.id), 0);
  const sessions = new Map<string, number>();
  let perUnit = 0;
  if (demand > 0 && slotsAvailable >= demand) {
    perUnit = Math.floor(slotsAvailable / demand);
    for (const t of ordered) sessions.set(t.id, perUnit * weight(t.id));
    let leftover = slotsAvailable - perUnit * demand;
    for (const t of priority) {
      if (leftover <= 0) break;
      sessions.set(t.id, (sessions.get(t.id) ?? 0) + 1);
      leftover -= 1;
    }
  } else {
    let left = slotsAvailable;
    for (const t of priority) {
      if (left <= 0) break;
      sessions.set(t.id, 1);
      left -= 1;
    }
  }
  const unscheduledTopicIds = ordered.filter((t) => !sessions.get(t.id)).map((t) => t.id);

  // Per-subject queues: a topic's first half of sessions are "learn", the rest "practice".
  const queues = new Map<SubjectId, Slot[]>();
  for (const subject of subjects) queues.set(subject, []);
  for (const t of ordered) {
    const n = sessions.get(t.id) ?? 0;
    const learn = Math.ceil(n / 2);
    for (let i = 0; i < n; i += 1) queues.get(t.subject)!.push({ topicId: t.id, kind: i < learn ? "learn" : "practice" });
  }
  const totals = new Map([...queues].map(([s, q]) => [s, Math.max(1, q.length)]));

  const days: PlanDay[] = [];
  const learnedOn: { date: DateKey; topicId: string }[] = [];
  const blockId = (date: DateKey, index: number) => `${date}#${index}`;
  const makeDay = (date: DateKey, kind: DayKind, finalPhase: boolean, blocks: Omit<PlanBlock, "id" | "index">[]): PlanDay => ({
    date,
    kind,
    finalPhase,
    blocks: blocks.map((b, index) => ({ ...b, id: blockId(date, index), index })),
  });

  const mockBlocks = (): Omit<PlanBlock, "id" | "index">[] => {
    const mock = roundTo5(clamp(options.mockMinutes, 45, Math.max(45, shape.dailyMinutes - 15)));
    return [
      { kind: "mock", topicIds: [], minutes: mock },
      { kind: "analysis", topicIds: [], minutes: roundTo5(Math.max(15, shape.dailyMinutes - mock)) },
    ];
  };

  const reviseBlocksFor = (topicIdsBySubject: Map<SubjectId, string[]>): Omit<PlanBlock, "id" | "index">[] => {
    const groups = subjects.filter((s) => (topicIdsBySubject.get(s)?.length ?? 0) > 0);
    const list = groups.length > 0 ? groups : subjects;
    const minutes = roundTo5(shape.dailyMinutes / list.length);
    return list.map((subject) => ({ kind: "revise" as BlockKind, subject, topicIds: topicIdsBySubject.get(subject) ?? [], minutes }));
  };

  // --- Main phase -----------------------------------------------------------------------------
  for (let i = 0; i < mainDays; i += 1) {
    const date = addDays(input.startDate, i);
    const kind = kinds[i];
    if (kind === "study") {
      const usedToday = new Set<SubjectId>();
      const blocks: Omit<PlanBlock, "id" | "index">[] = [];
      for (let b = 0; b < shape.learnBlocks; b += 1) {
        const subject = pickSubject(subjects, queues, totals, usedToday);
        if (!subject) break;
        const slot = queues.get(subject)!.shift()!;
        usedToday.add(subject);
        learnedOn.push({ date, topicId: slot.topicId });
        blocks.push({ kind: slot.kind, subject, topicIds: [slot.topicId], minutes: shape.blockMinutes });
      }
      if (blocks.length === 0) {
        // Every topic already has its sessions (rounding slack): practise weak/priority topics.
        const topic = priority[i % Math.max(1, priority.length)];
        if (topic) blocks.push({ kind: "practice", subject: topic.subject, topicIds: [topic.id], minutes: shape.dailyMinutes - shape.spacedMinutes });
      }
      blocks.push({ kind: "spaced", topicIds: [], minutes: shape.spacedMinutes });
      days.push(makeDay(date, "study", false, blocks));
    } else if (kind === "revision") {
      const since = addDays(date, -7);
      const bySubject = new Map<SubjectId, string[]>();
      for (const entry of learnedOn) {
        if (entry.date <= since) continue;
        const subject = subjectOf.get(entry.topicId)!;
        const list = bySubject.get(subject) ?? [];
        if (!list.includes(entry.topicId)) list.push(entry.topicId);
        bySubject.set(subject, list);
      }
      days.push(makeDay(date, "revision", false, reviseBlocksFor(bySubject)));
    } else if (kind === "mock") {
      days.push(makeDay(date, "mock", false, mockBlocks()));
    } else {
      days.push(
        makeDay(date, "buffer", false, [
          { kind: "buffer", topicIds: [], minutes: shape.dailyMinutes - shape.spacedMinutes },
          { kind: "spaced", topicIds: [], minutes: shape.spacedMinutes },
        ]),
      );
    }
  }

  // --- Final phase: revise everything (weak topics twice), mock every third day, light last day --
  const reviseQueues = new Map<SubjectId, string[]>();
  for (const subject of subjects) reviseQueues.set(subject, []);
  for (const t of priority) if (weak.has(t.id)) reviseQueues.get(t.subject)!.push(t.id);
  for (const t of ordered) reviseQueues.get(t.subject)!.push(t.id);
  const reviseDayCount = Array.from({ length: finalDays }, (_, j) => j).filter(
    (j) => finalDays - j > 1 && j % 3 !== 2,
  ).length;
  const reviseBlocksPerDay = shape.learnBlocks + 1;
  const queueLength = [...reviseQueues.values()].reduce((sum, q) => sum + q.length, 0);
  const topicsPerBlock = clamp(Math.ceil(queueLength / Math.max(1, reviseDayCount * reviseBlocksPerDay)), 1, 4);
  const cursor = new Map(subjects.map((s) => [s, 0]));
  const served = new Map(subjects.map((s) => [s, 0]));

  for (let j = 0; j < finalDays; j += 1) {
    const date = addDays(input.startDate, mainDays + j);
    const daysLeft = finalDays - j;
    if (daysLeft === 1) {
      days.push(
        makeDay(date, "light", true, [
          { kind: "revise", topicIds: [...weak].slice(0, 4), minutes: roundTo5(Math.min(shape.dailyMinutes / 2, 120)) },
        ]),
      );
    } else if (j % 3 === 2) {
      days.push(makeDay(date, "mock", true, mockBlocks()));
    } else {
      const blocks: Omit<PlanBlock, "id" | "index">[] = [];
      const minutes = roundTo5(shape.dailyMinutes / reviseBlocksPerDay);
      const usedToday = new Set<SubjectId>();
      for (let b = 0; b < reviseBlocksPerDay; b += 1) {
        // Round-robin by least-served subject (relative to its queue length).
        const pool = subjects.filter((s) => reviseQueues.get(s)!.length > 0);
        if (pool.length === 0) break;
        const fresh = pool.filter((s) => !usedToday.has(s));
        const candidates = fresh.length > 0 ? fresh : pool;
        const subject = candidates.reduce((best, s) =>
          served.get(s)! / reviseQueues.get(s)!.length < served.get(best)! / reviseQueues.get(best)!.length - 1e-9 ? s : best,
        );
        usedToday.add(subject);
        const queue = reviseQueues.get(subject)!;
        const picked: string[] = [];
        for (let n = 0; n < topicsPerBlock && picked.length < queue.length; n += 1) {
          const index = cursor.get(subject)!;
          const id = queue[index % queue.length];
          cursor.set(subject, index + 1);
          if (!picked.includes(id)) picked.push(id);
        }
        served.set(subject, served.get(subject)! + picked.length);
        blocks.push({ kind: "revise", subject, topicIds: picked, minutes });
      }
      days.push(makeDay(date, "revision", true, blocks));
    }
  }

  const count = (kind: DayKind) => days.filter((d) => d.kind === kind).length;
  return {
    input,
    days,
    summary: {
      totalDays,
      studyDays,
      revisionDays: count("revision"),
      mockDays: count("mock"),
      bufferDays: count("buffer") + count("light"),
      finalPhaseStart: finalDays > 0 ? addDays(input.startDate, mainDays) : null,
      sessionsPerTopic: perUnit || (slotsAvailable > 0 ? 1 : 0),
      sessionsPerWeakTopic: perUnit ? perUnit * 2 : slotsAvailable > 0 ? 1 : 0,
      unscheduledTopicIds,
    },
  };
}

/** The plan day for a date, if the plan has one. */
export function planDayFor(plan: StudyPlan, date: DateKey): PlanDay | undefined {
  const index = diffDays(plan.input.startDate, date);
  const day = plan.days[index];
  return day && day.date === date ? day : undefined;
}

/** True when a change of input means a new plan (any planning field differs). */
export function planInputChanged(a: PlanInput | null | undefined, b: PlanInput | null | undefined): boolean {
  if (!a || !b) return a !== b;
  const weakA = [...(a.weakTopics ?? [])].sort().join(",");
  const weakB = [...(b.weakTopics ?? [])].sort().join(",");
  return (
    a.exam !== b.exam ||
    a.batch !== b.batch ||
    a.startDate !== b.startDate ||
    a.examDate !== b.examDate ||
    a.dailyHours !== b.dailyHours ||
    weakA !== weakB
  );
}
