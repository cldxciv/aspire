import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => sessionState.session }));

import { qbCan, resolveQbViewer, roleCan } from "./access";
import { blueprintAction, createDraft as createBlueprintDraft, editableOf, saveDraft as saveBlueprintDraft } from "./blueprints";
import { decideDuplicate } from "./dedupe";
import { addVersionFigureRefs, pruneFigures, QB_FIGURE_PRUNE_AFTER_MS, readPublicFigure, saveFigure } from "./figures";
import { requireQbApi } from "./http";
import { applyAnswerKey, upsertImportDrafts } from "./import-hooks";
import { sourceLabel } from "./labels";
import { QB_PLACEHOLDER_NOTE, QB_SLOT_META } from "./patterns";
import { bulkApproveCommit, bulkApproveStart, createDraft, getQuestion, getQuestionDetail, listQuestions, questionAction, updateQuestion } from "./questions";
import { forceQbSearchModeForTests, qbSearchMode } from "./db";
import { searchQuestionIds } from "./search";
import { taxonomyGate } from "./taxonomy";
import { approved, chapter, CHECKLIST, confirm, draft, examsFor, freshDb, makeUser, mcqContent, adminViewer, staffViewer, T0 } from "./qb-testing";
import type { QbViewer } from "./types";

// QB-CORE-B services (questions, access, taxonomy, figures, search) against fresh in-memory databases.

let db: DatabaseSync;
let admin: QbViewer;

beforeEach(() => {
  db = freshDb();
  admin = adminViewer(db);
  chapter(db, admin, "phy-a", "physics");
  chapter(db, admin, "chem-a", "chemistry");
});

afterEach(() => {
  db.close();
  sessionState.session = null;
});

describe("access", () => {
  it("resolves admins, active members only, and nobody with a pending password", () => {
    const author = staffViewer(db, admin, "author", ["physics"]);
    expect(author).toMatchObject({ role: "author", subjects: ["physics"] });

    const crmOnly = makeUser(db, "staff");
    db.prepare("INSERT INTO crm_staff (user_id, crm_role, centre_slugs, active, created_at, updated_at) VALUES (?, 'counsellor', '[]', 1, ?, ?)").run(crmOnly.id, T0, T0);
    expect(resolveQbViewer({ userId: crmOnly.id, role: "staff" }, db)).toBeNull();

    const pending = makeUser(db, "admin", { mustChangePassword: true });
    expect(resolveQbViewer({ userId: pending.id, role: "admin", mustChangePassword: true }, db)).toBeNull();
    const student = makeUser(db, "student");
    expect(resolveQbViewer({ userId: student.id, role: "student" }, db)).toBeNull();
  });

  it("applies the capability matrix and subject scope", () => {
    const author = staffViewer(db, admin, "author", ["physics"]);
    const reviewer = staffViewer(db, admin, "reviewer", ["chemistry"]);
    expect(qbCan(author, "edit_draft", "physics")).toBe(true);
    expect(qbCan(author, "edit_draft", "chemistry")).toBe(false);
    expect(qbCan(author, "approve")).toBe(false);
    expect(qbCan(author, "import_ai")).toBe(false);
    expect(qbCan(author, "import_tabular")).toBe(true);
    expect(qbCan(reviewer, "approve", "chemistry")).toBe(true);
    expect(qbCan(reviewer, "approve", "physics")).toBe(false);
    expect(qbCan(reviewer, "publish_blueprint")).toBe(false);
    for (const capability of ["publish_blueprint", "confirm_taxonomy", "manage_team", "manage_settings", "import_ai", "approve"] as const) {
      expect(qbCan(admin, capability, "zoology")).toBe(true);
    }
    expect(roleCan("reviewer", "edit_blueprint")).toBe(true);
  });

  it("requireQbApi answers 401, 409 for a pending password, 403 without membership or capability", async () => {
    const get = (path = "/api/admin/qb/questions") => new Request(`http://localhost:3000${path}`);
    sessionState.session = null;
    expect((await requireQbApi(get(), "view")).ok).toBe(false);
    if (!(await requireQbApi(get(), "view")).ok) expect(((await requireQbApi(get(), "view")) as { response: Response }).response.status).toBe(401);
    sessionState.session = { userId: "u_pending", role: "staff", mustChangePassword: true };
    const pending = await requireQbApi(get(), "view");
    expect(pending.ok ? 0 : pending.response.status).toBe(409);
    sessionState.session = { userId: "u_nomember", role: "staff" };
    const noMember = await requireQbApi(get(), "view");
    expect(noMember.ok ? 0 : noMember.response.status).toBe(403);
    sessionState.session = { userId: "u_student", role: "student" };
    const student = await requireQbApi(get(), "view");
    expect(student.ok ? 0 : student.response.status).toBe(403);
    sessionState.session = { userId: "u_admin", role: "admin", displayName: "A" };
    const okAdmin = await requireQbApi(get(), "publish_blueprint");
    expect(okAdmin.ok).toBe(true);
    const crossSite = new Request("http://localhost:3000/api/admin/qb/questions", { method: "POST", headers: { origin: "https://evil.example" } });
    const rejected = await requireQbApi(crossSite, "edit_draft");
    expect(rejected.ok ? 0 : rejected.response.status).toBe(403);
  });
});

