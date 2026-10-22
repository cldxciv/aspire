import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/admin/qb/**` end to end (QB-ADMIN-API with the real QB-CORE-B services, QB-SEED and core
 * auth) against a fresh in-memory database per test, with real sessions in the cookie jar. Covers
 * the §B14 package 6 "done when" list where it needs the services: the membership and subject-scope
 * gates, the taxonomy gate and the BOH placeholder on publish, the spot-check enforcement of bulk
 * approval, admin-only settings, and the audit rows. Synthetic, original question text only.
 */

const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { listAudit } = await import("@/lib/db/audit");
const { createSession } = await import("@/lib/auth/sessions");
const { AUTH_COOKIE_NAME } = await import("@/lib/auth/config");
const { createTestUser, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const { resetQbAdminRateLimitersForTests } = await import("./_lib/http");
const { setFlag } = await import("@/lib/qb/repo/questions");
const { STICKY_FLAGS } = await import("@/lib/qb/question-rules");
const access = await import("@/lib/qb/access");
const { QB_REVIEWER_CLEARABLE_FLAGS, QB_ROLE_CAPABILITIES: UI_ROLE_CAPABILITIES } = await import("@/components/qb-admin/constants");
const { qbRequests } = await import("@/components/qb-admin/api");
const questions = await import("./questions/route");
const question = await import("./questions/[id]/route");
const actions = await import("./questions/[id]/actions/route");
const bulk = await import("./questions/bulk/route");
const blueprints = await import("./blueprints/route");
const blueprintActions = await import("./blueprints/[id]/actions/route");
const taxonomy = await import("./taxonomy/[exam]/confirm/route");
const members = await import("./members/[userId]/route");
const settings = await import("./settings/route");

vi.setConfig({ testTimeout: 60_000 });

type Browser = InstanceType<typeof TestBrowser>;
type Envelope<T = unknown> = { ok: boolean; data: T; error?: string; code?: string };

let ip = 0;
function as(userId: string): Browser {
  ip += 1;
  const b = new TestBrowser(cookieState, `198.18.7.${ip % 250}`);
  b.jar.set(AUTH_COOKIE_NAME, createSession(userId).token);
  return b;
}

async function body<T>(response: Response): Promise<Envelope<T>> {
  return (await response.json()) as Envelope<T>;
}

const bi = (en: string, hi = "") => ({ en, hi });

/** An original, clean hand-made draft for a chapter of `subject`. */
function draft(chapterId: string, stem: string) {
  return {
    chapterId,
    content: {
      type: "single",
      format: "standard",
      passageId: null,
      passageOrder: null,
      stem: bi(stem),
      options: [bi("2"), bi("4"), bi("6"), bi("8")],
      answer: { kind: "single", index: 1 },
      solution: bi("Count them."),
      solutionSource: "staff",
      hiSource: "none",
      figures: [],
      topics: [],
    },
    source: { kind: "aspire", aspireRef: "Synthetic integration set" },
    exams: [{ exam: "JEE_MAIN", eligible: true, difficulty: "easy", syllabus: "current" }],
  };
}

async function setup() {
  const admin = await createTestUser({ role: "admin", loginId: "qb.admin", password: "synthetic-pass-2026" });
  const reviewer = await createTestUser({ role: "staff", loginId: "qb.reviewer", password: "synthetic-pass-2026" });
  const author = await createTestUser({ role: "staff", loginId: "qb.author", password: "synthetic-pass-2026" });
  const outsider = await createTestUser({ role: "staff", loginId: "crm.only", password: "synthetic-pass-2026" });
  const a = as(admin.id);
  const put = (userId: string, input: unknown) => a.send(members.PUT, `/api/admin/qb/members/${userId}`, { method: "PUT", body: input }, params({ userId }));
  expect((await put(reviewer.id, { qbRole: "reviewer", subjects: [], active: true })).status).toBe(200);
  expect((await put(author.id, { qbRole: "author", subjects: ["chemistry"], active: true })).status).toBe(200);
  return { admin, reviewer, author, outsider, a, r: as(reviewer.id), au: as(author.id), o: as(outsider.id) };
}

function audit(action: string) {
  return listAudit(getDb(), { limit: 100 }).filter((entry) => entry.action === action);
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
  resetDatabaseForTests();
  resetQbAdminRateLimitersForTests();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

describe("membership, capability and subject scope", () => {
  it("staff need an active QB membership; memberships are audited", async () => {
    const { o, au, author } = await setup();
    expect((await o.send(questions.GET, "/api/admin/qb/questions")).status).toBe(403);
    expect((await au.send(questions.GET, "/api/admin/qb/questions")).status).toBe(200);
    const rows = audit("qb.member_upsert");
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.target === author.id)?.details).toMatchObject({ qbRole: "author", subjects: "chemistry", active: true });
  });

  it("an author writes drafts in their subjects only and cannot approve", async () => {
    const { au } = await setup();
    const physics = await au.send(questions.POST, "/api/admin/qb/questions", { body: draft("phy-units", "How many sides does a square have, doubled?") });
    expect(physics.status).toBe(409);
    expect((await body(physics)).code).toBe("subject_scope");
    const created = await au.send(questions.POST, "/api/admin/qb/questions", { body: draft("chem-mole", "How many hydrogen atoms are in one molecule of water, doubled?") });
    expect(created.status).toBe(201);
    const id = (await body<{ question: { id: string } }>(created)).data.question.id;
    const approve = await au.send(
      actions.POST,
      `/api/admin/qb/questions/${id}/actions`,
      { body: { action: "approve", checklist: { answer: true, transcription: true, math: true, figures: true, hindi: true, syllabus: true, licence: true } } },
      params({ id }),
    );
    expect(approve.status).toBe(403);
  });

  it("a save on top of someone else's newer save is refused with 409 stale", async () => {
    const { r } = await setup();
    const created = await r.send(questions.POST, "/api/admin/qb/questions", { body: draft("phy-units", "A synthetic stem about units.") });
    const detail = (await body<{ question: { id: string; version: number; updatedAt: number } }>(created)).data.question;
    const patch = (stem: string, baseUpdatedAt: number) =>
      r.send(question.PATCH, `/api/admin/qb/questions/${detail.id}`, { method: "PATCH", body: { baseVersion: detail.version, baseUpdatedAt, content: { ...draft("phy-units", stem).content } } }, params({ id: detail.id }));
    expect((await patch("First edit of the synthetic stem.", detail.updatedAt)).status).toBe(200);
    const stale = await patch("Second edit based on the old copy.", detail.updatedAt);
    expect(stale.status).toBe(409);
    expect((await body(stale)).code).toBe("stale");
  });
});

