import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CaptureLeadInput } from "@/lib/crm/types";

// 1B-FAMILY (docs/admin-phase-1b-plan.md §5.E, §5.F, §5.H, §8): /api/crm/leads/[leadId]/details,
// /api/crm/leads/[leadId]/duplicates and /api/crm/lost-review/** against a fresh in-memory database,
// through the real auth (sign-in, session cookie, same-origin checks). Synthetic data only.
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
const { assignLead, captureLead, changeStage, eraseLead, resolveCrmViewer, writeStaffMembership } = await import("@/lib/crm");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { familyRequests } = await import("@/components/console/details/api");
const login = await import("@/app/api/auth/login/route");
const details = await import("./leads/[leadId]/details/route");
const duplicates = await import("./leads/[leadId]/duplicates/route");
const lostList = await import("./lost-review/route");
const lostDecide = await import("./lost-review/[leadId]/route");

type Browser = InstanceType<typeof TestBrowser>;
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = "synthetic-pass-2026";
/** Wednesday 21 Oct 2026, 11:30 IST. */
const T0 = Date.parse("2026-10-21T11:30:00.000+05:30");
const DAY = 86_400_000;
let ip = 0;
const browser = (): Browser => new TestBrowser(cookieState, `198.51.100.${(ip += 1) % 250}`);

async function signedIn(loginId: string): Promise<Browser> {
  const b = browser();
  expect((await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } })).status).toBe(200);
  return b;
}

async function staffUser(loginId: string, crmRole: "counsellor" | "manager", centreSlugs: string[] = []) {
  const user = await createTestUser({ role: "staff", loginId, password: PASSWORD });
  writeStaffMembership(getDb(), user.id, user.id, { crmRole, centreSlugs, active: true }, Date.now());
  return user;
}

async function adminViewer() {
  const user = await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
  const viewer = resolveCrmViewer({ userId: user.id, role: "admin", displayName: "Owner" } as never);
  if (!viewer) throw new Error("expected an admin viewer");
  return viewer;
}

let phoneCounter = 0;
function capture(overrides: Partial<CaptureLeadInput> = {}, at = Date.now()) {
  phoneCounter += 1;
  const result = captureLead(
    { source: "admissions", studentName: "Synthetic Student", phone: `96500${String(phoneCounter).padStart(5, "0")}`, consent: { textVersion: "test-v1" }, ...overrides },
    at,
  );
  if (!result.ok) throw new Error("capture failed");
  return result;
}

type Request = { path: string; method: string; body?: unknown };
type Handler = (request: never, ctx: never) => Promise<Response>;
const send = (b: Browser, handler: Handler, request: Request, ctx?: unknown, options: { origin?: string | null } = {}) =>
  b.send(handler as never, request.path, { method: request.method, body: request.body, ...options }, ctx as never);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetCrmRateLimitersForTests();
  phoneCounter = 0;
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  resetDatabaseForTests();
});