describe("drafts, approval and the checklist", () => {
  it("derives the subject from the chapter", () => {
    const result = createDraft(
      admin,
      { chapterId: "chem-a", subject: "physics", content: mcqContent(), source: { kind: "aspire" }, exams: examsFor("JEE_MAIN") },
      T0,
      db,
    );
    expect(result.ok && result.data.question.subject).toBe("chemistry");
  });

  it("blocks approval while a blocking flag is set, and approves a clean draft", () => {
    const missing = draft(db, admin, { chapterId: "phy-a", content: mcqContent({ answer: null }) });
    expect(getQuestion(db, missing)!.flags).toContain("answer_missing");
    const refused = questionAction(admin, missing, { action: "approve", checklist: CHECKLIST }, T0, db);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("blocking_flags");
    expect(questionAction(admin, missing, { action: "approve", checklist: { ...CHECKLIST, licence: false } }, T0, db).ok).toBe(false);

    const clean = approved(db, admin, { chapterId: "phy-a" });
    const q = getQuestion(db, clean)!;
    expect(q).toMatchObject({ status: "approved", version: 1, approvedVersion: 1 });
    expect(q.exams[0].syllabus).toBe("current"); // the checklist's syllabus tick
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_pool WHERE question_id = ?").get(clean)?.n).toBe(1);
  });

  it("lets an author write drafts in their subjects but not approve", () => {
    const author = staffViewer(db, admin, "author", ["physics"]);
    const id = draft(db, author, { chapterId: "phy-a" });
    const refused = questionAction(author, id, { action: "approve", checklist: CHECKLIST }, T0, db);
    expect(refused.ok ? null : refused.error).toBe("forbidden");
    const outside = createDraft(author, { chapterId: "chem-a", content: mcqContent(), source: { kind: "aspire" }, exams: examsFor("JEE_MAIN") }, T0, db);
    expect(outside.ok ? null : outside.code).toBe("subject_scope");
    expect(questionAction(author, id, { action: "submit" }, T0, db).ok).toBe(true);
  });

  it("records self-approval, and refuses it under the second-reviewer policy", () => {
    const reviewer = staffViewer(db, admin, "reviewer");
    const own = draft(db, reviewer, { chapterId: "phy-a" });
    expect(questionAction(reviewer, own, { action: "approve", checklist: CHECKLIST }, T0, db).ok).toBe(true);
    const event = db.prepare("SELECT details FROM qb_events WHERE question_id = ? AND action = 'approved'").get(own);
    expect(JSON.parse(String(event?.details)).self).toBe(true);
    db.prepare("INSERT INTO qb_settings (key, value, updated_at) VALUES ('approval.self', '\"second_reviewer\"', 1)").run();
    const second = draft(db, reviewer, { chapterId: "phy-a" });
    const refused = questionAction(reviewer, second, { action: "approve", checklist: CHECKLIST }, T0, db);
    expect(refused.ok ? null : refused.code).toBe("self_approval");
  });

  it("still sees self-approval when another reviewer edits after the approver's content edit", () => {
    db.prepare("INSERT INTO qb_settings (key, value, updated_at) VALUES ('approval.self', '\"second_reviewer\"', 1)").run();
    const author = staffViewer(db, admin, "author");
    const a = staffViewer(db, admin, "reviewer");
    const b = staffViewer(db, admin, "reviewer");
    const c = staffViewer(db, admin, "reviewer");
    const id = draft(db, author, { chapterId: "phy-a" });
    const q = getQuestion(db, id)!;
    expect(updateQuestion(a, id, { content: { ...q.content, stem: { en: "Synthetic item rewritten by reviewer A.", hi: "" } } }, T0 + 1, db).ok).toBe(true);
    expect(updateQuestion(b, id, { exams: [{ exam: "JEE_MAIN", eligible: true, difficulty: "hard" }] }, T0 + 2, db).ok).toBe(true);
    expect(getQuestion(db, id)!.updatedBy).toBe(b.userId);
    const refused = questionAction(a, id, { action: "approve", checklist: CHECKLIST }, T0 + 3, db);
    expect(refused.ok ? null : refused.code).toBe("self_approval");
    // A reviewer who touched nothing approves; the event records it as not self-approved.
    expect(questionAction(c, id, { action: "approve", checklist: CHECKLIST }, T0 + 4, db).ok).toBe(true);
    const event = db.prepare("SELECT details FROM qb_events WHERE question_id = ? AND action = 'approved'").get(id);
    expect(JSON.parse(String(event?.details)).self).toBe(false);
  });

  it("guards against lost updates and keeps suspended / retired questions out of the pool", () => {
    const id = approved(db, admin, { chapterId: "phy-a" });
    const stale = updateQuestion(admin, id, { baseUpdatedAt: 1, content: mcqContent() }, T0 + 1, db);
    expect(stale.ok ? null : stale.code).toBe("stale");
    expect(questionAction(admin, id, { action: "suspend", reason: "checking" }, T0, db).ok).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_pool WHERE question_id = ?").get(id)?.n).toBe(0);
    expect(questionAction(admin, id, { action: "unsuspend" }, T0, db).ok).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_pool WHERE question_id = ?").get(id)?.n).toBe(1);
    expect(questionAction(admin, id, { action: "retire", reason: "outdated" }, T0, db).ok).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_pool WHERE question_id = ?").get(id)?.n).toBe(0);
    expect(questionAction(admin, id, { action: "restore" }, T0, db).ok).toBe(false);
  });
});

