import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { clampToolSummary, type RanchoOpenDetail } from "@/lib/ask/cards";
import type { PlanDay, SubjectId } from "@/lib/planner/types";
import { formatNumber, type PlannerData, type PlannerMessages } from "./model";

/** Topic names named in the hand-off at most (the summary is clamped as well). */
export const RANCHO_TOPIC_LIMIT = 8;

export interface PlannerRanchoMessages {
  exams: PlannerMessages["exams"];
  subjects: PlannerMessages["subjects"];
  askRanchoPrompt: string;
  askRanchoContext: string;
  /** The last plan day (the exam is tomorrow): no "1 days". */
  askRanchoContextTomorrow: string;
}

/**
 * Today's topic names grouped by subject, in plan order: "Physics: Kinematics; Work, energy and
 * power | Chemistry: Mole concept" ("; " and " | " because topic names can contain commas). Empty
 * when today has no topics (mock, buffer or mixed-revision days).
 */
export function todaysTopicText(day: PlanDay, data: PlannerData, subjects: PlannerMessages["subjects"]): string {
  const bySubject = new Map<SubjectId, string[]>();
  let count = 0;
  for (const block of day.blocks) {
    for (const id of block.topicIds) {
      const topic = data.topics[id];
      if (!topic || count >= RANCHO_TOPIC_LIMIT) continue;
      const names = bySubject.get(topic.subject) ?? [];
      if (names.includes(topic.name)) continue;
      names.push(topic.name);
      bySubject.set(topic.subject, names);
      count += 1;
    }
  }
  return [...bySubject].map(([subject, names]) => `${subjects[subject]}: ${names.join("; ")}`).join(" | ");
}

/**
 * What the planner hands to Rancho ("Ask Rancho to explain today's topics"; client-safe, pure): the
 * exam, days left and today's topic names. Never the student's weak-topic choices, progress, XP,
 * account or anything personal. Null when today has no topics to explain (or the plan is over).
 */
export function plannerRanchoDetail(
  input: { exam: keyof PlannerMessages["exams"]; daysLeft: number; day: PlanDay; data: PlannerData; locale: Locale },
  t: PlannerRanchoMessages,
): RanchoOpenDetail | null {
  // Plan days run up to the day before the exam, so daysLeft >= 1 whenever there is a plan day.
  if (input.daysLeft < 1) return null;
  const topics = todaysTopicText(input.day, input.data, t.subjects);
  if (!topics) return null;
  const summary = format(input.daysLeft === 1 ? t.askRanchoContextTomorrow : t.askRanchoContext, {
    exam: t.exams[input.exam],
    days: formatNumber(input.daysLeft, input.locale),
    topics,
  });
  return { prompt: t.askRanchoPrompt, toolContext: { tool: "planner", summary: clampToolSummary(summary) } };
}
