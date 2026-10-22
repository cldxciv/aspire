import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCorrection } from "./corrections";
import { generatePaper, readiness } from "./generator";
import { loadExamPool, weightsFor } from "./pool";
import { scoreServedPaper } from "./paper-scoring";
import {
  createPaper,
  loadPaper,
  lockPaperAnswers,
  paperIdsContaining,
  paperReviewItems,
  plausiblePaperOutcomeTiming,
  plausibleTiming,
  recordPaperOutcome,
  reportPaperQuestion,
  slotReadiness,
  type QbCreatePaperInput,
} from "./papers";
import { blueprintPreviewStats } from "./preview";
import { getQuestion, updateQuestion } from "./questions";
import { resolveReport } from "./reports";
import { acceptCalibration, accumulateOutcome, itemStatsFor } from "./stats";
import { getOrCreateWindow, istMonthWindow, practicePool, reservedClusters } from "./windows";
import { adminViewer, approved, chapter, confirm, freshDb, makeUser, numericalContent, publish, smallJeeMain, T0 } from "./qb-testing";
import type { QbBlueprint, QbViewer } from "./types";

// Pool, papers, windows, corrections and calibration against fresh in-memory databases.

let db: DatabaseSync;
let admin: QbViewer;
let blueprint: QbBlueprint;
const DAY = 24 * 60 * 60 * 1000;

function stock(perDifficulty: { single: number; integer: number }) {
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    for (let i = 0; i < perDifficulty.single; i += 1) approved(db, admin, { chapterId: i % 2 ? "phy-a" : "phy-b", difficulty });
    for (let i = 0; i < perDifficulty.integer; i += 1) {
      approved(db, admin, { chapterId: i % 2 ? "phy-a" : "phy-b", difficulty, content: numericalContent({ kind: "numerical", value: 3 + i, integer: true }) });
    }
  }
}

function paperInput(patch: Partial<QbCreatePaperInput> = {}): QbCreatePaperInput {
  return { slot: "jee-main", mode: "practice", userId: null, language: "en", compensatory: false, recent: [], placeholderMode: false, now: T0, ...patch };
}

beforeEach(() => {
  db = freshDb();
  admin = adminViewer(db);
  chapter(db, admin, "phy-a", "physics");
  chapter(db, admin, "phy-b", "physics");
  confirm(db, admin, "JEE_MAIN");
  blueprint = publish(db, admin, "jee-main", smallJeeMain);
});

afterEach(() => db.close());

describe("snapshot consistency", () => {
  it("serves the approved snapshot: a pending integer edit never puts the decimal v1 into an integer section", () => {
    stock({ single: 3, integer: 2 });
    const decimal = approved(db, admin, { chapterId: "phy-a", content: numericalContent({ kind: "numerical", value: 2.5, integer: false }) });
    const q = getQuestion(db, decimal)!;
    const edit = updateQuestion(admin, decimal, { content: { ...q.content, answer: { kind: "numerical", value: 3, integer: true } } }, T0 + 1, db);
    expect(edit.ok).toBe(true);
    const after = getQuestion(db, decimal)!;
    expect(after).toMatchObject({ version: 2, approvedVersion: 1, status: "approved" });
    const row = db.prepare("SELECT version, answer_integer FROM qb_pool WHERE question_id = ?").get(decimal);
    expect(row).toEqual({ version: 1, answer_integer: 0 });
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      const created = createPaper(paperInput({ now: T0 + 10 }), db);
      if (!created.ok) throw new Error(created.reason);
      const ids = created.papers[0].view.questions.filter((x) => x.sectionId === "physics-b").map((x) => x.id);
      expect(ids).not.toContain(decimal);
      void seed;
    }
    // A live label change rewrites the pool; the content stays the approved one.
    updateQuestion(admin, decimal, { exams: [{ exam: "JEE_MAIN", eligible: true, difficulty: "hard" }] }, T0 + 2, db);
    expect(db.prepare("SELECT difficulty, version FROM qb_pool WHERE question_id = ?").get(decimal)).toEqual({ difficulty: "hard", version: 1 });
  });
});