describe("bulk approval with spot checks", () => {
  it("refuses excluded flags, needs every sampled token, and aborts on a failed check", () => {
    const ids = Array.from({ length: 6 }, () => draft(db, admin, { chapterId: "phy-a" }));
    const flagged = draft(db, admin, { chapterId: "phy-a" });
    db.prepare("UPDATE qb_questions SET flags = '[\"low_confidence\"]' WHERE id = ?").run(flagged);

    const start = bulkApproveStart(admin, { op: "approve", ids: [...ids, flagged], exam: null }, T0, db);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(start.data.skipped).toEqual([{ id: flagged, reason: "flag:low_confidence" }]);
    expect(start.data.sample).toHaveLength(3);

    const incomplete = bulkApproveCommit(admin, { op: "approve", batchId: start.data.batchId, checks: [] }, T0, db);
    expect(incomplete.ok ? null : incomplete.code).toBe("spot_check_incomplete");

    const tokens = start.data.sample.map((id) => {
      const detail = getQuestionDetail(admin, id, { spotCheckBatchId: start.data.batchId, now: T0 }, db);
      if (!detail.ok || !detail.data.spotToken) throw new Error("no token");
      return { id, token: detail.data.spotToken, ok: true };
    });
    // A not-sampled item never gets a token.
    const outside = ids.find((id) => !start.data.sample.includes(id))!;
    const outsideDetail = getQuestionDetail(admin, outside, { spotCheckBatchId: start.data.batchId, now: T0 }, db);
    expect(outsideDetail.ok && outsideDetail.data.spotToken).toBeNull();

    const failed = bulkApproveCommit(admin, { op: "approve", batchId: start.data.batchId, checks: [{ ...tokens[0], ok: false }, ...tokens.slice(1)] }, T0, db);
    expect(failed.ok && failed.data.outcome).toBe("aborted");
    expect(ids.every((id) => getQuestion(db, id)!.status === "draft")).toBe(true);

    const again = bulkApproveStart(admin, { op: "approve", ids, exam: null }, T0, db);
    if (!again.ok) throw new Error("start");
    const checks = again.data.sample.map((id) => {
      const detail = getQuestionDetail(admin, id, { spotCheckBatchId: again.data.batchId, now: T0 }, db);
      return { id, token: detail.ok ? detail.data.spotToken! : "", ok: true };
    });
    const done = bulkApproveCommit(admin, { op: "approve", batchId: again.data.batchId, checks }, T0, db);
    expect(done.ok && done.data.outcome).toBe("done");
    expect(ids.every((id) => getQuestion(db, id)!.status === "approved")).toBe(true);
    // The batch (and its tokens) is single-use.
    const reuse = bulkApproveCommit(admin, { op: "approve", batchId: again.data.batchId, checks }, T0, db);
    expect(reuse.ok ? null : reuse.code).toBe("batch_expired");
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_events WHERE action = 'bulk_approve'").get()?.n).toBe(6);
  });
});

