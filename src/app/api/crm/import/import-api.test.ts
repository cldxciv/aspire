import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /api/crm/import/** route handlers with the REAL guards (`requireCrmSuperAdmin`, `requireCrm`:
// same origin, session, CRM membership, effective super admin from `superadmin_grants`, rate
// limits) and the REAL import wiring (CORE `captureLead`, secret-box hashes). Only the session
// lookup is stubbed (no cookies / scrypt), and the routing / SLA seams are test-defined
// (`fixtures/seams.ts`). A guard fails any test that reaches the network. Synthetic people only.
const session = vi.hoisted(() => ({ current: null as null | { userId: string; role: "admin" | "staff"; displayName: string } }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<object>()),
  getSession: vi.fn(async () => session.current),
}));
vi.mock("@/lib/crm/routing", async (original) => ({ ...(await original<object>()), ...(await import("@/lib/crm/intake/fixtures/seams")).routingSeam() }));
vi.mock("@/lib/crm/sla", async (original) => ({ ...(await original<object>()), ...(await import("@/lib/crm/intake/fixtures/seams")).slaSeam() }));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { insertUser } = await import("@/lib/db/users");
const { upsertGrant } = await import("@/lib/db/super-admins");
const { listAudit } = await import("@/lib/db/audit");
const { writeStaffMembership } = await import("@/lib/crm/admin");
const { bodyLimit, resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { IMPORT_LIMITS } = await import("@/lib/crm/intake/import");
const { fixtureRows, TEST_INTEGRATIONS_SECRET } = await import("@/lib/crm/intake/fixtures/import-kit");
const { resetImportLimitersForTests } = await import("./_lib/route-kit");
const preview = await import("./preview/route");
const batches = await import("./batches/route");
const rows = await import("./batches/[batchId]/rows/route");
const finish = await import("./batches/[batchId]/finish/route");

const ORIGIN = "http://localhost:3000";
const realFetch = globalThis.fetch;
globalThis.fetch = (() => {
  throw new Error("network access in a test");
}) as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

type Who = "sa" | "admin" | "manager" | "counsellor" | "signed_out";
const ids = { sa: "", admin: "", manager: "", counsellor: "" };

function as(who: Who) {
  session.current =
    who === "signed_out"
      ? null
      : { userId: ids[who], role: who === "sa" || who === "admin" ? "admin" : "staff", displayName: `Test ${who}` };
}

function request(path: string, init: { method?: string; body?: unknown; raw?: string; contentType?: string; origin?: string } = {}) {
  const method = init.method ?? (init.body === undefined && init.raw === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { origin: init.origin ?? ORIGIN, host: "localhost:3000" };
  if (method !== "GET") headers["content-type"] = init.contentType ?? "application/json";
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)) });
}

const ctx = (batchId: string) => ({ params: Promise.resolve({ batchId }) });

async function json(response: Response) {
  return { status: response.status, body: await response.json(), headers: response.headers };
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("INTEGRATIONS_SECRET", TEST_INTEGRATIONS_SECRET);
  vi.stubEnv("INTEGRATIONS_SECRET_PREVIOUS", "");
  resetDatabaseForTests();
  resetImportLimitersForTests();
  resetCrmRateLimitersForTests();
  const db = getDb();
  const now = Date.now();
  const user = (loginId: string, role: "admin" | "staff") => insertUser(db, { role, loginId, displayName: loginId, passwordHash: "scrypt$test", mustChangePassword: false, now }).id;
  ids.sa = user("sa.route", "admin");
  ids.admin = user("admin.route", "admin");
  ids.manager = user("head.route", "staff");
  ids.counsellor = user("exec.route", "staff");
  // Two admins: no bootstrap; only the granted one is a super admin.
  upsertGrant(db, { userId: ids.sa, via: "cli", by: null, now });
  writeStaffMembership(db, ids.sa, ids.manager, { crmRole: "manager", centreSlugs: [], active: true }, now);
  writeStaffMembership(db, ids.sa, ids.counsellor, { crmRole: "counsellor", centreSlugs: [], active: true }, now);
  as("sa");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const previewBody = () => ({ rows: fixtureRows("daily-1.csv"), consentBasis: "meta_lead_form" });
const startBody = (extra: Record<string, unknown> = {}) => ({ consentBasis: "meta_lead_form", startClock: true, rowsTotal: 5, fileName: "leads.csv", ...extra });

describe("the super-admin guard (enforced on the server for every write)", () => {
  it("refuses every write to an ordinary admin, an area head and an executive; 401 when signed out", async () => {
    const started = await json(await batches.POST(request("/api/crm/import/batches", { body: startBody() })));
    expect(started.status).toBe(201);
    const id = started.body.data.id as string;
    for (const who of ["admin", "manager", "counsellor", "signed_out"] as const) {
      as(who);
      const expected = who === "signed_out" ? 401 : 403;
      expect((await preview.POST(request("/api/crm/import/preview", { body: previewBody() }))).status, who).toBe(expected);
      expect((await batches.POST(request("/api/crm/import/batches", { body: startBody() }))).status, who).toBe(expected);
      expect((await rows.POST(request(`/api/crm/import/batches/${id}/rows`, { body: { rows: fixtureRows("daily-1.csv"), offset: 0 } }), ctx(id))).status, who).toBe(expected);
      expect((await finish.POST(request(`/api/crm/import/batches/${id}/finish`, { body: {} }), ctx(id))).status, who).toBe(expected);
    }
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads").get()).toEqual({ n: 0 });
    expect(getDb().prepare("SELECT status FROM crm_import_batches").get()).toEqual({ status: "open" });
  });

  it("a revoked grant stops the next request", async () => {
    expect((await preview.POST(request("/api/crm/import/preview", { body: previewBody() }))).status).toBe(200);
    getDb().prepare("UPDATE superadmin_grants SET revoked_at = ? WHERE user_id = ?").run(Date.now(), ids.sa);
    expect((await preview.POST(request("/api/crm/import/preview", { body: previewBody() }))).status).toBe(403);
  });

  it("refuses a cross-origin write before anything else", async () => {
    const res = await preview.POST(request("/api/crm/import/preview", { body: previewBody(), origin: "https://attacker.example" }));
    expect(res.status).toBe(403);
  });

  it("shows the history to admins (and super admins) only", async () => {
    await batches.POST(request("/api/crm/import/batches", { body: startBody() }));
    for (const who of ["sa", "admin"] as const) {
      as(who);
      const res = await json(await batches.GET(request("/api/crm/import/batches")));
      expect(res.status, who).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].mine).toBe(who === "sa");
    }
    for (const who of ["manager", "counsellor"] as const) {
      as(who);
      expect((await batches.GET(request("/api/crm/import/batches"))).status, who).toBe(403);
    }
    as("signed_out");
    expect((await batches.GET(request("/api/crm/import/batches"))).status).toBe(401);
  });
});

describe("POST /api/crm/import/preview", () => {
  it("returns a masked dry run with private headers and writes nothing", async () => {
    const res = await json(await preview.POST(request("/api/crm/import/preview", { body: previewBody() })));
    expect(res.status).toBe(200);
    expect(res.body.data.rows.map((r: { status: string }) => r.status)).toEqual(["created", "created", "created"]);
    expect(res.body.data.rows[0].phoneMasked).toBe("+91 60•••••051");
    expect(JSON.stringify(res.body)).not.toMatch(/6000010051|Day One/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads").get()).toEqual({ n: 0 });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_external_refs").get()).toEqual({ n: 0 });
  });

  it("enforces the 256 KB body limit, the row limit, the schema and JSON", async () => {
    expect(IMPORT_LIMITS.bodyBytes).toBe(bodyLimit("import"));
    const big = { rows: [{ row: 2, phone: "+916000010001", answers: "x".repeat(900) }], pad: "y".repeat(300 * 1024) };
    expect((await preview.POST(request("/api/crm/import/preview", { body: big }))).status).toBe(413);
    const many = { rows: Array.from({ length: 251 }, (_, i) => ({ row: i + 2, phone: "+916000010001" })) };
    expect((await preview.POST(request("/api/crm/import/preview", { body: many }))).status).toBe(422);
    expect((await preview.POST(request("/api/crm/import/preview", { body: { rows: [{ row: 2, phone: 6000010001 }] } }))).status).toBe(422);
    expect((await preview.POST(request("/api/crm/import/preview", { body: { rows: [{ row: 2, phone: "+916000010001", sql: "x" }] } }))).status).toBe(422);
    expect((await preview.POST(request("/api/crm/import/preview", { raw: "{not json" }))).status).toBe(400);
    expect((await preview.POST(request("/api/crm/import/preview", { raw: "a,b", contentType: "text/csv" }))).status).toBe(415);
  });

  it("answers 503 not_configured without the server key", async () => {
    vi.stubEnv("INTEGRATIONS_SECRET", "");
    const res = await json(await preview.POST(request("/api/crm/import/preview", { body: previewBody() })));
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("not_configured");
    expect(JSON.stringify(res.body)).not.toContain(TEST_INTEGRATIONS_SECRET);
  });

  it("limits preview + rows requests to 400 an hour per user (the dry run is not held to the CRM write limit)", async () => {
    const body = { rows: [{ row: 2, phone: "+916000010001" }] };
    // 400 dry runs in a row: far past the CRM write limit (120 / 5 min), within the read limit.
    for (let i = 0; i < IMPORT_LIMITS.chunksPerHour; i++) expect((await preview.POST(request("/api/crm/import/preview", { body }))).status).toBe(200);
    const res = await preview.POST(request("/api/crm/import/preview", { body }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    // The same hourly budget covers the rows requests.
    resetCrmRateLimitersForTests();
    const started = await json(await batches.POST(request("/api/crm/import/batches", { body: startBody() })));
    const id = started.body.data.id as string;
    expect((await rows.POST(request(`/api/crm/import/batches/${id}/rows`, { body: { ...body, offset: 0 } }), ctx(id))).status).toBe(429);
  });
});

describe("batches", () => {
  it("runs a whole import: start → rows → finish → history, audited with counts only", async () => {
    const started = await json(await batches.POST(request("/api/crm/import/batches", { body: startBody() })));
    expect(started.status).toBe(201);
    const id = started.body.data.id as string;
    const chunk = await json(await rows.POST(request(`/api/crm/import/batches/${id}/rows`, { body: { rows: fixtureRows("daily-2.csv"), offset: 0 } }), ctx(id)));
    expect(chunk.status).toBe(200);
    expect(chunk.body.data.results.map((r: { status: string }) => r.status)).toEqual(Array(5).fill("created"));
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads WHERE source = 'meta_lead_ad'").get()).toEqual({ n: 5 });
    // The same chunk again (its answer was lost): answered, not counted twice, no second lead.
    const resent = await json(await rows.POST(request(`/api/crm/import/batches/${id}/rows`, { body: { rows: fixtureRows("daily-2.csv"), offset: 0 } }), ctx(id)));
    expect(resent.status).toBe(200);
    expect(resent.body.data.batch).toMatchObject({ created: 5, skipped: 0 });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads").get()).toEqual({ n: 5 });
    // A chunk that skips ahead is refused.
    expect((await rows.POST(request(`/api/crm/import/batches/${id}/rows`, { body: { rows: fixtureRows("daily-1.csv"), offset: 9 } }), ctx(id))).status).toBe(409);
    const done = await json(await finish.POST(request(`/api/crm/import/batches/${id}/finish`, { body: {} }), ctx(id)));
    expect(done.body.data).toMatchObject({ status: "finished", created: 5 });
    expect((await finish.POST(request(`/api/crm/import/batches/${id}/finish`, { body: {} }), ctx(id))).status).toBe(200);
    const history = await json(await batches.GET(request("/api/crm/import/batches")));
    expect(history.body.data.items).toEqual([expect.objectContaining({ id, created: 5, mine: true, fileName: "leads.csv" })]);
    const audit = listAudit(getDb(), { limit: 100 }).filter((entry) => entry.action.startsWith("crm.import"));
    expect(audit.map((entry) => entry.action).sort()).toEqual(["crm.import", "crm.import_start"]);
    expect(audit.every((entry) => entry.actorId === ids.sa)).toBe(true);
    expect(JSON.stringify(audit)).not.toMatch(/6000010|Day One|Day Two|leads\.csv/);
  });

  it("needs a consent basis to start", async () => {
    expect((await batches.POST(request("/api/crm/import/batches", { body: startBody({ consentBasis: undefined }) }))).status).toBe(422);
    expect((await batches.POST(request("/api/crm/import/batches", { body: startBody({ consentBasis: "zapier" }) }))).status).toBe(422);
  });

  it("only the super admin who started a batch can add to it", async () => {
    const started = await json(await batches.POST(request("/api/crm/import/batches", { body: startBody() })));
    const id = started.body.data.id as string;
    const second = insertUser(getDb(), { role: "admin", loginId: "sa.two", displayName: "SA Two", passwordHash: "scrypt$test", mustChangePassword: false, now: Date.now() }).id;
    upsertGrant(getDb(), { userId: second, via: "cli", by: null, now: Date.now() });
    session.current = { userId: second, role: "admin", displayName: "SA Two" };
    expect((await rows.POST(request(`/api/crm/import/batches/${id}/rows`, { body: { rows: fixtureRows("daily-1.csv"), offset: 0 } }), ctx(id))).status).toBe(403);
    expect((await finish.POST(request(`/api/crm/import/batches/${id}/finish`, { body: {} }), ctx(id))).status).toBe(403);
  });

  it("rejects bad ids, unknown and finished batches", async () => {
    const body = { rows: [{ row: 2, phone: "+916000010001" }], offset: 0 };
    expect((await rows.POST(request("/api/crm/import/batches/x!/rows", { body }), ctx("x!"))).status).toBe(400);
    expect((await rows.POST(request("/api/crm/import/batches/nope/rows", { body }), ctx("nope"))).status).toBe(404);
    const started = await json(await batches.POST(request("/api/crm/import/batches", { body: startBody() })));
    const id = started.body.data.id as string;
    await finish.POST(request(`/api/crm/import/batches/${id}/finish`, { body: {} }), ctx(id));
    expect((await rows.POST(request(`/api/crm/import/batches/${id}/rows`, { body }), ctx(id))).status).toBe(409);
    expect((await finish.POST(request(`/api/crm/import/batches/${id}/finish`, { body: { extra: 1 } }), ctx(id))).status).toBe(422);
  });
});
