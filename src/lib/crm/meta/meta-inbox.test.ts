import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LR-META against a fresh in-memory database per test (docs/lead-routing-plan.md §18): webhook
// deliveries → inbox → Graph (an INJECTED fake; the global fetch is guarded) → CORE's captureLead.
// The routing / SLA seams are test-defined (fixtures/seams.ts) so nothing depends on a sibling
// package's answers (P5). Synthetic people and ids only.
vi.mock("@/lib/crm/routing", async (original) => ({ ...(await original<object>()), ...(await import("./fixtures/seams")).routingSeam() }));
vi.mock("@/lib/crm/sla", async (original) => ({ ...(await original<object>()), ...(await import("./fixtures/seams")).slaSeam() }));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { insertUser } = await import("@/lib/db/users");
const { listAudit } = await import("@/lib/db/audit");
const { captureLead } = await import("@/lib/crm/capture");
const { eraseLead } = await import("@/lib/crm/admin");
const { insertActivity } = await import("@/lib/crm/repo/activities");
const { updateLead } = await import("@/lib/crm/repo/leads");
const { hasExternalRef } = await import("@/lib/crm/repo/intake");
const { claimInboxRow, findInboxRow, insertInboxRow } = await import("@/lib/crm/repo/meta");
const { getMetaConfig } = await import("@/lib/crm/settings");
const routing = await import("@/lib/crm/routing");
const sla = await import("@/lib/crm/sla");
const { metaSecretStates, readMetaSecret, storeMetaSecret } = await import("./config");
const { handleWebhookDelivery } = await import("./webhook");
const { backoffMs, processMetaInbox, resetMetaInboxStateForTests } = await import("./inbox");
const { runMetaHousekeeping, resetMetaHousekeepingForTests } = await import("./housekeeping");
const { readMetaStatus } = await import("./status");
const { reconcileMetaLeads } = await import("./sync");
const { runMetaAction } = await import("./actions");
const { createKicker, kickMetaProcessing, resetMetaKickForTests } = await import("./index");
const { LEAD_FIELDS_BASIC } = await import("./graph");
const { TEST_LEAD_NAME } = await import("./test-mode");
const kit = await import("./fixtures/meta-kit");
const { CONSENT_KEY, FORM_ID, LEAD_ID, PAGE_ID, TEST_CENTRES, TEST_INTEGRATIONS_SECRET, configureMeta, deliveryBody, fakeGraph, fixtureJson, fixtureText, leadBody, reply, sign } = kit;

const restoreFetch = kit.guardGlobalFetch();
afterAll(() => {
  restoreFetch();
  expect(kit.globalFetchCalls.count).toBe(0);
});

const T0 = Date.parse("2026-10-22T04:30:00Z"); // 10:00 IST
const MIN = 60_000;
const HOUR = 60 * MIN;
let clock = T0;

type Graph = ReturnType<typeof fakeGraph>;
const runtime = (graph: Graph, random = () => 0) => ({ fetchImpl: graph.fetchImpl, now: () => clock, random, centres: async () => TEST_CENTRES });
const runInbox = (graph: Graph, options: { limit?: number; force?: boolean } = {}) => processMetaInbox({ runtime: runtime(graph), ...options });
const leadRoute = (body: unknown = fixtureJson("lead-full.json")) => ({ [`GET ${LEAD_ID}`]: { body } });

function deliver(body: string, at = clock) {
  return handleWebhookDelivery(getDb(), { raw: new TextEncoder().encode(body), signature: sign(body), now: at });
}

const count = (sql: string, ...params: (string | number)[]) => Number(getDb().prepare(sql).get(...params)?.n ?? 0);