describe("fidelity and sources", () => {
  function importOfficial(stem = "Synthetic official item: a block slides on a plane.") {
    const content = mcqContent({ answer: null, stem });
    upsertImportDrafts(
      "imp_test_1",
      [
        {
          sourceKey: "physics:A:12",
          content,
          subject: "physics",
          chapterId: "phy-a",
          source: { kind: "official", exam: "JEE_MAIN", year: 2025, date: "2025-01-22", shift: "Shift 1", qno: "12" },
          aiDifficulty: "medium",
          aiReason: "two steps",
          confidence: 0.9,
          flags: [],
          patternTag: "jee-main-2025",
          originalMarking: { correct: 4, wrong: -1 },
        },
      ],
      db,
      T0,
    );
    return String(db.prepare("SELECT id FROM qb_questions WHERE import_id = 'imp_test_1' AND source_key = 'physics:A:12'").get()?.id);
  }

  it("stores the AI chapter as a suggestion and is idempotent on (import, source key)", () => {
    const id = importOfficial();
    const q = getQuestion(db, id)!;
    expect(q.chapterId).toBeNull();
    expect(q.aiChapterId).toBe("phy-a");
    expect(q.flags).toEqual(expect.arrayContaining(["chapter_missing", "answer_missing", "difficulty_missing"]));
    expect(q.exams[0]).toMatchObject({ exam: "JEE_MAIN", aiDifficulty: "medium", difficulty: null, syllabus: "current" });
    expect(importOfficial()).toBe(id);
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_questions").get()?.n).toBe(1);
  });

  it("flags edited official stems, labels adapted questions, and forces adapted when the answer differs from the final key", () => {
    const id = importOfficial();
    applyAnswerKey([{ questionId: id, keyImportId: "key_1", keyStage: "final", keyStatus: "matched", answer: { kind: "single", index: 2 }, accepted: null, note: null }], db, T0);
    let q = getQuestion(db, id)!;
    expect(q.keyStage).toBe("final");
    expect(q.flags).not.toContain("key_provisional");
    expect(q.flags).not.toContain("fidelity_unconfirmed");

    const edited = updateQuestion(admin, id, { chapterId: "phy-a", content: { ...q.content, stem: { en: "Synthetic official item: a block slides DOWN a plane.", hi: "" } } }, T0 + 1, db);
    expect(edited.ok).toBe(true);
    q = getQuestion(db, id)!;
    expect(q.flags).toContain("fidelity_unconfirmed");
    expect(q.fidelity).toBeNull();

    // Whitespace-only edits are not changes.
    const ws = updateQuestion(admin, id, { content: { ...q.content, stem: { en: "Synthetic   official item: a block slides on a plane.", hi: "" } } }, T0 + 2, db);
    expect(ws.ok).toBe(true);
    expect(getQuestion(db, id)!.fidelity).toBe("verbatim");

    const adapted = questionAction(admin, id, { action: "set_fidelity", fidelity: "adapted", adaptedNote: { en: "Numbers changed.", hi: "" } }, T0 + 3, db);
    expect(adapted.ok).toBe(true);
    q = getQuestion(db, id)!;
    expect(sourceLabel({ source: q.source, fidelity: q.fidelity }, "en")).toBe("Adapted by Aspire from JEE Main 2025 · 22 Jan · Shift 1 · Q 12 (NTA)");

    const id2 = importOfficial("Synthetic official item two.");
    applyAnswerKey([{ questionId: id2, keyImportId: "key_1", keyStage: "final", keyStatus: "matched", answer: { kind: "single", index: 0 }, accepted: null, note: null }], db, T0);
    const q2 = getQuestion(db, id2)!;
    updateQuestion(admin, id2, { content: { ...q2.content, answer: { kind: "single", index: 3 } } }, T0 + 4, db);
    expect(getQuestion(db, id2)!.fidelity).toBe("adapted");
    const fix = questionAction(admin, id2, { action: "set_fidelity", fidelity: "transcription_fixed" }, T0 + 5, db);
    expect(fix.ok ? null : fix.code).toBe("fidelity_answer_differs");
  });

  function importRow(id: string, kind: string, meta: Record<string, unknown>) {
    db.prepare(
      `INSERT INTO qb_imports (id, kind, status, file_name, file_size, file_sha256, meta, licence_ack_by, licence_ack_at, created_by, created_at, updated_at)
       VALUES (?, ?, 'done', 'synthetic-file', 1, 'synthetic', ?, ?, ?, ?, ?, ?)`,
    ).run(id, kind, JSON.stringify(meta), admin.userId, T0, admin.userId, T0, T0);
  }

  it("keeps re-attributions of imported official questions auditable and blocked until reviewed", () => {
    importRow("imp_test_1", "pdf_paper", { sourceKind: "official", exam: "JEE_MAIN", year: 2025, date: "2025-01-22", shift: "Shift 1", language: "en" });
    const id = importOfficial();
    let q = getQuestion(db, id)!;
    expect(q.flags).not.toContain("source_mismatch");
    // A question-number fix keeps the paper: recorded, not flagged.
    expect(updateQuestion(admin, id, { source: { ...q.source, qno: "13" } }, T0 + 1, db).ok).toBe(true);
    q = getQuestion(db, id)!;
    expect(q.flags).not.toContain("source_mismatch");
    let edited = db.prepare("SELECT details FROM qb_events WHERE question_id = ? AND action = 'edited' ORDER BY id DESC").get(id);
    expect(JSON.parse(String(edited?.details))).toMatchObject({
      fields: "source",
      sourceBefore: "JEE_MAIN|2025|2025-01-22||Shift 1|#12",
      sourceAfter: "JEE_MAIN|2025|2025-01-22||Shift 1|#13",
    });
    // Pointing it at another paper than the import was declared for sets the blocking source_mismatch.
    expect(updateQuestion(admin, id, { source: { ...q.source, shift: "Shift 2" } }, T0 + 2, db).ok).toBe(true);
    q = getQuestion(db, id)!;
    expect(q.flags).toContain("source_mismatch");
    edited = db.prepare("SELECT details FROM qb_events WHERE question_id = ? AND action = 'edited' ORDER BY id DESC").get(id);
    expect(JSON.parse(String(edited?.details))).toMatchObject({ sourceAfter: "JEE_MAIN|2025|2025-01-22||Shift 2|#13", sourceMismatch: true });
  });

  it("stores solutions from AI-extracted imports as drafts that need review; tabular templates keep theirs", () => {
    importRow("imp_pdf_bank", "pdf_bank", { sourceKind: "aspire", language: "en" });
    importRow("imp_csv_bank", "csv_bank", { sourceKind: "aspire", language: "en" });
    const draftInput = (key: string) => ({
      sourceKey: key,
      content: mcqContent(),
      subject: "physics" as const,
      chapterId: "phy-a",
      source: { kind: "aspire" as const },
      aiDifficulty: "medium" as const,
      aiReason: "one step",
      confidence: 0.9,
      flags: [],
      patternTag: null,
      originalMarking: null,
    });
    upsertImportDrafts("imp_pdf_bank", [draftInput("bank:1")], db, T0);
    upsertImportDrafts("imp_csv_bank", [draftInput("bank:2")], db, T0);
    const fromPdf = getQuestion(db, String(db.prepare("SELECT id FROM qb_questions WHERE import_id = 'imp_pdf_bank'").get()?.id))!;
    const fromCsv = getQuestion(db, String(db.prepare("SELECT id FROM qb_questions WHERE import_id = 'imp_csv_bank'").get()?.id))!;
    expect(fromPdf.content.solutionSource).toBe("ai_draft");
    expect(fromPdf.flags).toContain("solution_unreviewed");
    expect(fromCsv.content.solutionSource).toBe("staff");
    expect(fromCsv.flags).not.toContain("solution_unreviewed");
  });

  it("keeps the official question when an Aspire bank copy of it came first", () => {
    const stem = "Synthetic copied stem about a lens of focal length three units.";
    const base = { chapterId: "phy-a", exams: examsFor("JEE_MAIN") };
    const content = mcqContent({ stem });
    const bank = createDraft(admin, { ...base, content, source: { kind: "aspire", aspireRef: "BANK-7" } }, T0, db);
    const official = createDraft(
      admin,
      { ...base, content, source: { kind: "official", exam: "JEE_MAIN", year: 2024, shift: "Shift 1", qno: "2", evidenceUrl: "https://jeemain.nta.nic.in/p.pdf", evidencePage: 1 } },
      T0 + 10,
      db,
    );
    if (!bank.ok || !official.ok) throw new Error("create");
    expect(getQuestion(db, official.data.question.id)!.flags).toContain("exact_duplicate");
    const decided = decideDuplicate(admin, { a: bank.data.question.id, b: official.data.question.id, decision: "duplicate" }, T0 + 20, db);
    expect(decided.ok).toBe(true);
    expect(getQuestion(db, official.data.question.id)!.status).toBe("draft");
    expect(getQuestion(db, bank.data.question.id)!.status).toBe("rejected");
  });

  it("flags hand-entered official evidence on a non-official site as third-party", () => {
    const made = createDraft(
      admin,
      {
        chapterId: "phy-a",
        content: mcqContent(),
        source: { kind: "official", exam: "JEE_MAIN", year: 2024, shift: "Shift 2", qno: "8", evidenceUrl: "https://examplecoaching.com/jee-main.pdf", evidencePage: 3 },
        exams: examsFor("JEE_MAIN"),
      },
      T0,
      db,
    );
    expect(made.ok && made.data.question.flags).toContain("third_party_source");
    expect(made.ok && made.data.approval.blockers).toContain("flag:third_party_source");
  });

  it("sets source_incomplete for a hand-made official question without evidence", () => {
    const create = (evidence: boolean) =>
      createDraft(
        admin,
        {
          chapterId: "phy-a",
          content: mcqContent(),
          source: {
            kind: "official",
            exam: "JEE_MAIN",
            year: 2024,
            shift: "Shift 2",
            qno: "3",
            ...(evidence ? { evidenceUrl: "https://jeemain.nta.nic.in/paper.pdf", evidencePage: 4 } : {}),
          },
          exams: examsFor("JEE_MAIN"),
        },
        T0,
        db,
      );
    const without = create(false);
    const withEvidence = create(true);
    expect(without.ok && without.data.question.flags).toContain("source_incomplete");
    expect(withEvidence.ok && withEvidence.data.question.flags).not.toContain("source_incomplete");
    // Hand-entered official answers stay provisional until verified.
    expect(withEvidence.ok && withEvidence.data.question.flags).toContain("key_provisional");
  });

  it("adds also_in only on an exact duplicate confirmed by a reviewer", () => {
    const stem = "Synthetic duplicate stem about a pendulum of length two units.";
    const base = { chapterId: "phy-a", exams: examsFor("JEE_MAIN") };
    const a = createDraft(admin, { ...base, content: mcqContent({ stem }), source: { kind: "official", exam: "JEE_MAIN", year: 2024, shift: "Shift 1", qno: "5", evidenceUrl: "https://nta.ac.in/a.pdf", evidencePage: 2 } }, T0, db);
    const b = createDraft(admin, { ...base, content: { ...mcqContent({ stem }), options: (a.ok ? a.data.question.content.options : []).slice().reverse() }, source: { kind: "official", exam: "JEE_MAIN", year: 2025, shift: "Shift 2", qno: "9", evidenceUrl: "https://nta.ac.in/b.pdf", evidencePage: 7 } }, T0 + 10, db);
    if (!a.ok || !b.ok) throw new Error("create");
    const qb = getQuestion(db, b.data.question.id)!;
    expect(qb.flags).toContain("exact_duplicate");
    const near = createDraft(admin, { ...base, content: mcqContent({ stem: `${stem} Ignore friction.` }), source: { kind: "aspire" } }, T0 + 20, db);
    if (!near.ok) throw new Error("near");
    const decided = decideDuplicate(admin, { a: a.data.question.id, b: b.data.question.id, decision: "duplicate" }, T0 + 30, db);
    expect(decided.ok).toBe(true);
    const kept = getQuestion(db, a.data.question.id)!;
    expect(kept.alsoIn).toHaveLength(1);
    expect(kept.alsoIn[0]).toMatchObject({ exam: "JEE_MAIN", year: 2025, qno: "9" });
    expect(kept.flags).not.toContain("exact_duplicate");
    expect(getQuestion(db, b.data.question.id)!.status).toBe("rejected");
    // A near pair decided "duplicate" never adds also_in.
    const nearPair = db.prepare("SELECT a, b FROM qb_dup_pairs WHERE kind = 'near' AND status = 'open'").get();
    if (nearPair) {
      decideDuplicate(admin, { a: String(nearPair.a), b: String(nearPair.b), decision: "duplicate" }, T0 + 40, db);
      expect(getQuestion(db, a.data.question.id)!.alsoIn).toHaveLength(1);
    }
  });
});

