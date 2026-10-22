/**
 * Test helpers for the QB-CORE-B suites (never imported by app code). Synthetic content only: stems
 * like "Synthetic item 7" are invented labels, never text from a real paper.
 */
import type { DatabaseSync } from "node:sqlite";

import { MEMORY_DB_PATH, openDatabase } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { resolveQbViewer, upsertMember } from "./access";
import { blueprintAction, createDraft as createBlueprintDraft, saveDraft, editableOf } from "./blueprints";
import { qbDb } from "./db";
import { defaultBlueprint } from "./patterns";
import { createDraft, questionAction } from "./questions";
import { confirmTaxonomy, createChapter } from "./taxonomy";
import type { QbAnswer, QbBlueprint, QbDifficulty, QbExam, QbQuestionContent, QbSlot, QbSubject, QbViewer } from "./types";
import type { QbQuestionExamInput } from "./views";

export const T0 = Date.UTC(2026, 9, 22, 6, 0, 0); // 22 Oct 2026, 11:30 IST

export function freshDb(): DatabaseSync {
  return qbDb(openDatabase(MEMORY_DB_PATH));
}

let userCounter = 0;

export function makeUser(db: DatabaseSync, role: "admin" | "staff" | "student" | "parent", options: { mustChangePassword?: boolean } = {}) {
  userCounter += 1;
  return insertUser(db, {
    role,
    loginId: `${role}.${userCounter}`,
    displayName: `Test ${role} ${userCounter}`,
    passwordHash: "scrypt$test",
    mustChangePassword: options.mustChangePassword ?? false,
    now: T0,
  });
}

export function adminViewer(db: DatabaseSync): QbViewer {
  const user = makeUser(db, "admin");
  return resolveQbViewer({ userId: user.id, role: "admin", displayName: user.displayName }, db)!;
}

export function staffViewer(db: DatabaseSync, admin: QbViewer, role: "author" | "reviewer", subjects: QbSubject[] = []): QbViewer {
  const user = makeUser(db, "staff");
  const result = upsertMember(admin, user.id, { qbRole: role, subjects, active: true }, T0, db);
  if (!result.ok) throw new Error(result.message);
  return resolveQbViewer({ userId: user.id, role: "staff", displayName: user.displayName }, db)!;
}

export function chapter(db: DatabaseSync, admin: QbViewer, id: string, subject: QbSubject, exams: QbExam[] = ["JEE_MAIN"], level: "class_11" | "class_12" | "class_9_10" = "class_11") {
  const result = createChapter(
    admin,
    { id, subject, level, label: { en: id, hi: "" }, examStatus: Object.fromEntries(exams.map((e) => [e, "current"])) as Partial<Record<QbExam, "current">> },
    T0,
    db,
  );
  if (!result.ok) throw new Error(result.message);
}

export function confirm(db: DatabaseSync, admin: QbViewer, exam: QbExam, year: number | null = 2024) {
  const result = confirmTaxonomy(admin, exam, { syllabusRevisionYear: year }, T0, db);
  if (!result.ok) throw new Error(result.message);
}

let stemCounter = 0;

export function mcqContent(options: { answer?: number | null; stem?: string } = {}): QbQuestionContent {
  stemCounter += 1;
  return {
    type: "single",
    format: "standard",
    passageId: null,
    passageOrder: null,
    stem: { en: options.stem ?? `Synthetic item ${stemCounter}: which option is labelled ${stemCounter % 4}?`, hi: "" },
    options: [0, 1, 2, 3].map((i) => ({ en: `Option ${i} of item ${stemCounter}`, hi: "" })),
    answer: options.answer === null ? null : { kind: "single", index: options.answer ?? 1 },
    solution: { en: "Synthetic solution.", hi: "" },
    solutionSource: "staff",
    hiSource: "none",
    figures: [],
    topics: [],
  };
}

export function numericalContent(answer: QbAnswer, stem?: string): QbQuestionContent {
  stemCounter += 1;
  return {
    type: "numerical",
    format: "standard",
    passageId: null,
    passageOrder: null,
    stem: { en: stem ?? `Synthetic numerical item ${stemCounter}: give the value.`, hi: "" },
    options: [],
    answer,
    solution: { en: "Synthetic solution.", hi: "" },
    solutionSource: "staff",
    hiSource: "none",
    figures: [],
    topics: [],
  };
}

export const CHECKLIST = { answer: true, transcription: true, math: true, figures: true, hindi: true, syllabus: true, licence: true };

export function examsFor(exam: QbExam, difficulty: QbDifficulty | null = "medium"): QbQuestionExamInput[] {
  return [{ exam, eligible: true, difficulty }];
}

export function draft(
  db: DatabaseSync,
  viewer: QbViewer,
  input: { chapterId: string; content?: QbQuestionContent; exam?: QbExam; difficulty?: QbDifficulty; now?: number },
): string {
  const result = createDraft(
    viewer,
    {
      chapterId: input.chapterId,
      content: input.content ?? mcqContent(),
      source: { kind: "aspire", aspireRef: "TEST" },
      exams: examsFor(input.exam ?? "JEE_MAIN", input.difficulty ?? "medium"),
    },
    input.now ?? T0,
    db,
  );
  if (!result.ok) throw new Error(`${result.message} ${JSON.stringify(result.fieldErrors ?? {})}`);
  return result.data.question.id;
}

export function approved(
  db: DatabaseSync,
  viewer: QbViewer,
  input: { chapterId: string; content?: QbQuestionContent; exam?: QbExam; difficulty?: QbDifficulty; now?: number },
): string {
  const id = draft(db, viewer, input);
  const result = questionAction(viewer, id, { action: "approve", checklist: CHECKLIST }, input.now ?? T0, db);
  if (!result.ok) throw new Error(`approve failed: ${result.message}`);
  return id;
}

/** Publishes a (small) blueprint for a slot. */
export function publish(db: DatabaseSync, admin: QbViewer, slot: QbSlot, patch: (bp: QbBlueprint) => QbBlueprint = (bp) => bp): QbBlueprint {
  const created = createBlueprintDraft(admin, { slot }, T0, db);
  if (!created.ok) throw new Error(created.message);
  const edited = patch({ ...defaultBlueprint(slot), ...created.data.blueprint });
  const saved = saveDraft(admin, created.data.blueprint.id, { definition: editableOf(edited) }, T0, db);
  if (!saved.ok) throw new Error(`${saved.message} ${JSON.stringify(saved.fieldErrors ?? {})}`);
  const published = blueprintAction(admin, created.data.blueprint.id, { action: "publish" }, T0, db);
  if (!published.ok) throw new Error(published.message);
  return published.data.blueprint;
}

/** A one-part JEE Main blueprint: physics 4 single (+4/−1) and 2 integer numericals. */
export function smallJeeMain(bp: QbBlueprint): QbBlueprint {
  const base = bp.parts[0];
  return {
    ...bp,
    parts: [
      {
        ...base,
        durationMinutes: 60,
        sections: [
          { ...base.sections.find((s) => s.id === "physics-a")!, count: 4 },
          { ...base.sections.find((s) => s.id === "physics-b")!, count: 2 },
        ],
      },
    ],
  };
}