describe("/api/crm/leads/[leadId]/details (§5.E)", () => {
  it("reads and saves for whoever sees the lead; 401 / 404 / 422 / 403 / 413 / 409 otherwise; no-store, noindex", async () => {
    const admin = await adminViewer();
    const exec = await staffUser("exec.one", "counsellor");
    const { leadId } = capture();
    expect(assignLead(admin, leadId, exec.id, Date.now()).ok).toBe(true);
    await staffUser("exec.two", "counsellor");

    const anonymous = await send(browser(), details.GET, familyRequests.details(leadId), params({ leadId }));
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("no-store");
    expect(anonymous.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const b = await signedIn("exec.one");
    const empty = await send(b, details.GET, familyRequests.details(leadId), params({ leadId }));
    expect(empty.status).toBe(200);
    expect((await empty.json()).data).toMatchObject({ altPhone: null, school: null, heardVia: null, updatedAt: null });

    const saved = await send(b, details.PUT, familyRequests.saveDetails(leadId, { altPhone: "96500 00099", heardVia: "google_maps", hostel: "maybe" }), params({ leadId }));
    expect(saved.status).toBe(200);
    expect((await saved.json()).data).toMatchObject({ altPhone: "+919650000099", heardVia: "google_maps", hostel: "maybe", updatedAt: new Date(T0).toISOString() });

    const same = await send(b, details.PUT, familyRequests.saveDetails(leadId, { altPhone: "9650000001" }), params({ leadId }));
    expect(same.status).toBe(422);
    expect((await same.json()).fieldErrors).toEqual({ altPhone: ["This is already the family's main number."] });
    expect((await send(b, details.PUT, { ...familyRequests.saveDetails(leadId, { school: "x" }), body: { school: "x", stage: "lost" } }, params({ leadId }))).status).toBe(422);
    expect((await send(b, details.PUT, { ...familyRequests.saveDetails(leadId, {}), body: {} }, params({ leadId }))).status).toBe(422);
    expect((await send(b, details.PUT, { ...familyRequests.saveDetails(leadId, {}), body: { board: "state" } }, params({ leadId }))).status).toBe(422);
    expect((await send(b, details.PUT, familyRequests.saveDetails(leadId, { school: "y" }), params({ leadId }), { origin: "https://evil.example" })).status).toBe(403);
    expect((await send(b, details.PUT, { ...familyRequests.saveDetails(leadId, {}), body: { school: "x".repeat(9 * 1024) } }, params({ leadId }))).status).toBe(413);

    const stranger = await signedIn("exec.two");
    const hidden = await send(stranger, details.GET, familyRequests.details(leadId), params({ leadId }));
    expect(hidden.status).toBe(404);
    expect(JSON.stringify(await hidden.json())).not.toContain("google_maps");
    expect((await send(stranger, details.PUT, familyRequests.saveDetails(leadId, { school: "z" }), params({ leadId }))).status).toBe(404);
    expect((await send(b, details.GET, { path: "/api/crm/leads/bad id/details", method: "GET" }, params({ leadId: "bad id" }))).status).toBe(400);
    // The GET carries the full second number, so each successful read is a recorded lead view (no values).
    const views = listAudit(getDb(), { limit: 50, target: leadId }).filter((entry) => entry.action === "crm.lead_view");
    expect(views.map((entry) => entry.actorId)).toEqual([exec.id]);
    expect(JSON.stringify(views)).not.toContain("9650000099");

    const audit = listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action === "crm.lead_details_update");
    expect(audit.map((entry) => entry.details)).toEqual([{ fields: "details.altPhone,details.hostel,details.heardVia" }]);

    expect(eraseLead(admin, leadId, Date.now()).ok).toBe(true);
    const sa = await signedIn("owner.sa");
    expect((await send(sa, details.PUT, familyRequests.saveDetails(leadId, { school: "z" }), params({ leadId }))).status).toBe(409);
    const kept = await send(sa, details.GET, familyRequests.details(leadId), params({ leadId }));
    expect((await kept.json()).data).toMatchObject({ altPhone: null, heardVia: "google_maps", hostel: "maybe" });
  });
});

describe("/api/crm/leads/[leadId]/duplicates (§5.F)", () => {
  it("suggests within scope only and dismisses a pair the viewer sees both sides of", async () => {
    const admin = await adminViewer();
    const exec = await staffUser("exec.one", "counsellor");
    const other = await staffUser("exec.two", "counsellor");
    const mine = capture().leadId;
    const alsoMine = capture().leadId;
    const theirs = capture().leadId;
    for (const [leadId, userId] of [
      [mine, exec.id],
      [alsoMine, exec.id],
      [theirs, other.id],
    ] as const) {
      expect(assignLead(admin, leadId, userId, Date.now()).ok).toBe(true);
    }
    const sa = await signedIn("owner.sa");
    // alsoMine's and theirs' second number is mine's main number.
    for (const leadId of [alsoMine, theirs]) {
      expect((await send(sa, details.PUT, familyRequests.saveDetails(leadId, { altPhone: "9650000001" }), params({ leadId }))).status).toBe(200);
    }
    const b = await signedIn("exec.one");
    const list = await send(b, duplicates.GET, familyRequests.duplicates(mine), params({ leadId: mine }));
    expect(list.status).toBe(200);
    const data = (await list.json()).data as { leadId: string; reasons: string[]; canDismiss: boolean }[];
    expect(data).toEqual([expect.objectContaining({ leadId: alsoMine, reasons: ["alt_is_main"], canDismiss: true })]);
    expect(JSON.stringify(data)).not.toContain(theirs);
    expect((await (await send(sa, duplicates.GET, familyRequests.duplicates(mine), params({ leadId: mine }))).json()).data).toHaveLength(2);

    expect((await send(b, duplicates.POST, familyRequests.dismissDuplicate(mine, theirs), params({ leadId: mine }))).status).toBe(404);
    expect((await send(b, duplicates.POST, { ...familyRequests.dismissDuplicate(mine, alsoMine), body: { otherLeadId: alsoMine, action: "merge" } }, params({ leadId: mine }))).status).toBe(422);
    expect((await send(b, duplicates.POST, familyRequests.dismissDuplicate(mine, alsoMine), params({ leadId: mine }), { origin: "https://evil.example" })).status).toBe(403);
    const dismissed = await send(b, duplicates.POST, familyRequests.dismissDuplicate(mine, alsoMine), params({ leadId: mine }));
    expect(dismissed.status).toBe(200);
    expect((await dismissed.json()).data).toEqual({ leadId: mine, otherLeadId: alsoMine, dismissed: true });
    expect((await (await send(b, duplicates.GET, familyRequests.duplicates(alsoMine), params({ leadId: alsoMine }))).json()).data).toEqual([]);
    expect(listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action === "crm.duplicate_dismiss").map((entry) => entry.details)).toEqual([{ otherLeadId: alsoMine }]);
  });
});

