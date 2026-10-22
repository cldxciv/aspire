import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route tests for `/api/admin/qb/**` (QB-ADMIN-API, docs/question-bank-plan.md §B14 package 6).
 *
 * The QB-CORE-B services and QB-SEED are replaced by a fake of `_lib/services.ts` (the one module
 * the routes call them through), so these tests pin down what the ROUTES own: same-origin, the
 * §B6 capability each route asks for, 64 KB bodies, validation, id checks, how service results
 * map onto the envelope (409 + `code`), the spot-check plumbing, the figure upload limits and the
 * core audit rows (real in-memory database). The services' own rules (approval blockers, subject
 * scope, taxonomy gate, spot-check tokens) are QB-CORE-B's tests; here they arrive as results.
 */

type Role = "admin" | "reviewer" | "author";
type Viewer = { userId: string; displayName: string; role: Role; subjects: string[] };

const state = vi.hoisted(() => ({ viewer: null as Viewer | null, mustChangePassword: false }));

vi.mock("./_lib/services", async () => {
  const { NextResponse } = await import("next/server");
  const { qbRoleCan } = await import("@/components/qb-admin/constants");
  const reply = (status: number, error: string) => NextResponse.json({ ok: false, error, message: error }, { status });
  const okWith = (data: unknown) => vi.fn(async () => ({ ok: true, data }));
  const blueprint = (status: string) => ({
    blueprint: { id: "bp_jee_main_2", slot: "jee-main", version: 2, status, placeholder: false },
    updatedAt: 1,
    issues: [],
    taxonomyConfirmed: true,
    publishBlockers: [],
  });
  return {
    // Mirrors the assumed `requireQbApi` contract: 401 signed out, 409 password change, 403 capability.
    guardQbApi: vi.fn(async (_request: Request, capability: Parameters<typeof qbRoleCan>[1]) => {
      if (!state.viewer) return { ok: false, response: reply(401, "unauthenticated") };
      if (state.mustChangePassword) return { ok: false, response: reply(409, "bad_request") };
      if (!qbRoleCan(state.viewer.role, capability)) return { ok: false, response: reply(403, "forbidden") };
      return { ok: true, viewer: state.viewer };
    }),
    ensureSeeded: vi.fn(async () => undefined),
    listQuestions: okWith({ items: [], total: 0, page: 1, pageSize: 25, search: null }),
    getQuestion: okWith({ question: { id: "q_abc" }, spotToken: null }),
    createQuestion: okWith({ question: { id: "q_new" } }),
    updateQuestion: okWith({ question: { id: "q_abc" } }),
    questionAction: okWith({ question: { id: "q_abc" } }),
    bulkStart: okWith({ batchId: "batch_1", op: "approve", exam: null, eligible: ["q_1"], skipped: [], sample: ["q_1"], expiresAt: 9 }),
    bulkCommit: okWith({ outcome: "done", op: "approve", count: 1, ids: ["q_1"], sample: ["q_1"] }),
    bulkCancel: okWith({ cancelled: true }),
    saveFigure: okWith({ id: "0123456789abcdef0123456789abcdef", mime: "image/png", width: 1, height: 1, size: 70, url: "/x" }),
    readFigure: okWith({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mime: "image/png" }),
    listUnits: okWith({ exam: "JEE_MAIN", status: { confirmed: false }, units: [], gaps: [] }),
    upsertUnit: okWith({ id: "JEE_MAIN:2026:physics:01", exam: "JEE_MAIN", syllabusYear: 2026, status: "current" }),
    listChapters: okWith([]),
    createChapter: okWith({ id: "phy-new" }),
    updateChapter: okWith({ id: "phy-units" }),
    confirmTaxonomy: okWith({ exam: "JEE_MAIN", confirmed: true, confirmedAt: 1, confirmedBy: "u_admin", syllabusRevisionYear: 2024 }),
    listBlueprints: okWith([]),
    getBlueprint: okWith(blueprint("draft")),
    createBlueprint: okWith(blueprint("draft")),
    saveBlueprint: okWith(blueprint("draft")),
    blueprintAction: okWith(blueprint("published")),
    blueprintReadiness: okWith({ level: "thin" }),
    blueprintPreview: okWith({ ok: false }),
    blueprintPreviewStats: okWith({ seeds: 100 }),
    coverage: okWith({ exam: "JEE_MAIN", subjects: [] }),
    listDuplicates: okWith({ items: [], total: 0, page: 1, pageSize: 25 }),
    decideDuplicate: okWith({ a: "q_a", b: "q_b", status: "variant" }),
    listReports: okWith({ items: [], total: 0, page: 1, pageSize: 25 }),
    updateReport: okWith({ id: 7, status: "resolved" }),
    listCorrections: okWith([]),
    createCorrection: okWith({ correction: { id: 3 }, rescoredAttempts: 2 }),
    listMembers: okWith({ members: [], candidates: [] }),
    upsertMember: okWith({ userId: "u_staff" }),
    getSettings: okWith({ importEnabled: false, importEnvOff: false }),
    updateSettings: okWith({ importEnabled: true, importEnvOff: false }),
  };
});

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { listAudit } = await import("@/lib/db/audit");
const { params, TestBrowser } = await import("@/lib/auth/testing/harness");
const services = await import("./_lib/services");
const { resetQbAdminRateLimitersForTests } = await import("./_lib/http");
const questions = await import("./questions/route");
const question = await import("./questions/[id]/route");
const questionActions = await import("./questions/[id]/actions/route");
const bulk = await import("./questions/bulk/route");
const bulkLabels = await import("./questions/bulk-labels/route");
const figures = await import("./figures/route");
const figure = await import("./figures/[id]/route");
const units = await import("./units/route");
const chapters = await import("./chapters/route");
const chapter = await import("./chapters/[id]/route");
const taxonomyConfirm = await import("./taxonomy/[exam]/confirm/route");
const blueprints = await import("./blueprints/route");
const blueprintById = await import("./blueprints/[id]/route");
const blueprintActions = await import("./blueprints/[id]/actions/route");
const readiness = await import("./blueprints/[id]/readiness/route");
const preview = await import("./blueprints/[id]/preview/route");
const previewStats = await import("./blueprints/[id]/preview-stats/route");
const coverage = await import("./coverage/route");
const duplicates = await import("./duplicates/route");
const decide = await import("./duplicates/decide/route");
const reports = await import("./reports/route");
const report = await import("./reports/[id]/route");
const corrections = await import("./corrections/route");
const members = await import("./members/route");
const member = await import("./members/[userId]/route");
const settings = await import("./settings/route");