type QuestionView = {
  id: string;
  flags: string[];
  source: Record<string, unknown>;
  exams: { exam: string; crossExam: boolean; syllabus: string; difficulty: string | null }[];
};

async function createAs(b: Browser, input: unknown) {
  const response = await b.send(questions.POST, "/api/admin/qb/questions", { body: input });
  const envelope = await body<{ question: QuestionView }>(response);
  return { status: response.status, envelope, question: envelope.data?.question };
}

function official(source: Record<string, unknown>) {
  return { ...draft("phy-units", "A synthetic stem typed in by hand for an official-source test."), source: { kind: "official", ...source } };
}

describe("honest sources and reviewer labels (§B2, §B3, §B7)", () => {
  it("an official question cannot skip the incomplete-source check by naming an import it never came from", async () => {
    const { r } = await setup();
    const forged = await createAs(r, official({ exam: "JEE_MAIN", year: 2024, date: "2024-01-27", shift: "Shift 1", importId: "anything" }));
    expect(forged.status).toBe(201);
    expect(forged.question!.flags).toContain("source_incomplete");
    expect(forged.question!.source.importId).toBeUndefined();
  });

  it("an official evidence link must be the issuer's own site; with one (and its page) the source is complete", async () => {
    const { r } = await setup();
    const copy = await createAs(r, official({ exam: "JEE_MAIN", year: 2024, date: "2024-01-27", shift: "Shift 1", evidenceUrl: "https://coaching.example.com/jee-main-2024.pdf", evidencePage: 3 }));
    expect(copy.status).toBe(422);
    const real = await createAs(r, official({ exam: "JEE_MAIN", year: 2024, date: "2024-01-27", shift: "Shift 1", evidenceUrl: "https://jeemain.nta.nic.in/document/paper.pdf", evidencePage: 3 }));
    expect(real.status).toBe(201);
    expect(real.question!.flags).not.toContain("source_incomplete");
  });

  it("an author's cross-exam and syllabus labels are dropped; a reviewer's are kept", async () => {
    const { au, r } = await setup();
    const labelled = (chapterId: string, stem: string) => ({
      ...draft(chapterId, stem),
      exams: [{ exam: "JEE_MAIN", eligible: true, difficulty: "easy", syllabus: "current", crossExam: true }],
    });
    const byAuthor = await createAs(au, labelled("chem-mole", "A synthetic chemistry stem whose labels an author tries to set."));
    expect(byAuthor.status).toBe(201);
    expect(byAuthor.question!.exams[0]).toMatchObject({ exam: "JEE_MAIN", crossExam: false, syllabus: "unchecked", difficulty: "easy" });
    const byReviewer = await createAs(r, labelled("phy-units", "A synthetic physics stem whose labels a reviewer sets."));
    expect(byReviewer.question!.exams[0]).toMatchObject({ crossExam: true, syllabus: "current" });

    // A later author edit cannot flip them either.
    const q = byAuthor.question!;
    const loaded = await au.send(question.GET, `/api/admin/qb/questions/${q.id}`, {}, params({ id: q.id }));
    const detail = (await body<{ question: { version: number; updatedAt: number } }>(loaded)).data.question;
    const patched = await au.send(
      question.PATCH,
      `/api/admin/qb/questions/${q.id}`,
      { method: "PATCH", body: { baseVersion: detail.version, baseUpdatedAt: detail.updatedAt, exams: [{ exam: "JEE_MAIN", eligible: true, difficulty: "medium", syllabus: "current", crossExam: true }] } },
      params({ id: q.id }),
    );
    expect(patched.status).toBe(200);
    expect((await body<{ question: QuestionView }>(patched)).data.question.exams[0]).toMatchObject({ crossExam: false, syllabus: "unchecked", difficulty: "medium" });
  });
});

