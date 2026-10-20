import "server-only";

import { getDb } from "@/lib/db/connection";
import { deleteTopics, listTopics, upsertTopic, type AskSubject } from "@/lib/db/features/ask";

import type { AskAnswerMeta } from "./constants";
import { cleanTopic, topicKey } from "./trailer";

/**
 * Weak-topic tracking from Ask Aspire doubts (D-034): signed-in STUDENTS only. Each answered
 * doubt adds one to the (subject, topic) the model tagged it with. Nothing is stored for guests,
 * parents or admins, and no question text, photo or answer is ever stored.
 *
 * Phase 2 (portal panels) and A4-PLANNER read it through `getWeakTopicsFromDoubts`.
 * Authorisation is the caller's job: only the student themself, or a parent linked to them
 * (`requireStudentRecord`), may see a learner's topics.
 */

export interface WeakTopic {
  subject: AskSubject;
  /** Short English topic label as tagged by the model (e.g. "Projectile motion"). */
  topic: string;
  /** How many doubts the student asked on this topic. */
  count: number;
  /** ISO timestamp of the first and the most recent doubt on it. */
  firstSeen: string;
  lastSeen: string;
}

const SUBJECTS: readonly AskSubject[] = ["physics", "chemistry", "maths", "biology"];

/**
 * A student's most-asked doubt topics (most doubts first; ties: most recent first).
 * Returns `[]` for unknown ids or accounts that never used Ask Aspire.
 */
export function getWeakTopicsFromDoubts(
  userId: string,
  options: { limit?: number; subject?: AskSubject } = {},
): WeakTopic[] {
  return listTopics(getDb(), userId, options).map((row) => ({
    subject: row.subject,
    topic: row.topic,
    count: row.count,
    firstSeen: new Date(row.firstSeen).toISOString(),
    lastSeen: new Date(row.lastSeen).toISOString(),
  }));
}

/** Records one answered doubt for a student. Returns false when the tag is not a usable topic. */
export function recordDoubtTopic(userId: string, meta: AskAnswerMeta | null, now: number = Date.now()): boolean {
  if (!meta || meta.subject === "other" || !SUBJECTS.includes(meta.subject)) return false;
  const topic = cleanTopic(meta.topic);
  if (!topic) return false;
  upsertTopic(getDb(), { userId, subject: meta.subject, topicKey: topicKey(topic), topic, now });
  return true;
}

/** Deletes all of a student's stored doubt topics (for a data-deletion request). */
export function clearDoubtTopics(userId: string): number {
  return deleteTopics(getDb(), userId);
}