const ADMIN: Viewer = { userId: "u_admin", displayName: "Office Admin", role: "admin", subjects: [] };
const REVIEWER: Viewer = { userId: "u_reviewer", displayName: "Reviewer One", role: "reviewer", subjects: ["physics"] };
const AUTHOR: Viewer = { userId: "u_author", displayName: "Author One", role: "author", subjects: ["chemistry"] };

const cookieState = { jar: new Map<string, string>() };
const b = new TestBrowser(cookieState, "198.51.100.77");
const as = (viewer: Viewer | null) => {
  state.viewer = viewer;
};

const bi = (en: string, hi = "") => ({ en, hi });
const CONTENT = {
  type: "single",
  format: "standard",
  passageId: null,
  passageOrder: null,
  stem: bi("A body of mass \\(m\\) moves with speed \\(v\\). Its kinetic energy is"),
  options: [bi("\\(mv\\)"), bi("\\(\\frac{1}{2}mv^2\\)"), bi("\\(mv^2\\)"), bi("\\(2mv\\)")],
  answer: { kind: "single", index: 1 },
  solution: bi("By definition."),
  solutionSource: "staff",
  hiSource: "none",
  figures: [],
  topics: [],
};
const NEW_QUESTION = {
  chapterId: "phy-work-energy",
  content: CONTENT,
  source: { kind: "aspire", aspireRef: "Synthetic test item" },
  exams: [{ exam: "JEE_MAIN", eligible: true, difficulty: "easy" }],
};
const CHECKLIST = { answer: true, transcription: true, math: true, figures: true, hindi: true, syllabus: true, licence: true };
const TOKEN = "spot.token-0123456789abcdef";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

const qid = (id: string) => params({ id });
const send = {
  listQuestions: (query = "") => b.send(questions.GET, `/api/admin/qb/questions${query}`),
  createQuestion: (body: unknown, options = {}) => b.send(questions.POST, "/api/admin/qb/questions", { body, ...options }),
  getQuestion: (id: string, query = "") => b.send(question.GET, `/api/admin/qb/questions/${id}${query}`, {}, qid(id)),
  patchQuestion: (id: string, body: unknown) => b.send(question.PATCH, `/api/admin/qb/questions/${id}`, { method: "PATCH", body }, qid(id)),
  action: (id: string, body: unknown, options = {}) =>
    b.send(questionActions.POST, `/api/admin/qb/questions/${id}/actions`, { body, ...options }, qid(id)),
  bulk: (body: unknown, options = {}) => b.send(bulk.POST, "/api/admin/qb/questions/bulk", { body, ...options }),
  bulkLabels: (body: unknown) => b.send(bulkLabels.POST, "/api/admin/qb/questions/bulk-labels", { body }),
  figure: (id: string) => b.send(figure.GET, `/api/admin/qb/figures/${id}`, {}, qid(id)),
  units: (query = "") => b.send(units.GET, `/api/admin/qb/units${query}`),
  postUnit: (body: unknown) => b.send(units.POST, "/api/admin/qb/units", { body }),
  chapters: (query = "") => b.send(chapters.GET, `/api/admin/qb/chapters${query}`),
  postChapter: (body: unknown) => b.send(chapters.POST, "/api/admin/qb/chapters", { body }),
  patchChapter: (id: string, body: unknown) => b.send(chapter.PATCH, `/api/admin/qb/chapters/${id}`, { method: "PATCH", body }, qid(id)),
  confirm: (exam: string, body: unknown, options = {}) =>
    b.send(taxonomyConfirm.POST, `/api/admin/qb/taxonomy/${exam}/confirm`, { body, ...options }, params({ exam })),
  blueprints: () => b.send(blueprints.GET, "/api/admin/qb/blueprints"),
  postBlueprint: (body: unknown) => b.send(blueprints.POST, "/api/admin/qb/blueprints", { body }),
  getBlueprint: (id: string) => b.send(blueprintById.GET, `/api/admin/qb/blueprints/${id}`, {}, qid(id)),
  saveBlueprint: (id: string, body: unknown) => b.send(blueprintById.PATCH, `/api/admin/qb/blueprints/${id}`, { method: "PATCH", body }, qid(id)),
  blueprintAction: (id: string, body: unknown, options = {}) =>
    b.send(blueprintActions.POST, `/api/admin/qb/blueprints/${id}/actions`, { body, ...options }, qid(id)),
  readiness: (id: string, query = "") => b.send(readiness.GET, `/api/admin/qb/blueprints/${id}/readiness${query}`, {}, qid(id)),
  preview: (id: string, query = "") => b.send(preview.GET, `/api/admin/qb/blueprints/${id}/preview${query}`, {}, qid(id)),
  previewStats: (id: string) => b.send(previewStats.GET, `/api/admin/qb/blueprints/${id}/preview-stats`, {}, qid(id)),
  coverage: (query = "") => b.send(coverage.GET, `/api/admin/qb/coverage${query}`),
  duplicates: (query = "") => b.send(duplicates.GET, `/api/admin/qb/duplicates${query}`),
  decide: (body: unknown) => b.send(decide.POST, "/api/admin/qb/duplicates/decide", { body }),
  reports: (query = "") => b.send(reports.GET, `/api/admin/qb/reports${query}`),
  patchReport: (id: string, body: unknown) => b.send(report.PATCH, `/api/admin/qb/reports/${id}`, { method: "PATCH", body }, qid(id)),
  corrections: (query = "") => b.send(corrections.GET, `/api/admin/qb/corrections${query}`),
  postCorrection: (body: unknown) => b.send(corrections.POST, "/api/admin/qb/corrections", { body }),
  members: () => b.send(members.GET, "/api/admin/qb/members"),
  putMember: (userId: string, body: unknown) => b.send(member.PUT, `/api/admin/qb/members/${userId}`, { method: "PUT", body }, params({ userId })),
  settings: () => b.send(settings.GET, "/api/admin/qb/settings"),
  putSettings: (body: unknown, options = {}) => b.send(settings.PUT, "/api/admin/qb/settings", { method: "PUT", body, ...options }),
};

/** A multipart request for the figure upload (TestBrowser only sends JSON bodies). */
function figureUpload(parts: { file?: Blob; filename?: string } = {}, headers: Record<string, string> = {}) {
  const form = new FormData();
  if (parts.file) form.set("file", parts.file, parts.filename ?? "figure.png");
  const encoded = new Response(form);
  return encoded.arrayBuffer().then(
    (buffer) =>
      new NextRequest("http://localhost:3000/api/admin/qb/figures", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": encoded.headers.get("content-type") ?? "", ...headers },
        body: buffer,
      }),
  );
}

async function json(response: Response) {
  return (await response.json()) as { ok: boolean; data?: unknown; error?: string; message?: string; code?: string; fieldErrors?: Record<string, string[]> };
}