let adminId = "";

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("INTEGRATIONS_SECRET", TEST_INTEGRATIONS_SECRET);
  vi.stubEnv("INTEGRATIONS_SECRET_PREVIOUS", "");
  resetDatabaseForTests();
  resetMetaInboxStateForTests();
  resetMetaHousekeepingForTests();
  vi.clearAllMocks();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
  clock = T0;
  adminId = insertUser(getDb(), { role: "admin", loginId: "admin.meta", displayName: "Admin Meta", passwordHash: "scrypt$test", mustChangePassword: false, now: T0 }).id;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("webhook deliveries → inbox (§18.2)", () => {
  it("queues a signed delivery once; a redelivery adds nothing", () => {
    configureMeta(getDb());
    const body = fixtureText("webhook-docs.json");
    expect(deliver(body)).toEqual({ ok: true, counts: { queued: 1, held: 0, duplicates: 0, ignored: 0, samples: 0 } });
    expect(deliver(body)).toEqual({ ok: true, counts: { queued: 0, held: 0, duplicates: 1, ignored: 0, samples: 0 } });
    expect(findInboxRow(getDb(), LEAD_ID)).toMatchObject({ status: "pending", via: "webhook", pageId: PAGE_ID, formId: FORM_ID, receivedAt: T0, metaCreatedAt: 1792046730000 });
    expect(readMetaStatus(getDb()).lastWebhookAt).toBe(new Date(T0).toISOString());
  });

  it("detects Meta's sample BEFORE the page filter, ignores a foreign page, skips an imported id", () => {
    configureMeta(getDb());
    expect(deliver(fixtureText("webhook-sample.json"))).toMatchObject({ ok: true, counts: { samples: 1, ignored: 0, queued: 0 } });
    expect(readMetaStatus(getDb()).lastTestAt).toBe(new Date(T0).toISOString());
    expect(deliver(fixtureText("webhook-foreign-page.json"))).toMatchObject({ ok: true, counts: { ignored: 1, queued: 0 } });
    getDb().prepare("INSERT INTO crm_external_refs (provider, external_id, lead_id, created_at) VALUES ('meta', ?, NULL, ?)").run(LEAD_ID, T0);
    expect(deliver(fixtureText("webhook-docs.json"))).toMatchObject({ ok: true, counts: { duplicates: 1, queued: 0 } });
    expect(count("SELECT COUNT(*) AS n FROM crm_meta_inbox")).toBe(0);
  });

  it("holds ids (still accepted) while the integration is off or has no token; they become pending once ready", async () => {
    configureMeta(getDb(), { enabled: false });
    expect(deliver(fixtureText("webhook-docs.json"))).toMatchObject({ ok: true, counts: { held: 1 } });
    getDb().prepare("DELETE FROM crm_meta_inbox").run();
    configureMeta(getDb(), { token: false });
    getDb().prepare("DELETE FROM crm_integration_secrets WHERE name = 'access_token'").run();
    expect(deliver(fixtureText("webhook-docs.json"))).toMatchObject({ ok: true, counts: { held: 1 } });
    const { releaseHeldIfReady } = await import("./config");
    expect(releaseHeldIfReady(getDb(), clock)).toBe(0);
    storeMetaSecret(getDb(), "access_token", kit.TEST_ACCESS_TOKEN, { actorId: null, now: clock, audit: false });
    expect(releaseHeldIfReady(getDb(), clock)).toBe(1);
    expect(findInboxRow(getDb(), LEAD_ID)?.status).toBe("pending");
  });

  it("refuses everything without an app secret (503) or with a bad signature (401, recorded)", () => {
    configureMeta(getDb(), { appSecret: false });
    expect(deliver(fixtureText("webhook-docs.json"))).toMatchObject({ ok: false, status: 503 });
    configureMeta(getDb());
    const body = fixtureText("webhook-docs.json");
    const result = handleWebhookDelivery(getDb(), { raw: new TextEncoder().encode(body.replace("1792046730", "1792046731")), signature: sign(body), now: clock });
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(readMetaStatus(getDb()).lastSignatureFailureAt).toBe(new Date(clock).toISOString());
    expect(count("SELECT COUNT(*) AS n FROM crm_meta_inbox")).toBe(0);
    // Unauthenticated junk is recorded at most once a minute (no write lock per request).
    const junk = (at: number) => handleWebhookDelivery(getDb(), { raw: new TextEncoder().encode("{}"), signature: null, now: at });
    const version = () => Number(getDb().prepare("SELECT version FROM crm_settings WHERE key = 'meta_status'").get()?.version);
    const before = version();
    expect(junk(clock + 30_000)).toMatchObject({ ok: false, status: 401 });
    expect(version()).toBe(before);
    expect(readMetaStatus(getDb()).lastSignatureFailureAt).toBe(new Date(clock).toISOString());
    expect(junk(clock + 61_000)).toMatchObject({ ok: false, status: 401 });
    expect(readMetaStatus(getDb()).lastSignatureFailureAt).toBe(new Date(clock + 61_000).toISOString());
  });
});