describe("/api/crm/lost-review (§5.H)", () => {
  it("lists for area heads and admins, refuses counsellors, keeps and reopens once", async () => {
    const admin = await adminViewer();
    await staffUser("exec.one", "counsellor");
    await staffUser("head.one", "manager", ["shimla"]);
    const shimla = capture({ centreSlug: "shimla" }, T0 - 9 * DAY).leadId;
    const kullu = capture({ centreSlug: "kullu" }, T0 - 9 * DAY).leadId;
    expect(changeStage(admin, shimla, "contacted", null, T0 - 5 * DAY).ok).toBe(true);
    expect(changeStage(admin, shimla, "lost", "fees", T0 - 2 * DAY).ok).toBe(true);
    expect(changeStage(admin, kullu, "lost", "not_interested", T0 - DAY).ok).toBe(true);

    const exec = await signedIn("exec.one");
    expect((await send(exec, lostList.GET, familyRequests.lostReview({ days: 14 }))).status).toBe(403);
    const lostAt = new Date(T0 - 2 * DAY).toISOString();
    expect((await send(exec, lostDecide.POST, familyRequests.keepLost(shimla, lostAt), params({ leadId: shimla }))).status).toBe(403);

    const head = await signedIn("head.one");
    const scoped = await send(head, lostList.GET, familyRequests.lostReview({ days: 14 }));
    expect(scoped.status).toBe(200);
    expect(scoped.headers.get("cache-control")).toBe("no-store");
    const report = (await scoped.json()).data;
    expect(report.items.map((item: { leadId: string }) => item.leadId)).toEqual([shimla]);
    expect(report.items[0]).toMatchObject({ lostAt, reason: "fees", fromStage: "contacted" });
    expect((await send(head, lostDecide.POST, familyRequests.keepLost(kullu, new Date(T0 - DAY).toISOString()), params({ leadId: kullu }))).status).toBe(404);

    const sa = await signedIn("owner.sa");
    expect((await (await send(sa, lostList.GET, familyRequests.lostReview({ days: 7 }))).json()).data.items).toHaveLength(2);
    const kept = await send(sa, lostDecide.POST, familyRequests.keepLost(kullu, new Date(T0 - DAY).toISOString()), params({ leadId: kullu }));
    expect(kept.status).toBe(200);
    expect((await send(sa, lostDecide.POST, familyRequests.keepLost(kullu, new Date(T0 - DAY).toISOString()), params({ leadId: kullu }))).status).toBe(409);

    const reopen = familyRequests.reopenLost(shimla, { lostAt, reopenTo: "contacted", assigneeId: null, followUp: { kind: "preset", preset: "tomorrow" } });
    expect((await send(head, lostDecide.POST, { ...reopen, body: { ...(reopen.body as object), reopenTo: "enrolled" } }, params({ leadId: shimla }))).status).toBe(422);
    const reopened = await send(head, lostDecide.POST, reopen, params({ leadId: shimla }));
    expect(reopened.status).toBe(200);
    expect((await reopened.json()).data).toMatchObject({ decision: "reopened", stage: "contacted", taskId: expect.any(String) });
    expect(getDb().prepare("SELECT stage FROM crm_leads WHERE id = ?").get(shimla)).toEqual({ stage: "contacted" });
    expect((await (await send(sa, lostList.GET, familyRequests.lostReview({ days: 14 }))).json()).data.items).toEqual([]);
    expect(
      listAudit(getDb(), { limit: 100 })
        .filter((entry) => entry.action === "crm.lost_review")
        .map((entry) => entry.details)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ).toEqual([{ decision: "kept" }, { decision: "reopened" }]);
  });
});