function audit() {
  return listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action.startsWith("qb."));
}

const conflict = (code: string) => ({ ok: false as const, error: "conflict" as const, message: "Refused.", code });

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetQbAdminRateLimitersForTests();
  vi.clearAllMocks();
  state.viewer = null;
  state.mustChangePassword = false;
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------------------------

describe("same-origin, sign-in and the password gate", () => {
  /** Every state-changing endpoint once, with a harmless body. */
  const writes = (origin: string | null) => {
    const o = { origin };
    return [
      send.createQuestion(NEW_QUESTION, o),
      b.send(question.PATCH, "/api/admin/qb/questions/q_abc", { method: "PATCH", body: { baseVersion: 1, baseUpdatedAt: 1, chapterId: null }, ...o }, qid("q_abc")),
      send.action("q_abc", { action: "submit" }, o),
      send.bulk({ action: "start", ids: ["q_1"] }, o),
      b.send(bulkLabels.POST, "/api/admin/qb/questions/bulk-labels", { body: { action: "cancel", op: "confirm_syllabus", batchId: "batch_1" }, ...o }),
      b.send(chapters.POST, "/api/admin/qb/chapters", { body: {}, ...o }),
      b.send(chapter.PATCH, "/api/admin/qb/chapters/phy-units", { method: "PATCH", body: { sort: 1 }, ...o }, qid("phy-units")),
      b.send(units.POST, "/api/admin/qb/units", { body: {}, ...o }),
      send.confirm("JEE_MAIN", { confirm: true, syllabusRevisionYear: 2024 }, o),
      b.send(blueprints.POST, "/api/admin/qb/blueprints", { body: { slot: "jee-main" }, ...o }),
      b.send(blueprintById.PATCH, "/api/admin/qb/blueprints/bp_1", { method: "PATCH", body: {}, ...o }, qid("bp_1")),
      send.blueprintAction("bp_1", { action: "publish" }, o),
      b.send(decide.POST, "/api/admin/qb/duplicates/decide", { body: { a: "q_a", b: "q_b", decision: "distinct" }, ...o }),
      b.send(report.PATCH, "/api/admin/qb/reports/7", { method: "PATCH", body: { status: "resolved" }, ...o }, qid("7")),
      b.send(corrections.POST, "/api/admin/qb/corrections", { body: {}, ...o }),
      b.send(member.PUT, "/api/admin/qb/members/u_staff", { method: "PUT", body: {}, ...o }, params({ userId: "u_staff" })),
      send.putSettings({ importEnabled: true }, o),
    ];
  };

  it("refuses every write from another origin (403) before checking the session or calling a service", async () => {
    as(ADMIN);
    for (const origin of ["https://evil.example", "null"]) {
      const responses = await Promise.all(writes(origin));
      for (const response of responses) expect(response.status, response.url).toBe(403);
    }
    expect(services.guardQbApi).not.toHaveBeenCalled();
    expect(services.ensureSeeded).not.toHaveBeenCalled();
    expect(audit()).toEqual([]);
  });

  it("figures: a cross-origin upload is refused too", async () => {
    as(ADMIN);
    const response = await figures.POST(await figureUpload({ file: new Blob([PNG], { type: "image/png" }) }, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(services.saveFigure).not.toHaveBeenCalled();
  });

  it("passes the guard's own answer through: 401 signed out, 409 while a temporary password is pending", async () => {
    as(null);
    expect((await send.listQuestions()).status).toBe(401);
    expect((await send.createQuestion(NEW_QUESTION)).status).toBe(401);
    as(AUTHOR);
    state.mustChangePassword = true;
    expect((await send.listQuestions()).status).toBe(409);
    expect(services.listQuestions).not.toHaveBeenCalled();
  });

  it("seeds before any service runs", async () => {
    as(AUTHOR);
    await send.listQuestions();
    const seeded = vi.mocked(services.ensureSeeded).mock.invocationCallOrder[0];
    const listed = vi.mocked(services.listQuestions).mock.invocationCallOrder[0];
    expect(seeded).toBeLessThan(listed);
  });

  it("every response is private: no-store and noindex", async () => {
    as(AUTHOR);
    const response = await send.listQuestions();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });
});

describe("capabilities (§B6 matrix)", () => {
  /** [label, request, capability the route must ask requireQbApi for]. */
  const direct: [string, () => Promise<Response>, string][] = [
    ["list questions", () => send.listQuestions(), "view"],
    ["create question", () => send.createQuestion(NEW_QUESTION), "edit_draft"],
    ["read question", () => send.getQuestion("q_abc"), "view"],
    ["edit question", () => send.patchQuestion("q_abc", { baseVersion: 1, baseUpdatedAt: 1, chapterId: "phy-units" }), "edit_draft"],
    ["bulk approve", () => send.bulk({ action: "start", ids: ["q_1"] }), "approve"],
    ["bulk labels", () => send.bulkLabels({ action: "start", op: "accept_ai_labels", exam: "JEE_MAIN", ids: ["q_1"] }), "set_labels"],
    ["units", () => send.units("?exam=JEE_MAIN"), "view"],
    ["chapters", () => send.chapters(), "view"],
    ["chapter edit", () => send.patchChapter("phy-units", { sort: 3 }), "manage_chapters"],
    ["taxonomy confirm", () => send.confirm("JEE_MAIN", { confirm: true, syllabusRevisionYear: 2024 }), "confirm_taxonomy"],
    ["blueprints", () => send.blueprints(), "view"],
    ["new blueprint", () => send.postBlueprint({ slot: "neet-ug" }), "edit_blueprint"],
    ["readiness", () => send.readiness("bp_1"), "view"],
    ["preview", () => send.preview("bp_1", "?seed=abc"), "view"],
    ["coverage", () => send.coverage("?exam=NEET"), "view"],
    ["duplicates", () => send.duplicates(), "view"],
    ["decide duplicate", () => send.decide({ a: "q_a", b: "q_b", decision: "variant" }), "merge_duplicates"],
    ["reports", () => send.reports(), "view"],
    ["close report", () => send.patchReport("7", { status: "dismissed" }), "approve"],
    ["corrections", () => send.corrections(), "view"],
    ["members", () => send.members(), "manage_team"],
    ["member", () => send.putMember("u_staff", { qbRole: "author", subjects: [], active: true }), "manage_team"],
    ["settings read", () => send.settings(), "manage_settings"],
    ["settings write", () => send.putSettings({ importEnabled: true }), "manage_settings"],
  ];

  it.each(direct)("%s asks requireQbApi for its capability", async (_label, request, capability) => {
    as(ADMIN);
    const response = await request();
    expect(response.status).toBeLessThan(300);
    expect(vi.mocked(services.guardQbApi).mock.calls[0][1]).toBe(capability);
  });

  it("authors read and write drafts but cannot approve, publish, merge, correct keys or manage the team", async () => {
    as(AUTHOR);
    expect((await send.listQuestions()).status).toBe(200);
    expect((await send.createQuestion(NEW_QUESTION)).status).toBe(201);
    expect((await send.action("q_abc", { action: "submit" })).status).toBe(200);
    expect((await send.action("q_abc", { action: "approve", checklist: CHECKLIST })).status).toBe(403);
    expect((await send.action("q_abc", { action: "retire", reason: "Out of syllabus" })).status).toBe(403);
    expect((await send.action("q_abc", { action: "accept_calibration", exam: "NEET" })).status).toBe(403);
    expect((await send.bulk({ action: "start", ids: ["q_1"] })).status).toBe(403);
    expect((await send.blueprintAction("bp_1", { action: "new_version" })).status).toBe(403);
    expect((await send.decide({ a: "q_a", b: "q_b", decision: "duplicate" })).status).toBe(403);
    expect((await send.members()).status).toBe(403);
    expect(vi.mocked(services.questionAction).mock.calls.map((call) => call[2].action)).toEqual(["submit"]);
    expect(services.bulkStart).not.toHaveBeenCalled();
  });

  it("reviewers approve and version blueprints but cannot publish, confirm patterns or taxonomy, or change settings", async () => {
    as(REVIEWER);
    expect((await send.action("q_abc", { action: "approve", checklist: CHECKLIST })).status).toBe(200);
    expect((await send.blueprintAction("bp_1", { action: "new_version" })).status).toBe(200);
    for (const action of ["publish", "archive", "confirm_pattern"]) {
      expect((await send.blueprintAction("bp_1", { action, note: "Checked against the official notice." })).status, action).toBe(403);
    }
    expect((await send.blueprintAction("bp_1", { action: "signoff", label: bi("Pattern reviewed by Aspire faculty") })).status).toBe(403);
    expect((await send.confirm("NEET", { confirm: true, syllabusRevisionYear: 2024 })).status).toBe(403);
    expect((await send.putSettings({ importEnabled: true })).status).toBe(403);
    expect(vi.mocked(services.blueprintAction).mock.calls.map((call) => call[2].action)).toEqual(["new_version"]);
    expect(services.updateSettings).not.toHaveBeenCalled();
  });

  it("only an admin may clear a coaching-site (third-party) mark, with the official URL, and it is audited", async () => {
    const body = { action: "clear_flag", flag: "third_party_source", note: "Downloaded from NTA", officialUrl: "https://jeemain.nta.nic.in/papers/x.pdf" };
    as(REVIEWER);
    expect((await send.action("q_abc", body)).status).toBe(403);
    expect(services.questionAction).not.toHaveBeenCalled();
    as(ADMIN);
    expect((await send.action("q_abc", { ...body, officialUrl: undefined })).status).toBe(422);
    expect((await send.action("q_abc", body)).status).toBe(200);
    const [entry] = audit();
    expect(entry).toMatchObject({ action: "qb.third_party_override", actorId: "u_admin", target: "q_abc" });
    expect(entry.details.officialUrl).toBe(body.officialUrl);
  });

  it("passes the viewer and the parsed body to the service", async () => {
    as(AUTHOR);
    await send.createQuestion(NEW_QUESTION);
    const [viewer, input] = vi.mocked(services.createQuestion).mock.calls[0];
    expect(viewer).toEqual(AUTHOR);
    expect(input).toEqual(NEW_QUESTION);
  });

  it("drops the server-owned import id, and an author's cross-exam and syllabus labels", async () => {
    const exams = [{ exam: "JEE_MAIN", eligible: true, difficulty: "easy", crossExam: true, syllabus: "current" }];
    as(AUTHOR);
    expect((await send.createQuestion({ ...NEW_QUESTION, source: { kind: "official", exam: "JEE_MAIN", year: 2024, importId: "imp_forged" }, exams })).status).toBe(201);
    const [, input] = vi.mocked(services.createQuestion).mock.calls[0];
    expect(input.source).toEqual({ kind: "official", exam: "JEE_MAIN", year: 2024 });
    expect(input.exams).toEqual([{ exam: "JEE_MAIN", eligible: true, difficulty: "easy" }]);
    as(REVIEWER);
    await send.createQuestion({ ...NEW_QUESTION, exams });
    expect(vi.mocked(services.createQuestion).mock.calls[1][1].exams).toEqual(exams);
  });

  it("an official evidence link must be on the issuer's own site", async () => {
    as(REVIEWER);
    const source = (evidenceUrl: string) => ({ kind: "official", exam: "JEE_MAIN", year: 2024, evidenceUrl, evidencePage: 2 });
    expect((await send.createQuestion({ ...NEW_QUESTION, source: source("https://coaching.example.com/jee.pdf") })).status).toBe(422);
    expect((await send.createQuestion({ ...NEW_QUESTION, source: source("https://nta.ac.in.example.com/jee.pdf") })).status).toBe(422);
    expect(services.createQuestion).not.toHaveBeenCalled();
    expect((await send.createQuestion({ ...NEW_QUESTION, source: source("https://jeemain.nta.nic.in/jee.pdf") })).status).toBe(201);
  });

  it("clearing a flag is a reviewer's step and needs a note", async () => {
    as(AUTHOR);
    expect((await send.action("q_abc", { action: "clear_flag", flag: "low_confidence", note: "Looked again." })).status).toBe(403);
    as(REVIEWER);
    expect((await send.action("q_abc", { action: "clear_flag", flag: "low_confidence" })).status).toBe(422);
    expect((await send.action("q_abc", { action: "clear_flag", flag: "low_confidence", note: " " })).status).toBe(422);
    expect(services.questionAction).not.toHaveBeenCalled();
    expect((await send.action("q_abc", { action: "clear_flag", flag: "low_confidence", note: "Compared with the page." })).status).toBe(200);
  });
});

describe("validation and limits", () => {
  beforeEach(() => as(ADMIN));

  it("rejects malformed question bodies with 422 field errors and never calls the service", async () => {
    const cases: unknown[] = [
      { ...NEW_QUESTION, content: { ...CONTENT, type: "numerical" } }, // options on a numerical question
      { ...NEW_QUESTION, content: { ...CONTENT, options: [bi("only one")] } },
      { ...NEW_QUESTION, content: { ...CONTENT, answer: { kind: "single", index: 4 } } },
      { ...NEW_QUESTION, content: { ...CONTENT, stem: bi("x".repeat(8001)) } },
      { ...NEW_QUESTION, source: { kind: "sample" } }, // samples are seeded only
      { ...NEW_QUESTION, source: { kind: "official", exam: "JEE_MAIN", evidenceUrl: "http://example.com" } },
      { ...NEW_QUESTION, chapterId: null },
      { ...NEW_QUESTION, exams: [NEW_QUESTION.exams[0], NEW_QUESTION.exams[0]] },
      { ...NEW_QUESTION, extra: true },
    ];
    for (const body of cases) {
      const response = await send.createQuestion(body);
      expect(response.status, JSON.stringify(body).slice(0, 120)).toBe(422);
      expect((await json(response)).fieldErrors).toBeDefined();
    }
    expect(services.createQuestion).not.toHaveBeenCalled();
  });

  it("numerical answers: integer flag, ranges and units", async () => {
    const numerical = (answer: unknown) => ({ ...NEW_QUESTION, content: { ...CONTENT, type: "numerical", options: [], answer } });
    expect((await send.createQuestion(numerical({ kind: "numerical", value: 2.5, integer: true }))).status).toBe(422);
    expect((await send.createQuestion(numerical({ kind: "numerical", value: 2.3, low: 2.35, high: 2.3, integer: false }))).status).toBe(422);
    expect((await send.createQuestion(numerical({ kind: "numerical", value: 2.32, low: 2.3, high: 2.35, integer: false, unit: bi("m/s", "मी/से") }))).status).toBe(201);
    expect((await send.createQuestion(numerical({ kind: "numerical", value: -3, integer: true }))).status).toBe(201);
  });

  it("caps JSON bodies at 64 KB (413) and wants JSON (415)", async () => {
    const big = JSON.stringify({ ...NEW_QUESTION, pad: "x".repeat(65 * 1024) });
    expect((await send.createQuestion(big)).status).toBe(413);
    expect((await send.createQuestion(JSON.stringify(NEW_QUESTION), { contentType: "text/plain" })).status).toBe(415);
    expect((await send.createQuestion("{not json")).status).toBe(400);
    // Just under the cap is read and validated normally.
    const near = { ...NEW_QUESTION, content: { ...CONTENT, solution: bi("y".repeat(7000), "य".repeat(7000)) } };
    expect((await send.createQuestion(near)).status).toBe(201);
  });

  it("checks ids before calling a service (400)", async () => {
    expect((await send.getQuestion("bad id!")).status).toBe(400);
    expect((await send.getQuestion("q_abc", "?spotCheck=../x")).status).toBe(400);
    expect((await send.patchReport("abc", { status: "resolved" })).status).toBe(400);
    expect((await send.figure("not-a-hash")).status).toBe(400);
    expect((await send.confirm("CBSE", { confirm: true, syllabusRevisionYear: 2024 })).status).toBe(400);
    expect((await send.units("?exam=CBSE")).status).toBe(400);
    expect((await send.coverage()).status).toBe(400);
    expect((await send.preview("bp_1", "?seed=has space")).status).toBe(400);
    expect((await send.duplicates("?page=0")).status).toBe(400);
    expect(services.getQuestion).not.toHaveBeenCalled();
  });

  it("maps service results: 404, 403, 422 with field errors and 409 with a stable code", async () => {
    vi.mocked(services.getQuestion).mockResolvedValueOnce({ ok: false, error: "not_found", message: "No such question." });
    expect((await send.getQuestion("q_missing")).status).toBe(404);
    vi.mocked(services.updateQuestion).mockResolvedValueOnce({ ok: false, error: "forbidden", message: "Outside your subjects." });
    expect((await send.patchQuestion("q_abc", { baseVersion: 1, baseUpdatedAt: 1, chapterId: "chem-mole" })).status).toBe(403);
    vi.mocked(services.updateQuestion).mockResolvedValueOnce({ ok: false, error: "validation", message: "Bad math.", fieldErrors: { "content.stem": ["Math does not render."] } });
    const invalid = await send.patchQuestion("q_abc", { baseVersion: 1, baseUpdatedAt: 1, chapterId: "chem-mole" });
    expect(invalid.status).toBe(422);
    expect((await json(invalid)).fieldErrors).toEqual({ "content.stem": ["Math does not render."] });
    vi.mocked(services.updateQuestion).mockResolvedValueOnce(conflict("stale"));
    const stale = await send.patchQuestion("q_abc", { baseVersion: 1, baseUpdatedAt: 1, chapterId: "chem-mole" });
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({ ok: false, code: "stale" });
  });

  it("a thrown service error is a generic 500 without internals", async () => {
    vi.mocked(services.listQuestions).mockRejectedValueOnce(new Error("SQLITE_BUSY: database is locked at /opt/data"));
    const response = await send.listQuestions();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await json(response))).not.toContain("SQLITE");
  });

  it("question filters reach the service parsed, unknown values dropped", async () => {
    await send.listQuestions("?status=open&subject=physics&exam=NEET&difficulty=hard&flag=figure_needed&queue=flagged&q=projectile&page=2&bogus=1&subject2=x");
    const [, filters] = vi.mocked(services.listQuestions).mock.calls[0];
    expect(filters).toEqual({
      status: "open",
      subject: "physics",
      exam: "NEET",
      difficulty: "hard",
      flag: "figure_needed",
      queue: "flagged",
      q: "projectile",
      sort: "updated_desc",
      page: 2,
      pageSize: 25,
    });
  });

  it("rate-limits the heavy preview routes per user (429 with Retry-After)", async () => {
    for (let i = 0; i < 30; i += 1) expect((await send.previewStats("bp_1")).status).toBe(200);
    const limited = await send.previewStats("bp_1");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("questions: actions and spot-check plumbing", () => {
  it("approve needs the full checklist; reasons are required for reject / retire / suspend", async () => {
    as(REVIEWER);
    expect((await send.action("q_abc", { action: "approve" })).status).toBe(422);
    expect((await send.action("q_abc", { action: "approve", checklist: { ...CHECKLIST, licence: undefined } })).status).toBe(422);
    expect((await send.action("q_abc", { action: "reject", reason: "" })).status).toBe(422);
    expect((await send.action("q_abc", { action: "retire" })).status).toBe(422);
    expect((await send.action("q_abc", { action: "set_fidelity", fidelity: "adapted" })).status).toBe(422);
    expect((await send.action("q_abc", { action: "set_fidelity", fidelity: "adapted", note: bi("Numbers changed") })).status).toBe(200);
    expect((await send.action("q_abc", { action: "fly" })).status).toBe(422);
    vi.mocked(services.questionAction).mockResolvedValueOnce(conflict("blocking_flags"));
    const blocked = await send.action("q_abc", { action: "approve", checklist: CHECKLIST });
    expect(blocked.status).toBe(409);
    expect((await json(blocked)).code).toBe("blocking_flags");
  });

  it("opening a sampled item forwards the batch id (the service returns the one-time token)", async () => {
    as(REVIEWER);
    await send.getQuestion("q_1", "?spotCheck=batch_1");
    expect(vi.mocked(services.getQuestion).mock.calls[0].slice(1)).toEqual(["q_1", { spotCheckBatchId: "batch_1" }]);
    await send.getQuestion("q_2");
    expect(vi.mocked(services.getQuestion).mock.calls[1].slice(1)).toEqual(["q_2", {}]);
  });

  it("bulk approval: at most 200 distinct ids, start → commit with checks, conflicts keep their code", async () => {
    as(REVIEWER);
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `q_${i}`);
    expect((await send.bulk({ action: "start", ids: ids(201) })).status).toBe(422);
    expect((await send.bulk({ action: "start", ids: ["q_1", "q_1"] })).status).toBe(422);
    expect((await send.bulk({ action: "start", ids: [] })).status).toBe(422);
    expect((await send.bulk({ action: "start", ids: ids(200) })).status).toBe(200);
    expect(vi.mocked(services.bulkStart).mock.calls[0][1]).toEqual({ op: "approve", ids: ids(200), exam: null });

    // Commit needs checks with tokens; more than 10 checks or a malformed token is refused unread.
    expect((await send.bulk({ action: "commit", batchId: "batch_1", checks: [] })).status).toBe(422);
    expect((await send.bulk({ action: "commit", batchId: "batch_1", checks: [{ id: "q_1", token: "short", ok: true }] })).status).toBe(422);
    const eleven = ids(11).map((id) => ({ id, token: TOKEN, ok: true }));
    expect((await send.bulk({ action: "commit", batchId: "batch_1", checks: eleven })).status).toBe(422);

    vi.mocked(services.bulkCommit).mockResolvedValueOnce(conflict("spot_check_incomplete"));
    const incomplete = await send.bulk({ action: "commit", batchId: "batch_1", checks: [{ id: "q_1", token: TOKEN, ok: true }] });
    expect(incomplete.status).toBe(409);
    expect((await json(incomplete)).code).toBe("spot_check_incomplete");
    expect(audit()).toEqual([]);

    vi.mocked(services.bulkCommit).mockResolvedValueOnce({
      ok: true,
      data: { outcome: "done", op: "approve", count: 40, ids: ids(40), sample: ["q_3", "q_17", "q_29"] },
    });
    const done = await send.bulk({ action: "commit", batchId: "batch_1", checks: [{ id: "q_3", token: TOKEN, ok: true }] });
    expect(done.status).toBe(200);
    expect(vi.mocked(services.bulkCommit).mock.calls.at(-1)?.[1]).toEqual({
      op: "approve",
      batchId: "batch_1",
      checks: [{ id: "q_3", token: TOKEN, ok: true }],
    });
    const [entry] = audit();
    expect(entry).toMatchObject({ action: "qb.bulk_approve", actorId: "u_reviewer", target: "batch_1" });
    expect(entry.details).toEqual({ count: 40, sampleSize: 3, sample: "q_3,q_17,q_29" });
  });

  it("a failed spot check aborts the batch and is audited as aborted", async () => {
    as(REVIEWER);
    vi.mocked(services.bulkCommit).mockResolvedValueOnce({ ok: true, data: { outcome: "aborted", op: "approve", failedId: "q_17", sample: ["q_3", "q_17"] } });
    const response = await send.bulk({ action: "commit", batchId: "batch_9", checks: [{ id: "q_17", token: TOKEN, ok: false }] });
    expect(response.status).toBe(200);
    expect((await json(response)).data).toMatchObject({ outcome: "aborted", failedId: "q_17" });
    expect(audit()[0]).toMatchObject({ action: "qb.bulk_aborted", target: "batch_9", details: { op: "approve", failedId: "q_17" } });
  });

  it("bulk labels name the exam and the op; commits are audited", async () => {
    as(REVIEWER);
    expect((await send.bulkLabels({ action: "start", op: "accept_ai_labels", ids: ["q_1"] })).status).toBe(422);
    expect((await send.bulkLabels({ action: "start", op: "rename", exam: "NEET", ids: ["q_1"] })).status).toBe(422);
    expect((await send.bulkLabels({ action: "start", op: "confirm_syllabus", exam: "NEET", ids: ["q_1"] })).status).toBe(200);
    expect(vi.mocked(services.bulkStart).mock.calls[0][1]).toEqual({ op: "confirm_syllabus", ids: ["q_1"], exam: "NEET" });
    vi.mocked(services.bulkCommit).mockResolvedValueOnce({ ok: true, data: { outcome: "done", op: "confirm_syllabus", count: 12, ids: [], sample: ["q_1"] } });
    await send.bulkLabels({ action: "commit", op: "confirm_syllabus", batchId: "batch_2", checks: [{ id: "q_1", token: TOKEN, ok: true }] });
    expect(audit()[0]).toMatchObject({ action: "qb.bulk_labels", details: { op: "confirm_syllabus", count: 12 } });
  });
});

describe("taxonomy gate and blueprints", () => {
  it("confirming a taxonomy is admin-only, needs the tick and a revision year, and is audited", async () => {
    as(ADMIN);
    expect((await send.confirm("JEE_MAIN", { syllabusRevisionYear: 2024 })).status).toBe(422);
    expect((await send.confirm("JEE_MAIN", { confirm: true, syllabusRevisionYear: 1990 })).status).toBe(422);
    const response = await send.confirm("JEE_MAIN", { confirm: true, syllabusRevisionYear: 2024, note: "Checked against the NTA syllabus PDF" });
    expect(response.status).toBe(200);
    expect(vi.mocked(services.confirmTaxonomy).mock.calls[0].slice(1, 3)).toEqual([
      "JEE_MAIN",
      { syllabusRevisionYear: 2024, note: "Checked against the NTA syllabus PDF" },
    ]);
    expect(audit()[0]).toMatchObject({ action: "qb.taxonomy_confirm", actorId: "u_admin", target: "JEE_MAIN", details: { exam: "JEE_MAIN", syllabusRevisionYear: 2024 } });
  });

  it("publishing is refused (409) for the placeholder BOH and for an unconfirmed taxonomy; nothing is audited", async () => {
    as(ADMIN);
    for (const code of ["placeholder_blueprint", "taxonomy_unconfirmed", "pattern_unconfirmed", "blueprint_invalid"]) {
      vi.mocked(services.blueprintAction).mockResolvedValueOnce(conflict(code));
      const response = await send.blueprintAction("bp_boh_1", { action: "publish" });
      expect(response.status).toBe(409);
      expect((await json(response)).code).toBe(code);
    }
    expect(audit()).toEqual([]);
  });

  it("publish, archive, pattern confirmation and sign-off are audited with slot and version", async () => {
    as(ADMIN);
    const actions = [
      ["publish", {}, "qb.blueprint_publish"],
      ["archive", {}, "qb.blueprint_archive"],
      ["confirm_pattern", { note: "BOH pattern confirmed by the director" }, "qb.pattern_confirm"],
      ["signoff", { label: bi("Pattern reviewed by Aspire faculty", "पैटर्न की समीक्षा Aspire फ़ैकल्टी ने की") }, "qb.blueprint_signoff"],
      ["new_version", {}, "qb.blueprint_new_version"],
    ] as const;
    for (const [action, extra] of actions) expect((await send.blueprintAction("bp_jee_main_2", { action, ...extra })).status).toBe(200);
    const entries = audit().reverse();
    expect(entries.map((entry) => entry.action)).toEqual(actions.map((row) => row[2]));
    expect(entries[0]).toMatchObject({ target: "bp_jee_main_2", details: { slot: "jee-main", version: 2, status: "published", from: "bp_jee_main_2" } });
  });

  it("pattern confirmation needs a note saying how it was confirmed", async () => {
    as(ADMIN);
    expect((await send.blueprintAction("bp_1", { action: "confirm_pattern" })).status).toBe(422);
    expect((await send.blueprintAction("bp_1", { action: "confirm_pattern", note: "  " })).status).toBe(422);
    expect(services.blueprintAction).not.toHaveBeenCalled();
  });

  it("sign-off needs public wording", async () => {
    as(ADMIN);
    expect((await send.blueprintAction("bp_1", { action: "signoff" })).status).toBe(422);
    expect((await send.blueprintAction("bp_1", { action: "signoff", label: bi("  ") })).status).toBe(422);
  });

  it("saving a draft validates the definition and drops protected fields", async () => {
    as(REVIEWER);
    const definition = {
      // Protected: ignored by the schema (they change through actions only).
      id: "bp_other",
      status: "published",
      placeholder: false,
      patternConfirmedBy: "u_reviewer",
      signoff: { label: bi("x"), at: 1 },
      title: bi("JEE Main exam-pattern mock"),
      summary: bi("75 questions, 3 hours"),
      parts: [
        {
          id: "p1",
          label: bi("Paper 1"),
          durationMinutes: 180,
          sections: [
            {
              id: "maths-a",
              subject: "maths",
              label: bi("Mathematics · Section A"),
              type: "single",
              count: 20,
              marking: { correct: 4, wrong: -1 },
              instructions: bi("Single correct."),
            },
          ],
        },
      ],
      difficultyMix: { easy: 30, medium: 50, hard: 20 },
      chapterLevels: ["class_11", "class_12"],
      chapterWeights: { mode: "past_papers", fromYear: 2024, fallbackYears: 10, halfLifeYears: 3, overrides: {} },
      sourcePolicy: { official: true, aspire: true, sample: "placeholder_only", officialMaxShare: null },
      crossExamMaxShare: 0.2,
      minShortRatio: 0.5,
      recentExclusionDays: 30,
      ranked: "monthly",
      languages: ["en", "hi"],
      compensatoryMinutes: 60,
      tieBreak: [{ by: "subject_score", subject: "maths" }],
      pattern: { year: 2026, sourceUrls: ["https://nta.ac.in/bulletin.pdf"], verifiedAt: "2026-10-22", reviewDueAt: "2026-11-15", note: bi("As per the 2026 bulletin") },
    };
    expect((await send.saveBlueprint("bp_1", { definition, baseUpdatedAt: 5 })).status).toBe(200);
    const saved = vi.mocked(services.saveBlueprint).mock.calls[0][2].definition as Record<string, unknown>;
    for (const key of ["id", "status", "placeholder", "patternConfirmedBy", "signoff"]) expect(saved).not.toHaveProperty(key);
    expect(saved.difficultyMix).toEqual({ easy: 30, medium: 50, hard: 20 });

    const badMix = { ...definition, difficultyMix: { easy: 30, medium: 50, hard: 30 } };
    expect((await send.saveBlueprint("bp_1", { definition: badMix, baseUpdatedAt: 5 })).status).toBe(422);
    const badMarking = { ...definition, parts: [{ ...definition.parts[0], sections: [{ ...definition.parts[0].sections[0], marking: { correct: 4, wrong: 1 } }] }] };
    expect((await send.saveBlueprint("bp_1", { definition: badMarking, baseUpdatedAt: 5 })).status).toBe(422);
    expect(vi.mocked(services.saveBlueprint)).toHaveBeenCalledTimes(1);
  });

  it("new drafts take a known slot; readiness and preview pass the language and a reproducible seed", async () => {
    as(REVIEWER);
    expect((await send.postBlueprint({ slot: "cbse-10" })).status).toBe(422);
    expect((await send.postBlueprint({ slot: "boh-class-10" })).status).toBe(201);
    await send.readiness("bp_1", "?language=hi");
    expect(vi.mocked(services.blueprintReadiness).mock.calls[0][2]).toEqual({ language: "hi" });
    await send.preview("bp_1", "?seed=fixed-seed&language=en");
    expect(vi.mocked(services.blueprintPreview).mock.calls[0][2]).toEqual({ seed: "fixed-seed", language: "en" });
    await send.preview("bp_1");
    const randomSeed = vi.mocked(services.blueprintPreview).mock.calls[1][2].seed;
    expect(randomSeed).toMatch(/^[A-Za-z0-9_-]{8,}$/);
  });

  it("units must cite an official source; unit edits are admin-only and audited", async () => {
    const unit = {
      exam: "JEE_MAIN",
      syllabusYear: 2026,
      subject: "physics",
      label: bi("Units and measurements"),
      sourceUrl: "https://jeemain.nta.nic.in/syllabus.pdf",
      sourceRef: "Physics, Unit 1",
      status: "current",
      sort: 1,
    };
    as(REVIEWER);
    expect((await send.postUnit(unit)).status).toBe(403);
    as(ADMIN);
    expect((await send.postUnit({ ...unit, sourceUrl: "https://www.coaching-site.example/jee-syllabus" })).status).toBe(422);
    expect((await send.postUnit(unit)).status).toBe(201);
    expect(audit()[0]).toMatchObject({ action: "qb.unit_upsert", details: { exam: "JEE_MAIN", syllabusYear: 2026, created: true } });
  });

  it("chapters: slugs, levels and per-exam maps are validated", async () => {
    as(REVIEWER);
    const chapterBody = { id: "chem-p-block", subject: "chemistry", level: "class_12", label: bi("p-Block elements"), units: { NEET: ["NEET:2026:chemistry:08"] }, examStatus: { NEET: "current" }, sort: 40, active: true };
    expect((await send.postChapter({ ...chapterBody, id: "Chem P Block" })).status).toBe(422);
    expect((await send.postChapter({ ...chapterBody, examStatus: { CBSE: "current" } })).status).toBe(422);
    expect((await send.postChapter(chapterBody)).status).toBe(201);
    expect((await send.patchChapter("chem-p-block", {})).status).toBe(422);
    expect((await send.patchChapter("chem-p-block", { subject: "botany" })).status).toBe(200);
    await send.chapters("?exam=NEET&subject=chemistry&all=true");
    expect(vi.mocked(services.listChapters).mock.calls[0][1]).toEqual({ exam: "NEET", subject: "chemistry", includeInactive: true });
  });
});

describe("corrections, duplicates, reports, team and settings", () => {
  it("key corrections need a matching answer, a reason and an https evidence link; audited with the re-score count", async () => {
    as(REVIEWER);
    const base = { questionId: "q_abc", appliesToVersion: 2, reason: "NTA final key revised" };
    expect((await send.postCorrection({ ...base, kind: "answer" })).status).toBe(422);
    expect((await send.postCorrection({ ...base, kind: "dropped", answer: { kind: "single", index: 1 } })).status).toBe(422);
    expect((await send.postCorrection({ ...base, kind: "dropped", evidenceUrl: "ftp://x" })).status).toBe(422);
    const response = await send.postCorrection({ ...base, kind: "answer", answer: { kind: "single", index: 2 }, evidenceUrl: "https://nta.ac.in/key.pdf" });
    expect(response.status).toBe(201);
    expect(audit()[0]).toMatchObject({
      action: "qb.key_correction",
      target: "q_abc",
      details: { kind: "answer", appliesToVersion: 2, correctionId: 3, rescoredAttempts: 2 },
    });
  });

  it("duplicate decisions need two different questions and keep one of the pair", async () => {
    as(REVIEWER);
    expect((await send.decide({ a: "q_a", b: "q_a", decision: "distinct" })).status).toBe(422);
    expect((await send.decide({ a: "q_a", b: "q_b", decision: "duplicate", keep: "q_c" })).status).toBe(422);
    expect((await send.decide({ a: "q_a", b: "q_b", decision: "merge" })).status).toBe(422);
    expect((await send.decide({ a: "q_a", b: "q_b", decision: "duplicate", keep: "q_a" })).status).toBe(200);
  });

  it("reports: open by default; closing needs resolved or dismissed", async () => {
    as(REVIEWER);
    await send.reports("?status=bogus");
    expect(vi.mocked(services.listReports).mock.calls[0][1]).toEqual({ status: "open", page: 1, pageSize: 25 });
    expect((await send.patchReport("7", { status: "open" })).status).toBe(422);
    expect((await send.patchReport("7", { status: "resolved", note: "Key fixed" })).status).toBe(200);
    expect(vi.mocked(services.updateReport).mock.calls[0].slice(1, 3)).toEqual([7, { status: "resolved", note: "Key fixed" }]);
  });

  it("memberships: author or reviewer only, subjects once each; audited without names", async () => {
    as(ADMIN);
    expect((await send.putMember("u_staff", { qbRole: "admin", subjects: [], active: true })).status).toBe(422);
    expect((await send.putMember("u_staff", { qbRole: "author", subjects: ["physics", "physics"], active: true })).status).toBe(422);
    expect((await send.putMember("u_staff", { qbRole: "reviewer", subjects: ["physics", "maths"], active: true })).status).toBe(200);
    expect(audit()[0]).toMatchObject({ action: "qb.member_upsert", target: "u_staff", details: { qbRole: "reviewer", subjects: "physics,maths", active: true } });
    expect(JSON.stringify(audit()[0].details)).not.toContain("Office Admin");
  });

  it("settings: only an admin reads them or turns AI import on or off (audited)", async () => {
    as(AUTHOR);
    expect((await send.settings()).status).toBe(403);
    expect((await send.putSettings({ importEnabled: true })).status).toBe(403);
    as(REVIEWER);
    expect((await send.putSettings({ importEnabled: true })).status).toBe(403);
    expect(services.updateSettings).not.toHaveBeenCalled();
    as(ADMIN);
    expect((await send.putSettings({})).status).toBe(422);
    expect((await send.putSettings({ importEnabled: "yes" })).status).toBe(422);
    expect((await send.putSettings({ importEnabled: true })).status).toBe(200);
    expect((await send.putSettings({ approvalSelf: "second_reviewer" })).status).toBe(200);
    const entries = audit().reverse();
    expect(entries.map((entry) => entry.details)).toEqual([{ importEnabled: true }, { approvalSelf: "second_reviewer" }]);
    expect(entries.every((entry) => entry.action === "qb.settings_change" && entry.actorId === "u_admin")).toBe(true);
  });
});

describe("figures", () => {
  beforeEach(() => as(AUTHOR));

  it("stores a PNG of at most 200 KB (201) and passes the bytes to the service", async () => {
    const response = await figures.POST(await figureUpload({ file: new Blob([PNG], { type: "image/png" }) }));
    expect(response.status).toBe(201);
    const [, file] = vi.mocked(services.saveFigure).mock.calls[0];
    expect([...file.bytes]).toEqual([...PNG]);
    expect(file.declaredType).toBe("image/png");
  });

  it("refuses larger files (413), SVG and other non-images by their bytes (415), empty or JSON uploads", async () => {
    const big = new Uint8Array(201 * 1024);
    big.set(PNG);
    expect((await figures.POST(await figureUpload({ file: new Blob([big], { type: "image/png" }) }))).status).toBe(413);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await figures.POST(await figureUpload({ file: new Blob([svg], { type: "image/png" }), filename: "x.png" }))).status).toBe(415);
    expect((await figures.POST(await figureUpload({}))).status).toBe(400);
    const json = new NextRequest("http://localhost:3000/api/admin/qb/figures", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: "{}",
    });
    expect((await figures.POST(json)).status).toBe(415);
    expect(services.saveFigure).not.toHaveBeenCalled();
  });

  it("refuses a declared body far above the cap without reading it", async () => {
    const request = await figureUpload({ file: new Blob([PNG], { type: "image/png" }) }, { "content-length": String(5 * 1024 * 1024) });
    expect((await figures.POST(request)).status).toBe(413);
  });

  it("serves staff figure bytes with nosniff, a locked-down CSP and no shared caching", async () => {
    const response = await send.figure("0123456789abcdef0123456789abcdef");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });
});