describe("clearing flags with the editor's own request (§B7)", () => {
  it("a reviewer clears sticky marks with a note; authors and note-less requests are refused; duplicates are decided as pairs", async () => {
    const { r, au } = await setup();
    const created = await createAs(r, draft("phy-units", "A synthetic stem an import marked for a second look."));
    const id = created.question!.id;
    for (const flag of ["source_mismatch", "low_confidence", "near_duplicate"] as const) setFlag(getDb(), id, flag, true);
    const send = (b: Browser, action: Parameters<typeof qbRequests.questionAction>[1]) => {
      const request = qbRequests.questionAction(id, action);
      return b.send(actions.POST, request.path, { method: request.method, body: request.body }, params({ id }));
    };

    expect((await send(r, { action: "clear_flag", flag: "source_mismatch" })).status).toBe(422);
    expect((await send(au, { action: "clear_flag", flag: "low_confidence", note: "Compared with the page." })).status).toBe(403);
    expect((await send(r, { action: "clear_flag", flag: "near_duplicate", note: "Not a duplicate." })).status).toBe(422);

    for (const flag of ["source_mismatch", "low_confidence"] as const) {
      const cleared = await send(r, { action: "clear_flag", flag, note: "Header and question compared with the source page." });
      expect(cleared.status, flag).toBe(200);
      expect((await body<{ question: QuestionView }>(cleared)).data.question.flags, flag).not.toContain(flag);
    }
  });

  it("the UI's clearable list is what the service clears; the UI role matrix is CORE-B's", () => {
    for (const flag of QB_REVIEWER_CLEARABLE_FLAGS) expect(STICKY_FLAGS, flag).toContain(flag);
    for (const flag of ["exact_duplicate", "near_duplicate", "third_party_source"] as const) expect(QB_REVIEWER_CLEARABLE_FLAGS).not.toContain(flag);
    for (const role of ["author", "reviewer", "admin"] as const) {
      expect([...UI_ROLE_CAPABILITIES[role]].sort(), role).toEqual([...access.QB_ROLE_CAPABILITIES[role]].sort());
    }
  });
});

describe("bulk approval spot check (§B7)", () => {
  it("refuses a commit without valid view tokens, then approves after every sampled item is opened", async () => {
    const { r } = await setup();
    const ids: string[] = [];
    for (let i = 1; i <= 4; i += 1) {
      const created = await r.send(questions.POST, "/api/admin/qb/questions", { body: draft("phy-units", `Synthetic counting question number ${i} about units.`) });
      expect(created.status).toBe(201);
      ids.push((await body<{ question: { id: string } }>(created)).data.question.id);
    }
    const start = await r.send(bulk.POST, "/api/admin/qb/questions/bulk", { body: { action: "start", ids } });
    expect(start.status).toBe(200);
    const batch = (await body<{ batchId: string; eligible: string[]; skipped: { id: string; reason: string }[]; sample: string[] }>(start)).data;
    expect(batch.eligible.length + batch.skipped.length).toBe(4);
    if (batch.eligible.length === 0) throw new Error(`nothing eligible: ${JSON.stringify(batch.skipped)}`);
    expect(batch.sample.length).toBeGreaterThan(0);

    // Forged tokens: refused, nothing approved, nothing audited.
    const forged = await r.send(bulk.POST, "/api/admin/qb/questions/bulk", {
      body: { action: "commit", batchId: batch.batchId, checks: batch.sample.map((id) => ({ id, token: "forged-token-0123456789", ok: true })) },
    });
    expect(forged.status).toBe(409);
    expect(audit("qb.bulk_approve")).toEqual([]);

    // Open every sampled item (one-time view tokens), then commit.
    const checks: { id: string; token: string; ok: boolean }[] = [];
    for (const id of batch.sample) {
      const opened = await r.send(question.GET, `/api/admin/qb/questions/${id}?spotCheck=${batch.batchId}`, {}, params({ id }));
      expect(opened.status).toBe(200);
      const token = (await body<{ spotToken: string | null }>(opened)).data.spotToken;
      expect(token).toBeTruthy();
      checks.push({ id, token: token as string, ok: true });
    }
    const commit = await r.send(bulk.POST, "/api/admin/qb/questions/bulk", { body: { action: "commit", batchId: batch.batchId, checks } });
    expect(commit.status).toBe(200);
    expect((await body<{ outcome: string; count: number }>(commit)).data).toMatchObject({ outcome: "done", count: batch.eligible.length });
    const [entry] = audit("qb.bulk_approve");
    expect(entry).toMatchObject({ target: batch.batchId, details: { count: batch.eligible.length, sampleSize: batch.sample.length } });
  });
});

