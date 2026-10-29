import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CaptureLeadInput } from "@/lib/crm/types";

// 1B-CALLS (docs/admin-phase-1b-plan.md §5.C, §5.D, §8): /api/crm/leads/[leadId]/outcome and
// /api/crm/templates/** against a fresh in-memory database, through the real auth (sign-in, session
// cookie, same-origin checks) and lead routing's REAL first-call (SLA) module.
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
const { createTestUser, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const { captureLead, writeStaffMembership } = await import("@/lib/crm");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { ist } = await import("@/lib/crm/sla/test-kit");
const { callsRequests } = await import("@/components/console/calls/api");
const login = await import("@/app/api/auth/login/route");
const outcome = await import("./leads/[leadId]/outcome/route");
const templates = await import("./templates/route");
const templateKey = await import("./templates/[key]/route");
const templateStatus = await import("./templates/[key]/status/route");
const templateLinks = await import("./templates/links/route");

type Browser = InstanceType<typeof TestBrowser>;
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = "synthetic-pass-2026";
/** Wednesday 21 Oct 2026, 11:30 IST (inside the default calling hours). */
const T0 = ist("2026-10-21", "11:30");
let ip = 0;
const browser = (): Browser => new TestBrowser(cookieState, `198.51.100.${(ip += 1) % 250}`);

async function signedIn(loginId: string): Promise<Browser> {
  const b = browser();
  expect((await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } })).status).toBe(200);
  return b;
}

async function staffUser(loginId: string, crmRole: "counsellor" | "manager") {
  const user = await createTestUser({ role: "staff", loginId, password: PASSWORD });
  writeStaffMembership(getDb(), user.id, user.id, { crmRole, centreSlugs: [], active: true }, Date.now());
  return user;
}

let phoneCounter = 0;
function capture(overrides: Partial<CaptureLeadInput> = {}) {
  phoneCounter += 1;
  const result = captureLead(
    { source: "admissions", studentName: "Synthetic Student", phone: `96100${String(phoneCounter).padStart(5, "0")}`, consent: { textVersion: "test-v1" }, ...overrides },
    Date.now(),
  );
  if (!result.ok) throw new Error("capture failed");
  return result;
}

type Request = { path: string; method: string; body?: unknown };
type Handler = (request: never, ctx: never) => Promise<Response>;
const send = (b: Browser, handler: Handler, request: Request, ctx?: unknown, options: { origin?: string | null } = {}) =>
  b.send(handler as never, request.path, { method: request.method, body: request.body, ...options }, ctx as never);

const getContext = (b: Browser, leadId: string, taskId?: string) => send(b, outcome.GET, callsRequests.outcomeContext(leadId, taskId), params({ leadId }));
const postOutcome = (b: Browser, leadId: string, body: unknown, options: { origin?: string | null } = {}) =>
  send(b, outcome.POST, { path: `/api/crm/leads/${leadId}/outcome`, method: "POST", body }, params({ leadId }), options);

const openTasks = (leadId: string) =>
  getDb()
    .prepare("SELECT id, title, created_by FROM crm_tasks WHERE lead_id = ? AND done_at IS NULL ORDER BY due_at")
    .all(leadId)
    .map((row) => ({ id: String(row.id), title: String(row.title), createdBy: row.created_by === null ? null : String(row.created_by) }));
const clocks = (leadId: string) =>
  getDb()
    .prepare("SELECT resolution, resolved_at, attempts, retries_created FROM crm_sla_clocks WHERE lead_id = ? ORDER BY id")
    .all(leadId)
    .map((row) => ({ resolution: row.resolution, resolvedAt: row.resolved_at, attempts: Number(row.attempts), retries: Number(row.retries_created) }));
const activities = (leadId: string, type: string) => Number(getDb().prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE lead_id = ? AND type = ?").get(leadId, type)?.n);

const noAnswer = { contact: { channel: "call", outcome: "no_answer" }, next: { kind: "preset", preset: "later_today" } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetCrmRateLimitersForTests();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  resetDatabaseForTests();
});