describe("taxonomy gate", () => {
  it("blocks imports and publishing until an admin confirms, and BOH placeholders until the pattern is confirmed", () => {
    expect(taxonomyGate(db, "JEE_MAIN").ok).toBe(false);
    const draftBp = createBlueprintDraft(admin, { slot: "jee-main" }, T0, db);
    if (!draftBp.ok) throw new Error("bp");
    expect(draftBp.data.publishBlockers).toContain("taxonomy_unconfirmed");
    const refused = blueprintAction(admin, draftBp.data.blueprint.id, { action: "publish" }, T0, db);
    expect(refused.ok ? null : refused.code).toBe("taxonomy_unconfirmed");
    confirm(db, admin, "JEE_MAIN");
    expect(taxonomyGate(db, "JEE_MAIN").ok).toBe(true);
    expect(blueprintAction(admin, draftBp.data.blueprint.id, { action: "publish" }, T0, db).ok).toBe(true);

    chapter(db, admin, "boh-ma", "mental_ability", ["BOH"], "class_9_10");
    confirm(db, admin, "BOH", null);
    const boh = createBlueprintDraft(admin, { slot: "boh-class-10" }, T0, db);
    if (!boh.ok) throw new Error("boh");
    const bohRefused = blueprintAction(admin, boh.data.blueprint.id, { action: "publish" }, T0, db);
    expect(bohRefused.ok ? null : bohRefused.code).toBe("placeholder_blueprint");
    // A draft made before the wording moved out still carries "not available yet" in its summary.
    const oldWording = saveBlueprintDraft(admin, boh.data.blueprint.id, { definition: editableOf({ ...boh.data.blueprint, summary: { ...QB_PLACEHOLDER_NOTE } }) }, T0, db);
    expect(oldWording.ok).toBe(true);
    const reviewer = staffViewer(db, admin, "reviewer");
    expect(blueprintAction(reviewer, boh.data.blueprint.id, { action: "confirm_pattern", note: "Confirmed with the BOH team" }, T0, db).ok).toBe(false);
    const confirmed = blueprintAction(admin, boh.data.blueprint.id, { action: "confirm_pattern", note: "Confirmed with the BOH team" }, T0, db);
    expect(confirmed.ok && confirmed.data.blueprint.summary).toEqual(QB_SLOT_META["boh-class-10"].summary);
    expect(confirmed.ok && confirmed.data.publishBlockers).toEqual([]);
    expect(blueprintAction(admin, boh.data.blueprint.id, { action: "publish" }, T0, db).ok).toBe(true);
    // Publishing is refused while a summary still says the mock is not available.
    const next = blueprintAction(admin, boh.data.blueprint.id, { action: "new_version" }, T0, db);
    if (!next.ok) throw new Error(next.message);
    saveBlueprintDraft(admin, next.data.blueprint.id, { definition: editableOf({ ...next.data.blueprint, summary: { ...QB_PLACEHOLDER_NOTE } }) }, T0, db);
    const stillPlaceholder = blueprintAction(admin, next.data.blueprint.id, { action: "publish" }, T0, db);
    expect(stillPlaceholder.ok ? null : stillPlaceholder.code).toBe("placeholder_blueprint");
  });

  it("keeps a question with an unchecked syllabus out of the pool", () => {
    const id = approved(db, admin, { chapterId: "phy-a" });
    db.prepare("UPDATE qb_question_exams SET syllabus = 'unchecked' WHERE question_id = ?").run(id);
    const edited = updateQuestion(admin, id, { exams: [{ exam: "JEE_MAIN", eligible: true, difficulty: "hard", syllabus: "unchecked" }] }, T0 + 1, db);
    expect(edited.ok).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_pool WHERE question_id = ?").get(id)?.n).toBe(0);
  });
});

