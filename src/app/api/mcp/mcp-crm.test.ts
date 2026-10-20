import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CRM tools over /api/mcp, against a fresh in-memory database (CRM tables included) per test.
// Synthetic people and numbers only.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { listAudit } = await import("@/lib/db/audit");
const { insertUser } = await import("@/lib/db/users");
const { captureLead, writeStaffMembership } = await import("@/lib/crm");
const { createMcpToken } = await import("@/lib/mcp/tokens");
const { resetMcpRateLimitsForTests } = await import("@/lib/mcp/auth");
const { MCP_SERVICES } = await import("@/lib/mcp/scopes");
const route = await import("./route");

type Json = Record<string, unknown>;
interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Json;
  isError?: boolean;
}

const PHONE_A = "91234 56780"; // → +919123456780
const PHONE_B = "+91 81234 56781";
const CONSENT_SENTENCE = "SYNTHETIC CONSENT SENTENCE: I agree to be contacted";
const NOTE_TEXT = "SYNTHETIC NOTE about the family";

let seen: string[] = [];
let rpcId = 0;
let ipCounter = 0;
let ip = "198.51.100.10";

async function rpc(token: string, method: string, params?: unknown) {
  rpcId += 1;
  const response = await route.POST(
    new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-11-25",
        "x-forwarded-for": ip,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, ...(params === undefined ? {} : { params }) }),
    }),
  );
  const text = await response.text();
  seen.push(text);
  return { status: response.status, json: JSON.parse(text) as Json };
}

async function call(token: string, name: string, args: Json = {}): Promise<ToolResult> {
  const { status, json } = await rpc(token, "tools/call", { name, arguments: args });
  expect(status).toBe(200);
  return (json as { result: ToolResult }).result;
}

async function listed(token: string): Promise<string[]> {
  const { json } = await rpc(token, "tools/list");
  return (json as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name);
}

const data = <T = Json>(result: ToolResult) => result.structuredContent as T;

let adminId: string;
let counsellorId: string;
let crmRead: string;
let crmWrite: string;
let crmWriteId: string;

function user(role: "admin" | "staff" | "student", loginId: string, displayName = loginId) {
  return insertUser(getDb(), { role, loginId, displayName, passwordHash: "scrypt$test", mustChangePassword: false, now: Date.now() });
}

function capture(overrides: Record<string, unknown> = {}) {
  const result = captureLead({
    source: "admissions",
    studentName: "Synthetic Student",
    phone: PHONE_A,
    currentClass: "class-11",
    programInterest: "jee",
    centreSlug: "shimla",
    consent: { textVersion: "2026-10-20.v1", locale: "en", text: CONSENT_SENTENCE },
    context: { page: "/admissions" },
    ...overrides,
  });
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result;
}

function mcpAudit() {
  return listAudit(getDb(), { limit: 500 }).filter((entry) => entry.action.startsWith("mcp.") && !entry.action.startsWith("mcp.token"));
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetMcpRateLimitsForTests();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
  ipCounter += 1;
  ip = `198.51.100.${(ipCounter % 200) + 10}`;
  seen = [];
  adminId = user("admin", "admin.one", "Office Admin").id;
  crmRead = createMcpToken({ name: "CRM reader", scopes: ["crm:read"], createdBy: adminId }).token;
  const write = createMcpToken({ name: "CRM writer", scopes: ["crm:write"], createdBy: adminId });
  crmWrite = write.token;
  crmWriteId = write.record.id;
  counsellorId = user("staff", "staff.counsellor", "Counsellor One").id;
});

afterEach(() => {
  const all = seen.join("\n");
  expect(all).not.toContain("scrypt$");
  expect(all).not.toContain("asp_mcp_");
  expect(all).not.toContain(CONSENT_SENTENCE);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
  resetMcpRateLimitsForTests();
});

const CRM = MCP_SERVICES.find((service) => service.id === "crm")!;