describe("taxonomy gate, placeholder pattern and settings", () => {
  async function draftBlueprint(b: Browser, slot: string): Promise<string> {
    const list = await body<{ id: string; slot: string; status: string }[]>(await b.send(blueprints.GET, "/api/admin/qb/blueprints"));
    const existing = list.data.find((entry) => entry.slot === slot && entry.status === "draft");
    if (existing) return existing.id;
    const created = await b.send(blueprints.POST, "/api/admin/qb/blueprints", { body: { slot } });
    expect(created.status).toBe(201);
    return (await body<{ blueprint: { id: string } }>(created)).data.blueprint.id;
  }

  it("publishing waits for the exam's taxonomy; the BOH placeholder cannot be published; confirmations are audited", async () => {
    const { a, r } = await setup();
    const jee = await draftBlueprint(a, "jee-main");
    const publish = (b: Browser, id: string) => b.send(blueprintActions.POST, `/api/admin/qb/blueprints/${id}/actions`, { body: { action: "publish" } }, params({ id }));

    expect((await publish(r, jee)).status).toBe(403);
    const refused = await publish(a, jee);
    expect(refused.status).toBe(409);
    expect((await body(refused)).code).toBe("taxonomy_unconfirmed");

    expect((await r.send(taxonomy.POST, "/api/admin/qb/taxonomy/JEE_MAIN/confirm", { body: { confirm: true, syllabusRevisionYear: 2024 } }, params({ exam: "JEE_MAIN" }))).status).toBe(403);
    const confirmed = await a.send(taxonomy.POST, "/api/admin/qb/taxonomy/JEE_MAIN/confirm", { body: { confirm: true, syllabusRevisionYear: 2024 } }, params({ exam: "JEE_MAIN" }));
    expect(confirmed.status).toBe(200);
    expect(audit("qb.taxonomy_confirm")[0]).toMatchObject({ target: "JEE_MAIN", details: { exam: "JEE_MAIN", syllabusRevisionYear: 2024 } });
    const again = await publish(a, jee);
    if (again.status === 409) expect((await body(again)).code).not.toBe("taxonomy_unconfirmed");
    else expect(again.status).toBe(200);

    const boh = await draftBlueprint(a, "boh-class-10");
    const placeholder = await publish(a, boh);
    expect(placeholder.status).toBe(409);
    expect((await body(placeholder)).code).toBe("placeholder_blueprint");
    expect(audit("qb.blueprint_publish").filter((entry) => entry.target === boh)).toEqual([]);

    // Confirming the placeholder pattern needs a note saying how it was confirmed.
    const confirm = (note?: string) =>
      a.send(blueprintActions.POST, `/api/admin/qb/blueprints/${boh}/actions`, { body: { action: "confirm_pattern", ...(note === undefined ? {} : { note }) } }, params({ id: boh }));
    expect((await confirm()).status).toBe(422);
    expect((await confirm("  ")).status).toBe(422);
    expect(audit("qb.pattern_confirm")).toEqual([]);
  });

  it("only an admin turns AI import on; the change is audited", async () => {
    const { a, r, au } = await setup();
    expect((await au.send(settings.GET, "/api/admin/qb/settings")).status).toBe(403);
    expect((await r.send(settings.PUT, "/api/admin/qb/settings", { method: "PUT", body: { importEnabled: true } })).status).toBe(403);
    const changed = await a.send(settings.PUT, "/api/admin/qb/settings", { method: "PUT", body: { importEnabled: true } });
    expect(changed.status).toBe(200);
    expect((await body<{ importEnabled: boolean }>(changed)).data.importEnabled).toBe(true);
    expect(audit("qb.settings_change")[0]).toMatchObject({ details: { importEnabled: true } });
  });
});