describe("GET /api/crm/leads/[leadId]/outcome", () => {
  it("serves the follow-up context to a viewer who sees the lead; 401 / 404 / 400 otherwise; no-store, noindex", async () => {
    await staffUser("exec.one", "counsellor");
    const { leadId } = capture({ guardianName: "Synthetic Parent", context: { locale: "hi" } });
    const anonymous = await getContext(browser(), leadId);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("no-store");
    expect(anonymous.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const exec = await signedIn("exec.one");
    const response = await getContext(exec, leadId);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({
      leadId,
      stage: "new",
      attempts: { calls: 0, unansweredStreak: 0, suggestNotReachable: false },
      presets: { later_today: new Date(ist("2026-10-21", "13:30")).toISOString() },
      defaultLang: "hi",
      templateSlots: { parent_name: "Synthetic Parent", student_first_name: "Synthetic" },
      openTask: null,
      openTaskCount: 0,
    });
    expect(data.callingHours.week.mon).toEqual({ open: true, start: "09:00", end: "19:00" });
    // A second counsellor cannot see it: 404 (no existence leak), and nothing about it.
    await staffUser("exec.two", "counsellor");
    const stranger = await getContext(await signedIn("exec.two"), leadId);
    expect(stranger.status).toBe(404);
    expect(JSON.stringify(await stranger.json())).not.toContain("Synthetic");
    expect((await send(exec, outcome.GET, { path: "/api/crm/leads/bad id/outcome", method: "GET" }, params({ leadId: "bad id" }))).status).toBe(400);
  });
});

describe("POST /api/crm/leads/[leadId]/outcome", () => {
  it("one no-answer call leaves EXACTLY ONE open follow-up (with the real LR-SLA module) and is audited without text", async () => {
    const exec = await staffUser("exec.one", "counsellor");
    const { leadId } = capture();
    expect(clocks(leadId)).toEqual([{ resolution: null, resolvedAt: null, attempts: 0, retries: 0 }]);
    const b = await signedIn("exec.one");
    const response = await postOutcome(b, leadId, { ...noAnswer, contact: { ...noAnswer.contact, note: "Rang twice, no reply" } });
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({ stage: "new", completedTaskId: null, outsideCallingHours: false, attempts: { calls: 1, unansweredStreak: 1 } });
    expect(data.task.dueAt).toBe(new Date(ist("2026-10-21", "13:30")).toISOString());
    expect(openTasks(leadId)).toEqual([{ id: data.task.id, title: expect.stringContaining("Call again"), createdBy: exec.id }]);
    expect(clocks(leadId)).toEqual([{ resolution: "attempt", resolvedAt: T0, attempts: 1, retries: 0 }]); // no LR retry task
    const audit = listAudit(getDb(), { limit: 50 });
    expect(audit.filter((entry) => entry.action === "crm.contact_log").map((entry) => entry.details)).toEqual([{ channel: "call", outcome: "no_answer" }]);
    expect(JSON.stringify(audit)).not.toContain("Rang twice");
  });

  it("422 without a next follow-up, 422 when there is no contact and no task, 422 at 21:30; strict body, same-origin, 8 KB", async () => {
    await staffUser("exec.one", "counsellor");
    const { leadId } = capture();
    const b = await signedIn("exec.one");
    const noNext = await postOutcome(b, leadId, { ...noAnswer, next: { kind: "none", reason: "has_other_task" } });
    expect(noNext.status).toBe(422);
    expect((await noNext.json()).fieldErrors).toEqual({ next: ["Choose when to follow up."] });
    const noContact = await postOutcome(b, leadId, { contact: null, next: noAnswer.next });
    expect(noContact.status).toBe(422);
    expect((await noContact.json()).fieldErrors).toEqual({ contact: ["Choose what happened."] });
    const late = await postOutcome(b, leadId, { ...noAnswer, next: { kind: "at", at: new Date(ist("2026-10-21", "21:30")).toISOString() } });
    expect(late.status).toBe(422);
    expect((await late.json()).fieldErrors).toEqual({ next: ["No calls before 8 am or after 9 pm."] });
    expect((await postOutcome(b, leadId, { ...noAnswer, extra: true })).status).toBe(422);
    expect((await postOutcome(b, leadId, noAnswer, { origin: "https://evil.example" })).status).toBe(403);
    expect((await postOutcome(b, leadId, { ...noAnswer, contact: { ...noAnswer.contact, note: "x".repeat(9 * 1024) } })).status).toBe(413);
    expect(openTasks(leadId)).toEqual([]);
    expect(activities(leadId, "call")).toBe(0);
  });

  it("5 unanswered calls, then 'not reachable' → lost (not_reachable), LR's clock closed, no task left", async () => {
    await staffUser("exec.one", "counsellor");
    const { leadId } = capture();
    const b = await signedIn("exec.one");
    for (let call = 1; call <= 4; call += 1) {
      const open = openTasks(leadId)[0];
      expect((await postOutcome(b, leadId, { ...noAnswer, taskId: open?.id ?? null })).status).toBe(201);
      vi.setSystemTime(T0 + call * 20 * 60_000);
    }
    const context = await (await getContext(b, leadId, openTasks(leadId)[0].id)).json();
    expect(context.data.attempts).toEqual({ calls: 4, unansweredStreak: 4, suggestNotReachable: false });
    const final = await postOutcome(b, leadId, { ...noAnswer, taskId: openTasks(leadId)[0].id, next: { kind: "none", reason: "closing" }, markNotReachable: true });
    expect(final.status).toBe(201);
    expect((await final.json()).data).toMatchObject({ stage: "lost", task: null, attempts: { calls: 5, unansweredStreak: 5, suggestNotReachable: true } });
    expect(getDb().prepare("SELECT stage, lost_reason FROM crm_leads WHERE id = ?").get(leadId)).toEqual({ stage: "lost", lost_reason: "not_reachable" });
    expect(openTasks(leadId)).toEqual([]);
    expect(clocks(leadId).every((clock) => clock.resolvedAt !== null)).toBe(true);
  });

  it("a counsellor cannot complete another person's task on a lead they cannot see (404, nothing changes)", async () => {
    const one = await staffUser("exec.one", "counsellor");
    const theirs = capture();
    expect(theirs.assigneeId).toBe(one.id);
    await staffUser("exec.two", "counsellor");
    const b1 = await signedIn("exec.one");
    expect((await postOutcome(b1, theirs.leadId, noAnswer)).status).toBe(201);
    const taskId = openTasks(theirs.leadId)[0].id;
    const b2 = await signedIn("exec.two");
    const response = await postOutcome(b2, theirs.leadId, { contact: null, taskId, next: { kind: "preset", preset: "tomorrow" } });
    expect(response.status).toBe(404);
    expect(openTasks(theirs.leadId).map((task) => task.id)).toEqual([taskId]);
  });
});

describe("/api/crm/templates (§5.D)", () => {
  it("drafts are never offered; super admins alone edit, approve and set the prospectus link; approved general templates reach counsellors", async () => {
    await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    const sa = await signedIn("owner.sa");
    // Bootstrap super admin (the only admin), then a plain admin.
    expect((await send(sa, templates.GET, callsRequests.allTemplates())).status).toBe(200);
    await createTestUser({ role: "admin", loginId: "plain.admin", password: PASSWORD });
    await staffUser("head.one", "manager");
    await staffUser("exec.one", "counsellor");
    const exec = await signedIn("exec.one");

    const offered = await send(exec, templates.GET, callsRequests.approvedTemplates());
    expect(offered.status).toBe(200);
    expect((await offered.json()).data).toEqual([]);
    expect((await send(exec, templates.GET, callsRequests.allTemplates())).status).toBe(403);
    const head = await send(await signedIn("head.one"), templates.GET, callsRequests.allTemplates());
    expect(head.status).toBe(200);
    const all = (await head.json()).data as { key: string; status: string; version: number }[];
    expect(all.map((template) => template.key)).toEqual([
      "first_contact",
      "missed_call",
      "centre_location",
      "prospectus",
      "visit_invite",
      "test_date",
      "batch_start",
      "after_visit",
    ]);
    expect(all.every((template) => template.status === "draft")).toBe(true);

    const approve = callsRequests.templateStatus("missed_call", { status: "approved", expectedVersion: 1 });
    const edit = callsRequests.editTemplate("missed_call", { lang: "en", body: "Namaste {parent_name} ji, I called. – {counsellor_name}, Aspire", expectedVersion: 1 });
    const link = callsRequests.saveProspectusLink({ prospectusUrl: "https://example.org/prospectus.pdf", expectedVersion: 0 });
    for (const loginId of ["plain.admin", "head.one", "exec.one"]) {
      const b = await signedIn(loginId);
      expect((await send(b, templateStatus.POST, approve, params({ key: "missed_call" }))).status, loginId).toBe(403);
      expect((await send(b, templateKey.PUT, edit, params({ key: "missed_call" }))).status, loginId).toBe(403);
      expect((await send(b, templateLinks.PUT, link)).status, loginId).toBe(403);
    }
    expect((await send(sa, templateStatus.POST, approve, params({ key: "missed_call" }), { origin: "https://evil.example" })).status).toBe(403);

    const approved = await send(sa, templateStatus.POST, approve, params({ key: "missed_call" }));
    expect(approved.status).toBe(200);
    expect((await approved.json()).data).toMatchObject({ key: "missed_call", status: "approved", version: 2, approvedBy: expect.any(String) });
    const list = (await (await send(exec, templates.GET, callsRequests.approvedTemplates())).json()).data as { key: string }[];
    expect(list.map((template) => template.key)).toEqual(["missed_call"]);
    // A stale version is a conflict; editing an approved template sends it back to draft.
    expect((await send(sa, templateKey.PUT, edit, params({ key: "missed_call" }))).status).toBe(409);
    const edited = await send(sa, templateKey.PUT, { ...edit, body: { ...(edit.body as object), expectedVersion: 2 } }, params({ key: "missed_call" }));
    expect(edited.status).toBe(200);
    expect((await edited.json()).data).toMatchObject({ status: "draft", version: 3 });
    expect((await (await send(exec, templates.GET, callsRequests.approvedTemplates())).json()).data).toEqual([]);
    const unknownSlot = await send(sa, templateKey.PUT, callsRequests.editTemplate("missed_call", { lang: "hi", body: "नमस्ते {guardian} जी।", expectedVersion: 3 }), params({ key: "missed_call" }));
    expect(unknownSlot.status).toBe(422);
    expect((await send(sa, templateLinks.PUT, link)).status).toBe(200);
    expect((await send(sa, templateLinks.PUT, callsRequests.saveProspectusLink({ prospectusUrl: "javascript:alert(1)", expectedVersion: 1 }))).status).toBe(422);
    const actions = listAudit(getDb(), { limit: 100 }).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["settings.template_status", "settings.template_update", "settings.wa_links_update"]));
  });

  it("opening WhatsApp logs nothing; only 'Yes, I sent it' logs message_sent with { template, lang } and a follow-up", async () => {
    await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    const sa = await signedIn("owner.sa");
    expect((await send(sa, templates.GET, callsRequests.allTemplates())).status).toBe(200);
    expect((await send(sa, templateStatus.POST, callsRequests.templateStatus("first_contact", { status: "approved", expectedVersion: 1 }), params({ key: "first_contact" }))).status).toBe(200);
    await staffUser("exec.one", "counsellor");
    const { leadId } = capture();
    const exec = await signedIn("exec.one");
    // What the composer does when it opens and when WhatsApp opens: two reads, no write.
    expect((await getContext(exec, leadId)).status).toBe(200);
    expect((await send(exec, templates.GET, callsRequests.approvedTemplates())).status).toBe(200);
    expect(clocks(leadId)).toEqual([{ resolution: null, resolvedAt: null, attempts: 0, retries: 0 }]);
    expect(openTasks(leadId)).toEqual([]);
    expect(activities(leadId, "whatsapp")).toBe(0);
    // A draft or unknown template is refused.
    const sent = (key: string) => ({ contact: { channel: "whatsapp", outcome: "message_sent", template: { key, lang: "hinglish" } }, next: { kind: "preset", preset: "tomorrow" } });
    expect((await postOutcome(exec, leadId, sent("missed_call"))).status).toBe(422);
    // "Yes, I sent it".
    const response = await postOutcome(exec, leadId, sent("first_contact"));
    expect(response.status).toBe(201);
    const meta = JSON.parse(String(getDb().prepare("SELECT meta FROM crm_activities WHERE lead_id = ? AND type = 'whatsapp'").get(leadId)?.meta));
    expect(meta).toEqual({ outcome: "message_sent", template: "first_contact", lang: "hinglish" });
    expect(openTasks(leadId)).toHaveLength(1);
    expect(clocks(leadId)[0]).toMatchObject({ resolution: "attempt", resolvedAt: T0 });
  });
});