describe("crm scopes", () => {
  it("crm:read lists the read tools only, crm:write adds the write tools", async () => {
    expect(await listed(crmRead)).toEqual(["list_leads", "get_lead", "list_my_tasks", "crm_report"]);
    expect(await listed(crmWrite)).toEqual([...CRM.tools.read, ...CRM.tools.write]);
    // Legacy whole-token scopes never include the CRM (added later).
    const legacy = createMcpToken({ name: "Old", scopes: "read write", createdBy: adminId });
    expect((await listed(legacy.token)).some((name) => CRM.tools.read.includes(name))).toBe(false);
  });

  it("a crm:read token cannot write (forbidden, audited, nothing changes)", async () => {
    const lead = capture();
    const result = await call(crmRead, "add_lead_note", { leadId: lead.leadId, body: NOTE_TEXT });
    expect(result.structuredContent).toMatchObject({ error: "forbidden" });
    expect(result.content[0].text).toContain("crm:write");
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE type = 'note'").get()?.n).toBe(0);
    expect(mcpAudit().find((entry) => entry.action === "mcp.add_lead_note")?.details).toMatchObject({ outcome: "forbidden" });
    // Other services stay closed to a CRM-only token.
    expect((await call(crmWrite, "list_accounts")).structuredContent).toMatchObject({ error: "forbidden" });
  });
});

describe("crm:read tools", () => {
  it("list_leads masks phone numbers and filters / pages through the CRM service", async () => {
    const a = capture();
    capture({ phone: PHONE_B, studentName: "Second Student", centreSlug: "kullu", programInterest: "neet", source: "tool", context: { tool: "predictor" } });

    const all = await call(crmRead, "list_leads", {});
    const page = data<{ total: number; leads: Json[] }>(all);
    expect(page.total).toBe(2);
    const first = page.leads.find((lead) => lead.id === a.leadId)!;
    expect(first).toMatchObject({ phoneLast4: "6780", phoneMasked: "+91******6780", stage: "new", centreSlug: "shimla" });
    expect(first).not.toHaveProperty("phone");
    const text = JSON.stringify(all);
    expect(text).not.toContain("9123456780");
    expect(text).not.toContain("8123456781");

    const byCentre = data<{ leads: Json[] }>(await call(crmRead, "list_leads", { centre: "kullu" }));
    expect(byCentre.leads.map((lead) => lead.studentName)).toEqual(["Second Student"]);
    const byTool = data<{ total: number; leads: Json[] }>(await call(crmRead, "list_leads", { tool: "predictor" }));
    expect(byTool.total).toBe(1);
    expect(byTool.leads[0]).toMatchObject({ tool: "predictor" });
    const bySearch = data<{ leads: Json[] }>(await call(crmRead, "list_leads", { search: "6780" }));
    expect(bySearch.leads.map((lead) => lead.id)).toEqual([a.leadId]);
    const unassigned = data<{ total: number }>(await call(crmRead, "list_leads", { assignee: "unassigned" }));
    expect(unassigned.total).toBe(2);
    const paged = data<{ leads: Json[]; nextPage: number | null }>(await call(crmRead, "list_leads", { pageSize: 1 }));
    expect(paged.leads).toHaveLength(1);
    expect(paged.nextPage).toBe(2);

    const invalid = await call(crmRead, "list_leads", { stage: "won", pageSize: 500 });
    expect(invalid.structuredContent).toMatchObject({ error: "invalid_arguments" });
  });

  it("get_lead returns the full record without the consent sentence; the view is audited by the CRM", async () => {
    const { leadId } = capture({ message: "Synthetic message from the family" });
    const result = await call(crmRead, "get_lead", { leadId });
    expect(result.isError).toBeFalsy();
    const lead = data<{ lead: Json & { activities: { type: string; meta: Json }[] } }>(result).lead;
    expect(lead).toMatchObject({ id: leadId, phone: "+919123456780", consentTextVersion: "2026-10-20.v1", message: "Synthetic message from the family" });
    expect(lead).not.toHaveProperty("consentText");
    expect(lead).not.toHaveProperty("consentLocale");
    const submission = lead.activities.find((activity) => activity.type === "submission")!;
    expect(submission.meta).toMatchObject({ consentTextVersion: "2026-10-20.v1" });
    expect(submission.meta).not.toHaveProperty("consentText");

    const views = listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action === "crm.lead_view");
    expect(views).toEqual([expect.objectContaining({ actorId: adminId, target: leadId })]);

    const missing = await call(crmRead, "get_lead", { leadId: "no-such-lead" });
    expect(missing.structuredContent).toMatchObject({ error: "not_found" });
  });

  it("list_my_tasks lists the token admin's tasks with masked lead phones", async () => {
    const { leadId } = capture();
    const due = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect((await call(crmWrite, "create_lead_task", { leadId, title: "Call back about fees", dueAt: due })).isError).toBeFalsy();
    const result = await call(crmRead, "list_my_tasks", {});
    const tasks = data<{ total: number; tasks: Json[] }>(result);
    expect(tasks.total).toBe(1);
    expect(tasks.tasks[0]).toMatchObject({ title: "Call back about fees", leadId, leadPhoneLast4: "6780" });
    expect(tasks.tasks[0]).not.toHaveProperty("leadPhone");
    expect(JSON.stringify(result)).not.toContain("9123456780");
    expect((await call(crmRead, "list_my_tasks", { range: "someday" })).isError).toBe(true);
  });

  it("crm_report returns the funnel for a range and validates it", async () => {
    capture();
    capture({ phone: PHONE_B, source: "tool", context: { tool: "planner" } });
    const result = await call(crmRead, "crm_report", {});
    const report = data<{ report: Json & { total: number; byStage: Json; bySource: Json[] } }>(result).report;
    expect(report.total).toBe(2);
    expect(report.byStage).toMatchObject({ new: 2 });
    expect(report.bySource.map((row) => row.key).sort()).toEqual(["admissions", "tool"]);
    expect(JSON.stringify(result)).not.toMatch(/9123456780|Synthetic Student/);

    const backwards = await call(crmRead, "crm_report", { from: "2026-10-10", to: "2026-10-01" });
    expect(backwards.structuredContent).toMatchObject({ error: "validation" });
    expect((await call(crmRead, "crm_report", { from: "yesterday" })).isError).toBe(true);
  });
});