describe("processing the inbox (§18.3)", () => {
  it("fetches once and captures one lead: mapping, consent with the checkbox, arrivedAt = received_at", async () => {
    configureMeta(getDb());
    deliver(fixtureText("webhook-docs.json"));
    deliver(fixtureText("webhook-docs.json"));
    clock = T0 + 5 * MIN;
    const graph = fakeGraph(leadRoute());
    const report = await runInbox(graph);
    expect(report).toMatchObject({ processed: 1, imported: 1, failed: 0, skipped: null });
    expect(graph.calls).toHaveLength(1);
    const lead = getDb().prepare("SELECT * FROM crm_leads").get() as Record<string, unknown>;
    expect(lead).toMatchObject({
      source: "meta_lead_ad",
      contact_name: "Test Parent One",
      phone_e164: "+919812345670",
      current_class: "class-11",
      program_interest: "neet",
      centre_slug: "dharamshala",
      consent_text_version: `meta:${FORM_ID}:cb`,
      consent_at: Date.parse("2026-10-21T04:45:30Z"),
      utm_source: "instagram",
      utm_medium: "lead_ad",
    });
    expect(count("SELECT COUNT(*) AS n FROM crm_leads")).toBe(1);
    expect(hasExternalRef(getDb(), "meta", LEAD_ID)).toBe(true);
    expect(findInboxRow(getDb(), LEAD_ID)).toMatchObject({ status: "imported", leadId: lead.id, processedAt: clock });
    expect(vi.mocked(routing.routeLead).mock.calls[0][2]).toMatchObject({ districtInput: "Kangra" });
    expect(vi.mocked(sla.startSlaClock).mock.calls[0][1]).toMatchObject({ source: "meta_lead_ad", arrivedAt: T0, at: clock, reason: "new" });
    expect(readMetaStatus(getDb()).lastImportAt).toBe(new Date(clock).toISOString());
    // The id is known now: a later redelivery is not even queued, and a second run fetches nothing.
    expect(deliver(fixtureText("webhook-docs.json"))).toMatchObject({ counts: { duplicates: 1, queued: 0 } });
    await runInbox(graph);
    expect(graph.calls).toHaveLength(1);
  });

  it("an id queued while a run is busy is not stranded: the busy run takes another pass", async () => {
    configureMeta(getDb());
    const [first, second] = ["700000000000001", "700000000000002"];
    deliver(deliveryBody([first]));
    const graph = fakeGraph({ "GET *": (call) => ({ body: leadBody({ id: call.path, phone: call.path === first ? "+919812345671" : "+919812345672" }) }) });
    let busy: Awaited<ReturnType<typeof processMetaInbox>> | null = null;
    // The webhook for `second` (and its after() run) lands while the first run waits on Graph.
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (busy === null) {
        expect(deliver(deliveryBody([second]))).toMatchObject({ ok: true, counts: { queued: 1 } });
        busy = await processMetaInbox({ runtime: runtime(graph) });
      }
      return graph.fetchImpl(input, init);
    }) as typeof fetch;
    const report = await processMetaInbox({ runtime: { ...runtime(graph), fetchImpl } });
    expect(busy).toMatchObject({ skipped: "busy", processed: 0 });
    expect(report).toMatchObject({ processed: 2, imported: 2, skipped: null });
    expect(findInboxRow(getDb(), first)?.status).toBe("imported");
    expect(findInboxRow(getDb(), second)?.status).toBe("imported");
    // Nothing asked for another pass: a later run is a single pass with nothing due.
    expect(await runInbox(graph)).toMatchObject({ processed: 0, skipped: null });
  });

  it("checks the refs again right before the Graph call (an id imported meanwhile is never fetched)", async () => {
    configureMeta(getDb());
    deliver(fixtureText("webhook-docs.json"));
    getDb().prepare("INSERT INTO crm_external_refs (provider, external_id, lead_id, created_at) VALUES ('meta', ?, NULL, ?)").run(LEAD_ID, T0);
    const graph = fakeGraph(leadRoute());
    expect(await runInbox(graph)).toMatchObject({ duplicates: 1, imported: 0 });
    expect(graph.calls).toHaveLength(0);
  });

  it("the lease lets only one worker hold a row; a stale lease can be taken over", async () => {
    configureMeta(getDb());
    deliver(fixtureText("webhook-docs.json"));
    expect(claimInboxRow(getDb(), LEAD_ID, clock, 60_000)).toBe(true);
    expect(claimInboxRow(getDb(), LEAD_ID, clock + 1000, 60_000)).toBe(false);
    expect(claimInboxRow(getDb(), LEAD_ID, clock + 61_000, 60_000)).toBe(true);
    // And one process at a time: a second run while the first waits on Graph is skipped.
    getDb().prepare("UPDATE crm_meta_inbox SET status = 'pending', lease_until = NULL").run();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const graph = fakeGraph(leadRoute());
    const slowFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      await gate;
      return graph.fetchImpl(input, init);
    };
    const slow = { ...runtime(graph), fetchImpl: slowFetch as typeof fetch };
    const first = processMetaInbox({ runtime: slow });
    expect(await processMetaInbox({ runtime: slow })).toMatchObject({ skipped: "busy", processed: 0 });
    release();
    expect(await first).toMatchObject({ imported: 1 });
    expect(count("SELECT COUNT(*) AS n FROM crm_leads")).toBe(1);
  });

  it("retries with backoff min(2^attempts, 360) minutes + jitter, honours Meta's wait, fails after 10 tries", async () => {
    expect([1, 2, 3, 8, 9, 10].map((attempts) => backoffMs(attempts, () => 0) / MIN)).toEqual([2, 4, 8, 256, 360, 360]);
    expect(backoffMs(1, () => 1)).toBe(2 * MIN + 30_000);
    configureMeta(getDb());
    deliver(fixtureText("webhook-docs.json"));
    await runInbox(fakeGraph({ [`GET ${LEAD_ID}`]: reply("error-4.json") }));
    expect(findInboxRow(getDb(), LEAD_ID)).toMatchObject({ status: "pending", attempts: 1, nextAttemptAt: clock + 2 * MIN, lastError: "graph_4", leaseUntil: null });
    clock += 2 * MIN;
    const buc = { "x-business-use-case-usage": JSON.stringify({ [PAGE_ID]: [{ type: "leadgen", call_count: 50, estimated_time_to_regain_access: 30 }] }) };
    await runInbox(fakeGraph({ [`GET ${LEAD_ID}`]: reply("error-80005.json", 400, buc) }));
    expect(findInboxRow(getDb(), LEAD_ID)).toMatchObject({ attempts: 2, nextAttemptAt: clock + 30 * MIN, lastError: "graph_80005" });
    getDb().prepare("UPDATE crm_meta_inbox SET attempts = 9, next_attempt_at = ?").run(clock);
    await runInbox(fakeGraph({ [`GET ${LEAD_ID}`]: { status: 503, body: null } }));
    expect(findInboxRow(getDb(), LEAD_ID)).toMatchObject({ status: "failed", attempts: 10, lastError: "http_503" });
  });

  it("slows down at ≥ 90 % usage: the run stops after the current item", async () => {
    configureMeta(getDb());
    deliver(deliveryBody([LEAD_ID, "12345678901234580"]));
    const busy = { "x-app-usage": JSON.stringify({ call_count: 93 }) };
    const graph = fakeGraph({ "GET *": (call) => ({ body: leadBody({ id: call.path, phone: call.path === LEAD_ID ? "+919812345670" : "+919812345671" }), headers: busy }) });
    expect(await runInbox(graph)).toMatchObject({ imported: 1, throttled: true });
    expect(graph.calls).toHaveLength(1);
  });

  it("pauses the whole queue on 190 (items stay pending), until a forced run", async () => {
    configureMeta(getDb());
    deliver(deliveryBody([LEAD_ID, "12345678901234580"]));
    const expired = fakeGraph({ "GET *": reply("error-190.json") });
    expect(await runInbox(expired)).toMatchObject({ paused: "auth", processed: 1 });
    expect(expired.calls).toHaveLength(1);
    expect(readMetaStatus(getDb())).toMatchObject({ paused: "auth", lastErrorCode: "graph_190" });
    expect(findInboxRow(getDb(), LEAD_ID)).toMatchObject({ status: "pending", attempts: 0 });
    expect(await runInbox(expired)).toMatchObject({ skipped: "paused", paused: "auth" });
    const fixed = fakeGraph({ "GET *": (call) => ({ body: leadBody({ id: call.path, phone: call.path === LEAD_ID ? "+919812345670" : "+919812345671" }) }) });
    expect(await runInbox(fixed, { force: true })).toMatchObject({ imported: 2 });
    expect(readMetaStatus(getDb()).paused).toBeNull();
  });

  it("pauses on permission errors only after 5 DIFFERENT leads in a row", async () => {
    configureMeta(getDb());
    deliver(deliveryBody([LEAD_ID]));
    const denied = fakeGraph({ "GET *": reply("error-200.json", 403) });
    for (let run = 0; run < 6; run += 1) {
      await runInbox(denied);
      clock += 400 * MIN;
    }
    expect(readMetaStatus(getDb()).paused).toBeNull();
    expect(findInboxRow(getDb(), LEAD_ID)).toMatchObject({ status: "pending", attempts: 6, lastError: "graph_200" });
    const ids = ["12345678901234581", "12345678901234582", "12345678901234583", "12345678901234584"];
    deliver(deliveryBody(ids));
    const report = await runInbox(denied);
    expect(report.paused).toBe("permission");
    expect(readMetaStatus(getDb())).toMatchObject({ paused: "permission", consecutivePermissionFailures: 5 });
  });

  it("marks a deleted / missing lead (100/33) unavailable after 3 tries, without pausing", async () => {
    configureMeta(getDb());
    deliver(fixtureText("webhook-docs.json"));
    const gone = fakeGraph({ [`GET ${LEAD_ID}`]: reply("error-100-33.json") });
    for (let run = 0; run < 3; run += 1) {
      await runInbox(gone);
      clock += 30 * MIN;
    }
    expect(findInboxRow(getDb(), LEAD_ID)).toMatchObject({ status: "unavailable", attempts: 3, lastError: "graph_100_33" });
    expect(readMetaStatus(getDb()).paused).toBeNull();
  });

  it("falls back to the basic fields for 24 h on 'nonexisting field', keeping the consent responses", async () => {
    configureMeta(getDb());
    deliver(fixtureText("webhook-docs.json"));
    const basic = { ...leadBody(), ad_name: undefined, adset_name: undefined, campaign_name: undefined, campaign_id: undefined, platform: undefined, is_organic: undefined };
    const graph = fakeGraph({ [`GET ${LEAD_ID}`]: (call) => (call.params.get("fields")?.includes("ad_name") ? reply("error-100-field.json") : { body: basic }) });
    expect(await runInbox(graph)).toMatchObject({ imported: 1 });
    expect(graph.calls.map((call) => call.params.get("fields"))).toEqual([expect.stringContaining("ad_name"), LEAD_FIELDS_BASIC]);
    expect(LEAD_FIELDS_BASIC).toContain("custom_disclaimer_responses");
    expect(readMetaStatus(getDb()).fieldsMode).toEqual({ mode: "basic", until: new Date(clock + 24 * HOUR).toISOString() });
    expect(getDb().prepare("SELECT consent_text_version AS v FROM crm_leads").get()).toEqual({ v: `meta:${FORM_ID}:cb` });
  });

  it("switches to the query token form when Graph refuses the header (2500) and remembers it", async () => {
    configureMeta(getDb());
    deliver(fixtureText("webhook-docs.json"));
    const graph = fakeGraph({ [`GET ${LEAD_ID}`]: (call) => (call.authorization ? reply("error-2500.json") : { body: leadBody() }) });
    expect(await runInbox(graph)).toMatchObject({ imported: 1 });
    expect(getMetaConfig(getDb()).value.tokenTransport).toBe("query");
    expect(graph.calls[1].params.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("attaches (never reopens) when the Meta lead is older than the family's lost decision (H3)", async () => {
    configureMeta(getDb());
    const site = captureLead(
      { source: "contact", contactName: "Test Parent One", phone: "+919812345670", consent: { textVersion: "contact-v2" } },
      Date.parse("2026-10-15T04:30:00Z"),
    );
    expect(site.ok).toBe(true);
    const leadId = site.ok ? site.leadId : "";
    const lostAt = Date.parse("2026-10-22T00:00:00Z");
    updateLead(getDb(), leadId, { stage: "lost", lostReason: "not_interested", updatedAt: lostAt });
    insertActivity(getDb(), { leadId, type: "stage_change", meta: { from: "new", to: "lost" }, actorId: adminId, at: lostAt });
    vi.mocked(sla.startSlaClock).mockClear();
    deliver(fixtureText("webhook-docs.json"));
    expect(await runInbox(fakeGraph(leadRoute()))).toMatchObject({ imported: 1 });
    expect(getDb().prepare("SELECT stage, consent_text_version AS v FROM crm_leads WHERE id = ?").get(leadId)).toEqual({ stage: "lost", v: "contact-v2" });
    const last = getDb().prepare("SELECT meta FROM crm_activities WHERE lead_id = ? AND type = 'submission' ORDER BY id DESC").get(leadId) as { meta: string };
    expect(JSON.parse(last.meta)).toMatchObject({ attached: true, consentConfirmed: true, formId: FORM_ID });
    expect(vi.mocked(sla.startSlaClock)).not.toHaveBeenCalled();
  });

  it("ignores an erased family and drops the fetched answers at once (M5)", async () => {
    configureMeta(getDb());
    const site = captureLead({ source: "contact", contactName: "Test Parent One", phone: "+919812345670", consent: { textVersion: "contact-v2" } }, T0 - 10 * 24 * HOUR);
    const leadId = site.ok ? site.leadId : "";
    expect(eraseLead({ userId: adminId, displayName: "Admin", role: "admin", centreSlugs: [] }, leadId, Date.parse("2026-10-22T00:00:00Z")).ok).toBe(true);
    deliver(fixtureText("webhook-docs.json"));
    expect(await runInbox(fakeGraph(leadRoute()))).toMatchObject({ ignored: 1, imported: 0 });
    expect(findInboxRow(getDb(), LEAD_ID)).toMatchObject({ status: "ignored", lastError: "erased_family", leadId: null });
    expect(count("SELECT COUNT(*) AS n FROM crm_leads WHERE erased_at IS NULL")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM crm_activities WHERE body LIKE '%Evening%' OR meta LIKE '%Kangra%'")).toBe(0);
    expect(hasExternalRef(getDb(), "meta", LEAD_ID)).toBe(false);
  });

  it("fails an invalid phone with a fixed code and keeps the Meta id for the super admin", async () => {
    configureMeta(getDb());
    deliver(fixtureText("webhook-docs.json"));
    await runInbox(fakeGraph(leadRoute(leadBody({ phone: "12345" }))));
    expect(findInboxRow(getDb(), LEAD_ID)).toMatchObject({ status: "failed", lastError: "invalid_phone" });
    expect(count("SELECT COUNT(*) AS n FROM crm_leads")).toBe(0);
  });
});

describe("test leads (§18.7, A14)", () => {
  it("notes a dummy lead outside test mode without storing it", async () => {
    configureMeta(getDb());
    deliver(deliveryBody(["12345678901234570"]));
    expect(await runInbox(fakeGraph({ "GET 12345678901234570": { body: fixtureJson("lead-dummy.json") } }))).toMatchObject({ tests: 1, imported: 0 });
    expect(findInboxRow(getDb(), "12345678901234570")?.status).toBe("test");
    expect(count("SELECT COUNT(*) AS n FROM crm_leads")).toBe(0);
    expect(readMetaStatus(getDb()).lastTestAt).toBe(new Date(clock).toISOString());
  });

  it("captures the dummy lead as the TEST lead with the owner's number, then erases it after 24 h (actor null)", async () => {
    configureMeta(getDb());
    const viewer = { userId: adminId, displayName: "Admin", role: "admin" as const, centreSlugs: [], superAdmin: true };
    const graph = fakeGraph({ "GET 12345678901234570": { body: fixtureJson("lead-dummy.json") } });
    expect(await runMetaAction(viewer, { action: "test_mode", on: true, phone: "9812345679" }, { runtime: runtime(graph) })).toMatchObject({ ok: true, result: { testMode: { active: true } } });
    deliver(deliveryBody(["12345678901234570"]));
    expect(await runInbox(graph)).toMatchObject({ imported: 1 });
    const lead = getDb().prepare("SELECT id, contact_name AS name, phone_e164 AS phone FROM crm_leads").get() as { id: string; name: string; phone: string };
    expect(lead).toMatchObject({ name: TEST_LEAD_NAME, phone: "+919812345679" });
    expect(vi.mocked(sla.startSlaClock)).toHaveBeenCalledTimes(1);
    expect(runMetaHousekeeping(getDb(), clock + 23 * HOUR, { force: true }).testLeadsErased).toBe(0);
    expect(runMetaHousekeeping(getDb(), clock + 25 * HOUR, { force: true }).testLeadsErased).toBe(1);
    expect(getDb().prepare("SELECT erased_by AS by, phone_e164 AS phone FROM crm_leads WHERE id = ?").get(lead.id)).toEqual({ by: null, phone: null });
    const erase = listAudit(getDb(), { limit: 20 }).find((entry) => entry.action === "crm.lead_erase");
    expect(erase).toMatchObject({ actorId: null, target: lead.id, details: { reason: "wrong_or_test" } });
    // The owner's own test number is never written to the erase suppressions.
    expect(erase?.details).not.toHaveProperty("suppressed");
    expect(count("SELECT COUNT(*) AS n FROM crm_erase_suppressions")).toBe(0);
  });
});

describe("housekeeping (§18.5)", () => {
  it("deletes finished rows after 30 days and failed ones after 90", () => {
    const db = getDb();
    for (const [id, status, age] of [
      ["10000000000000001", "imported", 31],
      ["10000000000000002", "duplicate", 29],
      ["10000000000000003", "failed", 60],
      ["10000000000000004", "unavailable", 91],
    ] as const) {
      insertInboxRow(db, { leadgenId: id, via: "webhook", status: "pending", now: clock });
      db.prepare("UPDATE crm_meta_inbox SET status = ?, processed_at = ? WHERE leadgen_id = ?").run(status, clock - age * 24 * HOUR, id);
    }
    expect(runMetaHousekeeping(db, clock, { force: true }).deleted).toBe(2);
    expect(db.prepare("SELECT leadgen_id AS id FROM crm_meta_inbox ORDER BY leadgen_id").all()).toEqual([{ id: "10000000000000002" }, { id: "10000000000000003" }]);
  });
});

describe("reconciliation and actions", () => {
  it("bulk-reads id,created_time only since 7 days (first run) and queues new ids via sync", async () => {
    configureMeta(getDb());
    getDb().prepare("INSERT INTO crm_external_refs (provider, external_id, lead_id, created_at) VALUES ('meta', '12345678901234571', NULL, ?)").run(T0);
    const graph = fakeGraph({ [`GET ${FORM_ID}/leads`]: { body: fixtureJson("form-leads.json") } });
    expect(await reconcileMetaLeads({ runtime: runtime(graph) })).toEqual({ ok: true, code: null, enqueued: 1, paused: null });
    const [call] = graph.calls;
    expect(call.params.get("fields")).toBe("id,created_time");
    expect(JSON.parse(call.params.get("filtering") ?? "[]")).toEqual([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor((T0 - 7 * 24 * HOUR) / 1000) }]);
    expect(findInboxRow(getDb(), "12345678901234572")).toMatchObject({ via: "sync", status: "pending", formId: FORM_ID });
    expect(readMetaStatus(getDb()).lastSyncAt).toBe(new Date(T0).toISOString());
  });

  it("check: debug_token with the app token, seals the Page token, reads the subscription; audited by action only", async () => {
    configureMeta(getDb());
    const graph = fakeGraph({
      "GET debug_token": { body: fixtureJson("debug-token.json") },
      [`GET ${PAGE_ID}`]: { body: fixtureJson("page-token.json") },
      [`GET ${PAGE_ID}/subscribed_apps`]: { body: fixtureJson("subscribed-apps.json") },
    });
    const viewer = { userId: adminId, displayName: "Admin", role: "admin" as const, centreSlugs: [], superAdmin: true };
    const outcome = await runMetaAction(viewer, { action: "check" }, { runtime: runtime(graph) });
    expect(outcome).toMatchObject({ ok: true, result: { action: "check", ok: true } });
    expect(graph.calls[0].authorization).toBe(`Bearer ${kit.APP_ID}|${kit.TEST_APP_SECRET}`);
    expect(graph.calls[0].params.get("input_token")).toBe(kit.TEST_ACCESS_TOKEN);
    expect(graph.calls[2].authorization).toBe("Bearer EAAsyntheticPageTokenForTestsOnly0123456789");
    expect(readMetaSecret(getDb(), "page_token")).toEqual({ ok: true, value: "EAAsyntheticPageTokenForTestsOnly0123456789" });
    expect(readMetaStatus(getDb())).toMatchObject({ pageSubscribed: true, tokenInfo: { type: "SYSTEM_USER", expiresAt: null } });
    const audit = listAudit(getDb(), { limit: 10 }).find((entry) => entry.action === "crm.meta_action");
    expect(audit).toMatchObject({ actorId: adminId, details: { action: "check", ok: true } });
    expect(JSON.stringify(listAudit(getDb(), { limit: 50 }))).not.toContain("EAAsynthetic");
  });

  it("subscribe_page posts leadgen with the Page token; sync_forms keeps a super admin's choices", async () => {
    configureMeta(getDb());
    storeMetaSecret(getDb(), "page_token", "EAAsyntheticPageTokenForTestsOnly0123456789", { actorId: null, now: clock, audit: false });
    const graph = fakeGraph({ [`POST ${PAGE_ID}/subscribed_apps`]: { body: { success: true } }, [`GET ${PAGE_ID}/leadgen_forms`]: { body: fixtureJson("forms.json") } });
    const viewer = { userId: adminId, displayName: "Admin", role: "admin" as const, centreSlugs: [], superAdmin: true };
    expect(await runMetaAction(viewer, { action: "subscribe_page" }, { runtime: runtime(graph) })).toMatchObject({ result: { ok: true } });
    expect(graph.calls[0].params.get("subscribed_fields")).toBe("leadgen");
    expect(await runMetaAction(viewer, { action: "sync_forms" }, { runtime: runtime(graph) })).toMatchObject({ result: { ok: true, forms: 2 } });
    const config = getMetaConfig(getDb()).value;
    expect(config.forms.find((form) => form.id === FORM_ID)).toMatchObject({ consentCheckboxKey: CONSENT_KEY, defaults: { centreSlug: "dharamshala" } });
    expect(config.fieldMap).toMatchObject({ full_name: "contactName", "which_district_do_you_live_in?": "district", best_time_to_call: "answer" });
  });
});

describe("secrets (§18.7, L2, L4)", () => {
  it("are sealed, never returned (states only), and audited with { slot } that survives the sanitiser", () => {
    storeMetaSecret(getDb(), "access_token", kit.TEST_ACCESS_TOKEN, { actorId: adminId, now: clock });
    const raw = getDb().prepare("SELECT sealed FROM crm_integration_secrets WHERE name = 'access_token'").get() as { sealed: string };
    expect(raw.sealed).toMatch(/^v1\./);
    expect(raw.sealed).not.toContain(kit.TEST_ACCESS_TOKEN);
    const states = metaSecretStates(getDb());
    expect(states.access_token).toEqual({ set: true, updatedAt: new Date(clock).toISOString(), updatedBy: adminId, keyOk: "current" });
    expect(JSON.stringify(states)).not.toContain(kit.TEST_ACCESS_TOKEN);
    expect(listAudit(getDb(), { limit: 5 })[0]).toMatchObject({ action: "crm.meta_secret_set", details: { slot: "access_token" } });
  });
});

describe("opportunistic trigger (§18.5)", () => {
  it("runs at most once a minute per process; manual bypasses; never throws", async () => {
    let now = 0;
    const run = vi.fn(async () => undefined);
    const kick = createKicker(run, { intervalMs: 60_000, now: () => now });
    kick("summary");
    kick("status");
    now = 59_999;
    kick("summary");
    expect(run).toHaveBeenCalledTimes(1);
    now = 60_000;
    kick("summary");
    kick("manual");
    expect(run).toHaveBeenCalledTimes(3);
    const failing = createKicker(
      () => {
        throw new Error("boom");
      },
      { intervalMs: 60_000, now: () => now },
    );
    expect(() => failing("summary")).not.toThrow();
    const rejecting = createKicker(async () => Promise.reject(new Error("boom")), { intervalMs: 60_000, now: () => now });
    expect(() => rejecting("summary")).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("the seam never throws and does nothing while Meta is switched off", async () => {
    resetMetaKickForTests();
    expect(() => kickMetaProcessing("summary")).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(kit.globalFetchCalls.count).toBe(0);
  });
});