describe("papers", () => {
  beforeEach(() => stock({ single: 3, integer: 2 }));

  it("checks the token and expiry, and never puts answers or staff fields in the runner payload", () => {
    const created = createPaper(paperInput(), db);
    if (!created.ok) throw new Error(created.reason);
    const paper = created.papers[0];
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(paper.view.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(paper.view.questionCount).toBe(6);
    expect(paper.view.testId).toBe("bp-jee-main");
    expect(loadPaper(paper.view.id, { token: created.token }, T0, db)?.view.id).toBe(paper.view.id);
    expect(loadPaper(paper.view.id, { token: "x".repeat(43) }, T0, db)).toBeNull();
    expect(loadPaper(paper.view.id, {}, T0, db)).toBeNull();
    expect(loadPaper(paper.view.id, { token: created.token }, T0 + 15 * DAY, db)).toBeNull(); // guest papers: 14 days
    const json = JSON.stringify(paper.view);
    for (const forbidden of ['"answer"', '"solution"', "claimedSource", "aspireRef", "importId", "createdBy", "approvedBy", "TEST", "difficulty", '"source"']) {
      expect(json).not.toContain(forbidden);
    }
    expect(paper.view.sections.map((s) => [s.id, s.count, s.fullCount])).toEqual([
      ["physics-a", 4, 4],
      ["physics-b", 2, 2],
    ]);
  });

  it("lets the owning student open their paper without a token", () => {
    const student = makeUser(db, "student");
    const created = createPaper(paperInput({ userId: student.id }), db);
    if (!created.ok) throw new Error(created.reason);
    expect(loadPaper(created.papers[0].view.id, { userId: student.id }, T0 + 20 * DAY, db)).not.toBeNull();
    expect(loadPaper(created.papers[0].view.id, { userId: "someone-else" }, T0, db)).toBeNull();
  });

  it("locks the answers: same answers again → same, different answers → different", () => {
    const created = createPaper(paperInput(), db);
    if (!created.ok) throw new Error(created.reason);
    const id = created.papers[0].view.id;
    const summary = { score: 4, maxScore: 24, correct: 1, wrong: 0, unattempted: 5 };
    expect(lockPaperAnswers(id, { answersHash: "h1", summary, now: T0 }, db)).toBe("first");
    expect(lockPaperAnswers(id, { answersHash: "h1", summary, now: T0 + 1 }, db)).toBe("same");
    expect(lockPaperAnswers(id, { answersHash: "h2", summary, now: T0 + 2 }, db)).toBe("different");
    expect(loadPaper(id, { token: created.token }, T0, db)?.view.scored).toBe(true);
  });

  it("records statistics once, and nothing for implausible timing", () => {
    const created = createPaper(paperInput(), db);
    if (!created.ok) throw new Error(created.reason);
    const view = created.papers[0].view;
    const questions = view.questions.map((q, i) => ({ id: q.id, outcome: (i % 2 ? "correct" : "wrong") as "correct" | "wrong", timeSec: 30 }));
    expect(recordPaperOutcome(view.id, { questions, score: 10, maxScore: 24, now: T0 + 60 * 1000 }, db)).toBe(false); // 1 minute: too fast
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_item_stats WHERE scored_n > 0").get()?.n).toBe(0);
    const later = T0 + 30 * 60 * 1000;
    expect(recordPaperOutcome(view.id, { questions, score: 10, maxScore: 24, now: later }, db)).toBe(true);
    expect(recordPaperOutcome(view.id, { questions, score: 10, maxScore: 24, now: later + 1 }, db)).toBe(false);
    const stats = itemStatsFor(db, view.questions[1].id)[0];
    expect(stats).toMatchObject({ scored: 1, attempted: 1, correct: 1, exposures: 1 });
    expect(paperIdsContaining(view.questions[0].id, [view.id, "zzzzzzzzzzzzzzzzzzzzzz"], db)).toEqual([view.id]);
  });

  it("applies key corrections on load and score; a dropped question gives full marks to everyone", async () => {
    const created = createPaper(paperInput(), db);
    if (!created.ok) throw new Error(created.reason);
    const view = created.papers[0].view;
    const target = view.questions.find((q) => q.type === "single")!;
    const before = paperReviewItems(view.id, T0, db).find((r) => r.id === target.id)!;
    expect(before.answer).toEqual({ kind: "single", index: 1 });
    const rescored: string[] = [];
    const changed = await createCorrection(
      admin,
      { questionId: target.id, kind: "answer", answer: { kind: "single", index: 2 }, reason: "Final key corrected" },
      T0 + 5,
      db,
      { rescore: async (id) => (rescored.push(id), { attempts: 3 }) },
    );
    expect(changed.ok && changed.data.rescoredAttempts).toBe(3);
    expect(rescored).toEqual([target.id]);
    const after = paperReviewItems(view.id, T0, db).find((r) => r.id === target.id)!;
    expect(after).toMatchObject({ answer: { kind: "single", index: 2 }, dropped: false, correctedAt: T0 + 5 });

    await createCorrection(admin, { questionId: target.id, kind: "dropped", reason: "Question dropped by NTA" }, T0 + 6, db, { rescore: async () => ({ attempts: 0 }) });
    const review = paperReviewItems(view.id, T0, db);
    const dropped = review.find((r) => r.id === target.id)!;
    expect(dropped.dropped).toBe(true);
    const items = view.questions.map((q) => {
      const r = review.find((x) => x.id === q.id)!;
      return { id: q.id, type: q.type, answerFormat: q.answerFormat, marking: q.marking, key: r.answer, dropped: r.dropped };
    });
    const score = scoreServedPaper(items, view.questions.map(() => null));
    expect(score.items.find((i) => i.id === target.id)).toMatchObject({ outcome: "correct", marks: 4 });
    expect(score.score).toBe(4);
    // Reports: no account, no IP stored.
    expect(reportPaperQuestion({ paperId: view.id, token: created.token, questionId: target.id, kind: "wrong_answer", note: "key?", now: T0 }, db)).toBe(true);
    const report = db.prepare("SELECT * FROM qb_reports").get()!;
    expect(Object.keys(report).sort()).toEqual(["created_at", "id", "kind", "note", "paper_id", "question_id", "resolved_at", "resolved_by", "status", "version"]);
    expect(getQuestion(db, target.id)!.flags).toContain("student_report");
  });

  it("carries an answer correction into the working copy, or marks a conflicting pending edit", async () => {
    const created = createPaper(paperInput(), db);
    if (!created.ok) throw new Error(created.reason);
    const [first, second] = created.papers[0].view.questions.filter((q) => q.type === "single");
    const noRescore = { rescore: async () => ({ attempts: 0 }) };
    // The working copy still holds the corrected (wrong) key: it takes the corrected one.
    const carried = await createCorrection(admin, { questionId: first.id, kind: "answer", answer: { kind: "single", index: 3 }, reason: "Final key" }, T0 + 5, db, noRescore);
    expect(carried.ok).toBe(true);
    expect(getQuestion(db, first.id)!.content.answer).toEqual({ kind: "single", index: 3 });
    // A later edit + approval keeps the corrected key instead of silently restoring the old one.
    const q = getQuestion(db, first.id)!;
    updateQuestion(admin, first.id, { content: { ...q.content, solution: { en: "Synthetic solution, rewritten.", hi: "" } } }, T0 + 6, db);
    expect(getQuestion(db, first.id)!).toMatchObject({ version: 2, content: { answer: { kind: "single", index: 3 } } });

    // A pending edit that already holds a third answer is not overwritten: it becomes a conflict.
    const s = getQuestion(db, second.id)!;
    updateQuestion(admin, second.id, { content: { ...s.content, answer: { kind: "single", index: 0 } } }, T0 + 7, db);
    const conflicting = await createCorrection(admin, { questionId: second.id, kind: "answer", answer: { kind: "single", index: 2 }, reason: "Final key" }, T0 + 8, db, noRescore);
    expect(conflicting.ok).toBe(true);
    const after = getQuestion(db, second.id)!;
    expect(after.content.answer).toEqual({ kind: "single", index: 0 });
    expect(after.keyStatus).toBe("conflict");
    expect(after.flags).toContain("answer_conflict");

    // An answer that points at a missing option is refused.
    const outOfRange = await createCorrection(admin, { questionId: first.id, kind: "answer", answer: { kind: "single", index: 5 }, reason: "Typo" }, T0 + 9, db, noRescore);
    expect(outOfRange.ok ? null : outOfRange.error).toBe("validation");
  });

  it("unlinks a report from its paper once it is decided", () => {
    const created = createPaper(paperInput(), db);
    if (!created.ok) throw new Error(created.reason);
    const view = created.papers[0].view;
    expect(reportPaperQuestion({ paperId: view.id, token: created.token, questionId: view.questions[0].id, kind: "other", note: null, now: T0 }, db)).toBe(true);
    const report = db.prepare("SELECT id, paper_id FROM qb_reports").get()!;
    expect(report.paper_id).toBe(view.id);
    expect(resolveReport(admin, Number(report.id), { status: "dismissed" }, T0 + 1, db).ok).toBe(true);
    expect(db.prepare("SELECT paper_id FROM qb_reports WHERE id = ?").get(Number(report.id))?.paper_id).toBeNull();
  });

  it("gives a later part of a set the earlier parts' time when judging plausible timing", () => {
    const p1 = createPaper(paperInput(), db);
    const p2 = createPaper(paperInput(), db);
    if (!p1.ok || !p2.ok) throw new Error("create");
    const [a, b] = [p1.papers[0].view, p2.papers[0].view];
    const now = T0 + 100 * 60 * 1000; // P1 (60 min) then P2 (60 min) after a short break
    expect(plausiblePaperOutcomeTiming(b.id, now, db)).toBe(false);
    db.prepare("UPDATE qb_papers SET set_id = 'set-1', set_part = 1 WHERE id = ?").run(a.id);
    db.prepare("UPDATE qb_papers SET set_id = 'set-1', set_part = 2 WHERE id = ?").run(b.id);
    expect(plausiblePaperOutcomeTiming(b.id, now, db)).toBe(true);
    expect(plausiblePaperOutcomeTiming(a.id, now, db)).toBe(false);
    const questions = b.questions.map((q) => ({ id: q.id, outcome: "correct" as const }));
    expect(recordPaperOutcome(b.id, { questions, score: 24, maxScore: 24, now }, db)).toBe(true);
    expect(plausibleTiming(b, now, 0)).toBe(false);
  });

  it("runs preview statistics asynchronously, sharing one run between identical requests", async () => {
    const [x, y] = await Promise.all([
      blueprintPreviewStats(admin, blueprint.id, { language: "en", seeds: 3, now: T0 }, db),
      blueprintPreviewStats(admin, blueprint.id, { language: "en", seeds: 3, now: T0 }, db),
    ]);
    expect(x.ok && y.ok).toBe(true);
    if (!x.ok || !y.ok) return;
    expect(x.data).toBe(y.data);
    expect(x.data).toMatchObject({ seeds: 3, papers: 3, thinRate: 0 });
    const cached = await blueprintPreviewStats(admin, blueprint.id, { language: "en", seeds: 3, now: T0 }, db);
    expect(cached.ok && cached.data).toBe(x.data);
  });

  it("shortens evenly and labels the composition, or refuses a thin bank", () => {
    // Only one integer numerical per difficulty in a fresh bank would be thin; here physics-b has 6.
    const readiness = slotReadiness({ slot: "jee-main", language: "en", placeholderMode: false, now: T0 }, db);
    expect(readiness.available).toBe(true);
    expect(readiness.readiness?.level).toBe("full");
    expect(readiness.readiness?.byLanguage.hi).toBe("thin"); // no Hindi in the synthetic bank
    expect(readiness.composition?.bySource.aspire).toBe(6);
    const hindi = createPaper(paperInput({ language: "hi" }), db);
    expect(hindi.ok ? "ok" : hindi.reason).toBe("thin");
  });
});

describe("ranked windows", () => {
  beforeEach(() => stock({ single: 6, integer: 4 }));

  it("creates the template once, pins the version, reserves its clusters and gives one paper per student", () => {
    const first = getOrCreateWindow(db, "jee-main", T0);
    const second = getOrCreateWindow(db, "jee-main", T0 + 1000);
    expect(first?.status).toBe("open");
    expect(second?.seed).toBe(first?.seed);
    expect(first?.windowId).toBe(istMonthWindow(T0).windowId);
    expect(first?.windowId).toBe("month-2026-10");
    expect(first?.blueprintVersion).toBe(blueprint.version);
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_windows").get()?.n).toBe(1);

    const reserved = reservedClusters(db, "JEE_MAIN", T0);
    expect(reserved.size).toBeGreaterThan(0);
    for (let i = 0; i < 5; i += 1) {
      const practice = createPaper(paperInput({ now: T0 + i }), db);
      if (!practice.ok) throw new Error(practice.reason);
      expect(practice.papers[0].view.questions.some((q) => reserved.has(q.id))).toBe(false);
    }

    const guest = createPaper(paperInput({ mode: "ranked" }), db);
    expect(guest.ok ? "ok" : guest.reason).toBe("signed_out");
    const student = makeUser(db, "student");
    const ranked = createPaper(paperInput({ mode: "ranked", userId: student.id }), db);
    if (!ranked.ok) throw new Error(ranked.reason);
    expect(ranked.papers[0].view).toMatchObject({ kind: "ranked", testId: "bp-jee-main-ranked", windowId: "month-2026-10" });
    expect(ranked.token).toBeNull();
    const again = createPaper(paperInput({ mode: "ranked", userId: student.id, now: T0 + 5000 }), db);
    expect(again.ok && again.resumed).toBe(true);
    expect(again.ok && again.papers[0].view.id).toBe(ranked.papers[0].view.id);
    // Ranked papers open with the owner's session only.
    expect(loadPaper(ranked.papers[0].view.id, { token: "x".repeat(43) }, T0, db)).toBeNull();
    // Everyone gets the same questions this month.
    const other = makeUser(db, "student");
    const otherPaper = createPaper(paperInput({ mode: "ranked", userId: other.id }), db);
    expect(otherPaper.ok && otherPaper.papers[0].view.questions.map((q) => q.id)).toEqual(ranked.papers[0].view.questions.map((q) => q.id));
  });

  it("refreshes readiness when a ranked template reserves clusters", () => {
    const input = { slot: "jee-main" as const, language: "en" as const, placeholderMode: false, now: T0 };
    const before = slotReadiness(input, db);
    expect(getOrCreateWindow(db, "jee-main", T0)?.status).toBe("open");
    const after = slotReadiness({ ...input, now: T0 + 1 }, db);
    expect(after.readiness!.variety).toBeLessThan(before.readiness!.variety);
    expect(after.readiness!.variety).toBe(
      readiness({ blueprint, pool: practicePool(db, "JEE_MAIN", T0), weights: weightsFor(db, blueprint, T0).weights, formatTargets: {} }).variety,
    );
  });

  it("is unavailable when a full paper is impossible", () => {
    db.prepare("DELETE FROM qb_pool WHERE type = 'numerical'").run();
    db.prepare("UPDATE qb_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'bank.revision'").run();
    const window = getOrCreateWindow(db, "jee-main", T0);
    expect(window?.status).toBe("unavailable");
    const student = makeUser(db, "student");
    const ranked = createPaper(paperInput({ mode: "ranked", userId: student.id }), db);
    expect(ranked.ok ? "ok" : ranked.reason).toBe("ranked_unavailable");
  });

  it("does not advertise a ranked paper before the template exists when the bank cannot fill a full one", () => {
    // Integration finding: readiness said ranked "available" for a short, sample-only bank.
    const input = { slot: "jee-main" as const, language: "en" as const, placeholderMode: false, now: T0 };
    const full = slotReadiness(input, db);
    expect(full.ranked).toMatchObject({ mode: "monthly", available: true });
    expect(full.readiness!.ranked.available).toBe(true);

    db.prepare("DELETE FROM qb_pool WHERE type = 'numerical'").run();
    db.prepare("UPDATE qb_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'bank.revision'").run();
    const thin = slotReadiness({ ...input, now: T0 + 1 }, db);
    expect(thin.ranked).toMatchObject({ mode: "monthly", available: false, windowId: "month-2026-10" });
    expect(thin.readiness!.ranked.available).toBe(false);
    // Readiness never creates the template.
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_windows").get()?.n).toBe(0);
  });
});

describe("pool and weights", () => {
  it("loads only servable rows (current chapters) and computes uniform weights without official data", () => {
    stock({ single: 2, integer: 1 });
    const pool = loadExamPool(db, "JEE_MAIN", T0);
    expect(pool.length).toBe(9);
    const { weights, meta } = weightsFor(db, blueprint, T0);
    expect(weights.physics).toEqual({ "phy-a": 0.5, "phy-b": 0.5 });
    expect(meta.uniformSubjects).toEqual(["physics"]);
    db.prepare("UPDATE qb_chapters SET exam_status = '{\"JEE_MAIN\":\"removed\"}' WHERE id = 'phy-b'").run();
    db.prepare("UPDATE qb_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'bank.revision'").run();
    expect(loadExamPool(db, "JEE_MAIN", T0).every((i) => i.chapterId === "phy-a")).toBe(true);
    const generated = generatePaper({ blueprint, pool, weights, formatTargets: {}, softExclude: new Set(), mode: "practice", seed: "x" });
    expect(generated.ok).toBe(true);
  });
});

describe("calibration", () => {
  it("suggests only when the Wilson interval clears a band; accepting rewrites the pool; negative discrimination flags", () => {
    const id = approved(db, admin, { chapterId: "phy-a", difficulty: "hard" });
    const record = (outcome: "correct" | "wrong", score: number) =>
      accumulateOutcome(db, { exam: "JEE_MAIN", slot: "jee-main", questions: [{ id, type: "single", outcome }], score, maxScore: 100, now: T0 });
    for (let i = 0; i < 20; i += 1) record("correct", 50);
    expect(itemStatsFor(db, id)[0].state).toBe("none"); // 20 attempts: too few
    for (let i = 0; i < 30; i += 1) record("correct", 50);
    const stats = itemStatsFor(db, id)[0];
    expect(stats).toMatchObject({ state: "suggested", calibrated: "easy", attempted: 50 });
    expect(stats.wilson![0]).toBeGreaterThan(0.6);
    expect(getQuestion(db, id)!.exams[0].difficulty).toBe("hard"); // never automatic
    expect(acceptCalibration(admin, id, "JEE_MAIN", T0, db).ok).toBe(true);
    expect(getQuestion(db, id)!.exams[0]).toMatchObject({ difficulty: "easy", difficultySource: "calibrated" });
    expect(db.prepare("SELECT difficulty FROM qb_pool WHERE question_id = ?").get(id)?.difficulty).toBe("easy");

    const suspect = approved(db, admin, { chapterId: "phy-b" });
    // Spread the histogram (60 papers), then strong papers get it wrong and weak papers right.
    for (let i = 0; i < 60; i += 1) accumulateOutcome(db, { exam: "JEE_MAIN", slot: "jee-main", questions: [], score: i, maxScore: 60, now: T0 });
    for (let i = 0; i < 16; i += 1) {
      accumulateOutcome(db, { exam: "JEE_MAIN", slot: "jee-main", questions: [{ id: suspect, type: "single", outcome: "wrong" }], score: 58, maxScore: 60, now: T0 });
      accumulateOutcome(db, { exam: "JEE_MAIN", slot: "jee-main", questions: [{ id: suspect, type: "single", outcome: "correct" }], score: 2, maxScore: 60, now: T0 });
    }
    expect(getQuestion(db, suspect)!.flags).toContain("negative_discrimination");
    expect(itemStatsFor(db, suspect)[0].discrimination).toBeLessThan(-0.1);
  });
});