describe("crm:write tools", () => {
  it("add_lead_note writes the note; audit rows never hold its text", async () => {
    const { leadId } = capture();
    const result = await call(crmWrite, "add_lead_note", { leadId, body: NOTE_TEXT });
    expect(result.isError).toBeFalsy();
    expect(data<{ activity: Json }>(result).activity).toMatchObject({ type: "note", body: NOTE_TEXT, actorId: adminId });
    const audit = listAudit(getDb(), { limit: 50 });
    expect(audit.find((entry) => entry.action === "crm.note_add")).toMatchObject({ actorId: adminId, target: leadId });
    expect(audit.find((entry) => entry.action === "mcp.add_lead_note")).toMatchObject({
      target: leadId,
      details: { outcome: "changed", via: "mcp", mcpKeyId: crmWriteId },
    });
    expect(JSON.stringify(audit)).not.toContain(NOTE_TEXT);
    expect((await call(crmWrite, "add_lead_note", { leadId, body: "" })).isError).toBe(true);
  });

  it("change_lead_stage needs a reason for lost", async () => {
    const { leadId } = capture();
    const noReason = await call(crmWrite, "change_lead_stage", { leadId, stage: "lost" });
    expect(noReason.structuredContent).toMatchObject({ error: "invalid_arguments" });
    expect(noReason.content[0].text).toContain("lostReason");

    const lost = await call(crmWrite, "change_lead_stage", { leadId, stage: "lost", lostReason: "fees" });
    expect(lost.structuredContent).toMatchObject({ stage: "lost", lostReason: "fees" });
    const back = await call(crmWrite, "change_lead_stage", { leadId, stage: "counselling_booked" });
    expect(back.structuredContent).toMatchObject({ stage: "counselling_booked", lostReason: null, furthestStage: "counselling_booked" });
    expect(listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action === "crm.stage_change")).toHaveLength(2);
  });

  it("assign_lead assigns to an active CRM member and unassigns", async () => {
    const { leadId } = capture();
    writeStaffMembership(getDb(), adminId, counsellorId, { crmRole: "counsellor", centreSlugs: [], active: true }, Date.now());

    const assigned = await call(crmWrite, "assign_lead", { leadId, assigneeId: counsellorId });
    expect(assigned.structuredContent).toMatchObject({ assignee: { userId: counsellorId, displayName: "Counsellor One" } });
    const unassigned = await call(crmWrite, "assign_lead", { leadId, assigneeId: null });
    expect(unassigned.structuredContent).toMatchObject({ assignee: null });
    const student = user("student", "stu.one");
    const notStaff = await call(crmWrite, "assign_lead", { leadId, assigneeId: student.id });
    expect(notStaff.structuredContent).toMatchObject({ error: "validation" });
  });

  it("create_lead_task and complete_lead_task", async () => {
    const { leadId } = capture();
    const created = await call(crmWrite, "create_lead_task", {
      leadId,
      title: "Book a counselling slot",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const task = data<{ task: Json }>(created).task;
    expect(task).toMatchObject({ leadId, title: "Book a counselling slot", doneAt: null });

    const done = await call(crmWrite, "complete_lead_task", { taskId: String(task.id) });
    expect(data<{ task: Json }>(done).task.doneAt).not.toBeNull();
    expect((await call(crmWrite, "complete_lead_task", { taskId: String(task.id) })).isError).toBeFalsy();

    const tooLate = await call(crmWrite, "create_lead_task", { leadId, title: "Far away", dueAt: "2040-01-01T00:00:00Z" });
    expect(tooLate.structuredContent).toMatchObject({ error: "validation" });
    expect(tooLate.content[0].text).toContain("dueAt");
  });

  it("log_lead_contact records a call (nothing is sent) and moves a new lead to contacted", async () => {
    const { leadId } = capture();
    const result = await call(crmWrite, "log_lead_contact", { leadId, channel: "call", outcome: "connected", note: "Asked about hostel" });
    expect(result.content[0].text).toContain("Nothing was sent");
    expect(data<{ activity: Json }>(result).activity).toMatchObject({ type: "call", meta: { outcome: "connected" } });
    const lead = data<{ lead: Json }>(await call(crmWrite, "get_lead", { leadId })).lead;
    expect(lead.stage).toBe("contacted");
    expect(mcpAudit().find((entry) => entry.action === "mcp.log_lead_contact")?.details).toMatchObject({
      channel: "call",
      contactOutcome: "connected",
      outcome: "changed",
    });
    expect((await call(crmWrite, "log_lead_contact", { leadId, channel: "sms", outcome: "connected" })).isError).toBe(true);
  });

  it("create_walkin_lead creates a lead, reuses one for a known phone, and requires consent", async () => {
    const created = await call(crmWrite, "create_walkin_lead", {
      studentName: "Walk-in Student",
      phone: PHONE_B,
      centreSlug: "shimla",
      programInterest: "neet",
      familyConsented: true,
    });
    expect(created.structuredContent).toMatchObject({ isNew: true });
    const leadId = String(data(created).leadId);
    const again = await call(crmWrite, "create_walkin_lead", { source: "phone_call", guardianName: "Parent", phone: PHONE_B, familyConsented: true });
    expect(again.structuredContent).toMatchObject({ isNew: false, leadId });
    expect(JSON.stringify(created)).not.toContain("8123456781");

    expect((await call(crmWrite, "create_walkin_lead", { studentName: "X Y", phone: PHONE_A, familyConsented: false })).isError).toBe(true);
    const badPhone = await call(crmWrite, "create_walkin_lead", { studentName: "X Y", phone: "12345 67890", familyConsented: true });
    expect(badPhone.structuredContent).toMatchObject({ error: "validation" });
    const noName = await call(crmWrite, "create_walkin_lead", { phone: PHONE_A, familyConsented: true });
    expect(noName.structuredContent).toMatchObject({ error: "validation" });

    const audit = listAudit(getDb(), { limit: 50 });
    expect(audit.filter((entry) => entry.action === "crm.lead_create")).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toMatch(/8123456781|Walk-in Student/);
  });
});