describe("figures", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "qb-fig-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function png(width: number, height: number, salt: number): Uint8Array {
    const bytes = new Uint8Array(64);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, width);
    view.setUint32(20, height);
    bytes[40] = salt;
    return bytes;
  }

  it("keeps a figure used only by v1 while pruning orphans, and serves only approved refs", () => {
    const saved = saveFigure(admin, { bytes: png(300, 200, 1) }, T0, db, { dir });
    if (!saved.ok) throw new Error(saved.message);
    expect(saved.data).toMatchObject({ width: 300, height: 200, mime: "image/png" });
    const orphan = saveFigure(admin, { bytes: png(10, 10, 2) }, T0, db, { dir });
    if (!orphan.ok) throw new Error(orphan.message);
    expect(readPublicFigure(saved.data.id, db, { dir })).toBeNull(); // no approved ref yet

    const content = { ...mcqContent(), stem: { en: "Synthetic item with a diagram [[figure:1]]", hi: "" }, figures: [{ id: saved.data.id, slot: "stem" as const, alt: { en: "Diagram", hi: "" }, width: 300, height: 200 }] };
    const id = approved(db, admin, { chapterId: "phy-a", content });
    expect(readPublicFigure(saved.data.id, db, { dir })?.mime).toBe("image/png");
    // The working copy drops the figure; v1 still references it.
    const q = getQuestion(db, id)!;
    updateQuestion(admin, id, { content: { ...q.content, stem: { en: "Synthetic item without a diagram", hi: "" }, figures: [] } }, T0 + 1, db);
    const removed = pruneFigures(db, T0 + QB_FIGURE_PRUNE_AFTER_MS + 1, { dir });
    expect(removed).toBe(1);
    expect(readPublicFigure(saved.data.id, db, { dir })).not.toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS n FROM qb_figures WHERE id = ?").get(orphan.data.id)?.n).toBe(0);
    addVersionFigureRefs(db, id, 1, [saved.data.id]); // idempotent
  });

  it("blocks approval while a question figure has no text alternative", () => {
    const saved = saveFigure(admin, { bytes: png(200, 100, 5) }, T0, db, { dir });
    if (!saved.ok) throw new Error(saved.message);
    const figure = { id: saved.data.id, slot: "stem" as const, alt: { en: "", hi: "" }, width: 200, height: 100 };
    const content = { ...mcqContent(), stem: { en: "Synthetic item with a diagram [[figure:1]]", hi: "" }, figures: [figure] };
    const id = draft(db, admin, { chapterId: "phy-a", content });
    const refused = questionAction(admin, id, { action: "approve", checklist: CHECKLIST }, T0, db);
    expect(refused.ok ? null : refused.code).toBe("blocking_flags");
    expect(refused.ok ? "" : refused.message).toContain("figure_alt");
    const q = getQuestion(db, id)!;
    updateQuestion(admin, id, { content: { ...q.content, figures: [{ ...figure, alt: { en: "A block on an inclined plane", hi: "" } }] } }, T0 + 1, db);
    expect(questionAction(admin, id, { action: "approve", checklist: CHECKLIST }, T0 + 2, db).ok).toBe(true);
  });

  it("refuses non-images, oversized files and a full quota", () => {
    expect(saveFigure(admin, { bytes: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>") }, T0, db, { dir }).ok).toBe(false);
    const big = png(100, 100, 3);
    const huge = new Uint8Array(210 * 1024);
    huge.set(big);
    expect(saveFigure(admin, { bytes: huge }, T0, db, { dir }).ok).toBe(false);
    vi.stubEnv("QB_FIGURE_QUOTA_MB", "0.00001");
    const full = saveFigure(admin, { bytes: png(5, 5, 4) }, T0, db, { dir });
    expect(full.ok ? null : full.code).toBe("figure_quota");
    vi.unstubAllEnvs();
  });
});

describe("search", () => {
  it("finds questions with FTS5 and with the LIKE fallback", () => {
    const id = draft(db, admin, { chapterId: "phy-a", content: mcqContent({ stem: "Synthetic search target: a capacitor network." }) });
    draft(db, admin, { chapterId: "phy-a", content: mcqContent({ stem: "Something else entirely." }) });
    expect(qbSearchMode(db)).toBe("fts");
    expect(searchQuestionIds(db, "capacitor").ids).toEqual([id]);
    const listed = listQuestions(admin, { q: "capacitor" }, db);
    expect(listed.ok && listed.data.items.map((i) => i.id)).toEqual([id]);
    forceQbSearchModeForTests(db, "like");
    const like = searchQuestionIds(db, "capacitor");
    expect(like).toEqual({ ids: [id], mode: "like" });
  });
});
