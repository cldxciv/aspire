import { createHmac } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { DEFAULT_META_CONFIG, type MetaConfig } from "../lead-ops-types";
import { classifyFetchFailure, classifyGraphError } from "./errors";
import { appSecretProof, createGraphClient, LEAD_FIELDS_BASIC, parseUsageHeaders, type GraphLead } from "./graph";
import { mapMetaLead } from "./mapping";
import { silentHoursOf, siteHostChanged } from "./status";
import { decideTestLead, TEST_LEAD_NAME, testModeActive, testModePatch } from "./test-mode";
import { isDashboardSample, leadgenChanges, quoteBigIds, verifyHandshake, verifySignature } from "./webhook";
import {
  CONSENT_KEY,
  fakeGraph,
  fixtureJson,
  fixtureText,
  FORM_ID,
  guardGlobalFetch,
  LEAD_ID,
  PAGE_ID,
  reply,
  sign,
  TEST_ACCESS_TOKEN,
  TEST_APP_SECRET,
  TEST_CENTRES,
  unicodeEscapedBody,
} from "./fixtures/meta-kit";

// Pure parts of LR-META (docs/lead-routing-plan.md §18): handshake, signature, id quoting, the
// Graph client (injected fetch only), error classes, mapping and test mode. No database.
const restoreFetch = guardGlobalFetch();
afterAll(restoreFetch);

const config = (patch: Partial<MetaConfig> = {}): MetaConfig => ({
  ...DEFAULT_META_CONFIG,
  enabled: true,
  pageId: PAGE_ID,
  forms: [{ id: FORM_ID, name: "NEET Kangra Oct", status: "ACTIVE", defaults: { programInterest: "jee", centreSlug: "dharamshala" }, consentCheckboxKey: CONSENT_KEY }],
  ...patch,
});

describe("webhook handshake (§18.1)", () => {
  const params = (input: Record<string, string>) => new URLSearchParams(input);
  it("answers the challenge only for subscribe + the right token", () => {
    expect(verifyHandshake(params({ "hub.mode": "subscribe", "hub.verify_token": "right-token-123", "hub.challenge": "1158201444" }), "right-token-123")).toEqual({
      ok: true,
      challenge: "1158201444",
    });
  });
  it("refuses a wrong token, another mode, or no stored token (403)", () => {
    expect(verifyHandshake(params({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "1" }), "right-token-123")).toEqual({ ok: false, status: 403 });
    expect(verifyHandshake(params({ "hub.mode": "unsubscribe", "hub.verify_token": "right-token-123", "hub.challenge": "1" }), "right-token-123")).toEqual({
      ok: false,
      status: 403,
    });
    expect(verifyHandshake(params({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1" }), null)).toEqual({ ok: false, status: 403 });
  });
  it("refuses a malformed challenge (400), never echoing markup", () => {
    for (const challenge of ["<script>alert(1)</script>", "", "a".repeat(129), "12 34"]) {
      expect(verifyHandshake(params({ "hub.mode": "subscribe", "hub.verify_token": "right-token-123", "hub.challenge": challenge }), "right-token-123")).toEqual({
        ok: false,
        status: 400,
      });
    }
  });
});

describe("webhook signature over the raw bytes (§18.2)", () => {
  const encoder = new TextEncoder();
  it("accepts Meta's signature over the exact bytes, including a unicode-escaped body", () => {
    for (const body of [fixtureText("webhook-docs.json"), unicodeEscapedBody()]) {
      expect(verifySignature(encoder.encode(body), sign(body), TEST_APP_SECRET)).toBe(true);
    }
  });
  it("fails when the body was re-serialised (escapes turned into characters) or tampered with", () => {
    const body = unicodeEscapedBody();
    const reserialised = JSON.stringify(JSON.parse(body));
    expect(reserialised).not.toBe(body);
    expect(verifySignature(encoder.encode(reserialised), sign(body), TEST_APP_SECRET)).toBe(false);
    expect(verifySignature(encoder.encode(body.replace("12345678901234568", "12345678901234569")), sign(body), TEST_APP_SECRET)).toBe(false);
    expect(verifySignature(encoder.encode(body), sign(body, "another-secret-0000000000000000"), TEST_APP_SECRET)).toBe(false);
  });
  it("rejects a missing or malformed header", () => {
    const body = encoder.encode(fixtureText("webhook-docs.json"));
    const hex = createHmac("sha256", TEST_APP_SECRET).update(body).digest("hex");
    for (const header of [null, "", hex, `sha1=${hex}`, `sha256=${hex.toUpperCase()}`, `sha256=${hex.slice(2)}`, `sha256=${hex} `]) {
      expect(verifySignature(body, header, TEST_APP_SECRET), String(header)).toBe(false);
    }
  });
});

describe("parsing deliveries", () => {
  it("quotes large numeric ids so no digit is lost", () => {
    const raw = fixtureText("webhook-docs.json");
    expect(String((JSON.parse(raw) as { entry: { changes: { value: { leadgen_id: number } }[] }[] }).entry[0].changes[0].value.leadgen_id)).not.toBe(LEAD_ID);
    const [change] = leadgenChanges(JSON.parse(quoteBigIds(raw)));
    expect(change).toMatchObject({ leadgenId: LEAD_ID, pageId: PAGE_ID, formId: FORM_ID, adId: "120200000000000001", adgroupId: "120200000000000003", createdAt: 1792046730000 });
  });
  it("detects Meta's all-4s dashboard sample", () => {
    const [sample] = leadgenChanges(JSON.parse(quoteBigIds(fixtureText("webhook-sample.json"))));
    expect(isDashboardSample(sample)).toBe(true);
    const [real] = leadgenChanges(JSON.parse(quoteBigIds(fixtureText("webhook-docs.json"))));
    expect(isDashboardSample(real)).toBe(false);
  });
  it("ignores other objects, fields and malformed changes", () => {
    expect(leadgenChanges({ object: "user", entry: [] })).toEqual([]);
    expect(leadgenChanges({ object: "page", entry: [{ changes: [{ field: "feed", value: { leadgen_id: "12345678901234567" } }, { field: "leadgen", value: { leadgen_id: "x1" } }, null] }] })).toEqual([]);
    expect(leadgenChanges(null)).toEqual([]);
  });
});

describe("Graph client (§18.6)", () => {
  it("sends the token in the Authorization header with appsecret_proof, never in the URL", async () => {
    const graph = fakeGraph({ [`GET ${LEAD_ID}`]: { body: fixtureJson("lead-full.json") } });
    const client = createGraphClient({ fetchImpl: graph.fetchImpl, appSecret: TEST_APP_SECRET });
    const result = await client.request<GraphLead>("GET", LEAD_ID, { fields: LEAD_FIELDS_BASIC }, TEST_ACCESS_TOKEN);
    expect(result.ok).toBe(true);
    const [call] = graph.calls;
    expect(call.version).toBe("v26.0");
    expect(call.authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(call.params.get("access_token")).toBeNull();
    expect(call.params.get("appsecret_proof")).toBe(createHmac("sha256", TEST_APP_SECRET).update(TEST_ACCESS_TOKEN).digest("hex"));
    expect(call.params.get("appsecret_proof")).toBe(appSecretProof(TEST_APP_SECRET, TEST_ACCESS_TOKEN));
  });
  it("falls back to the query form once on 2500 and remembers it", async () => {
    const graph = fakeGraph({ [`GET ${LEAD_ID}`]: (call) => (call.authorization ? reply("error-2500.json") : { body: fixtureJson("lead-full.json") }) });
    const onTokenTransport = vi.fn();
    const client = createGraphClient({ fetchImpl: graph.fetchImpl, appSecret: TEST_APP_SECRET, onTokenTransport });
    expect((await client.request("GET", LEAD_ID, {}, TEST_ACCESS_TOKEN)).ok).toBe(true);
    expect(graph.calls).toHaveLength(2);
    expect(graph.calls[1].params.get("access_token")).toBe(TEST_ACCESS_TOKEN);
    expect(graph.calls[1].params.get("appsecret_proof")).toBe(appSecretProof(TEST_APP_SECRET, TEST_ACCESS_TOKEN));
    expect(onTokenTransport).toHaveBeenCalledWith("query");
    expect(client.transport).toBe("query");
    await client.request("GET", LEAD_ID, {}, TEST_ACCESS_TOKEN);
    expect(graph.calls).toHaveLength(3);
    expect(graph.calls[2].authorization).toBeNull();
  });
  it("uses a valid pinned version and refuses odd paths", async () => {
    const graph = fakeGraph({ "GET *": { body: { ok: true } } });
    expect(createGraphClient({ fetchImpl: graph.fetchImpl, appSecret: TEST_APP_SECRET, version: "latest" }).version).toBe("v26.0");
    expect(createGraphClient({ fetchImpl: graph.fetchImpl, appSecret: TEST_APP_SECRET, version: "v25.0" }).version).toBe("v25.0");
    const result = await createGraphClient({ fetchImpl: graph.fetchImpl, appSecret: TEST_APP_SECRET }).request("GET", "../me", {}, TEST_ACCESS_TOKEN);
    expect(result.ok).toBe(false);
    expect(graph.calls).toHaveLength(0);
  });
  it("turns a thrown fetch into a retry (network / timeout)", async () => {
    for (const throws of ["network", "timeout"] as const) {
      const graph = fakeGraph({ "GET *": { throws } });
      const result = await createGraphClient({ fetchImpl: graph.fetchImpl, appSecret: TEST_APP_SECRET }).request("GET", LEAD_ID, {}, TEST_ACCESS_TOKEN);
      expect(result.ok ? null : result.error).toMatchObject({ kind: "retry", reason: throws });
    }
    expect(classifyFetchFailure(new TypeError("x")).reason).toBe("network");
  });
  it("reads the usage headers (80005 with the business-use-case header)", () => {
    const usage = parseUsageHeaders(
      new Headers({
        "x-app-usage": JSON.stringify({ call_count: 12, total_time: 5, total_cputime: 3 }),
        "x-business-use-case-usage": JSON.stringify({ [PAGE_ID]: [{ type: "leadgen", call_count: 96, total_cputime: 10, total_time: 10, estimated_time_to_regain_access: 7 }] }),
      }),
    );
    expect(usage).toEqual({ maxPercent: 96, regainAccessMs: 7 * 60_000 });
    expect(parseUsageHeaders(new Headers({ "x-app-usage": "not json" }))).toEqual({ maxPercent: 0, regainAccessMs: null });
  });
});

describe("error classes (§18.4, M6)", () => {
  const classify = (name: string, status = 400, retryAfterMs: number | null = null) => classifyGraphError({ status, body: fixtureJson(name), retryAfterMs });
  it("classifies every fixture by code and subcode", () => {
    expect(classify("error-190.json")).toMatchObject({ kind: "pause_auth", code: 190, reason: "graph_190" });
    expect(classify("error-4.json")).toMatchObject({ kind: "retry", code: 4 });
    expect(classify("error-80005.json", 400, 420_000)).toMatchObject({ kind: "retry", code: 80005, retryAfterMs: 420_000 });
    expect(classify("error-100-field.json")).toMatchObject({ kind: "downgrade_fields", code: 100 });
    expect(classify("error-100-33.json")).toMatchObject({ kind: "unavailable", code: 100, subcode: 33, reason: "graph_100_33" });
    expect(classify("error-200.json", 403)).toMatchObject({ kind: "permission", code: 200 });
    expect(classify("error-2500.json")).toMatchObject({ kind: "token_transport", code: 2500 });
  });
  it("retries 5xx without a Graph error; unknown codes are fatal with a fixed reason", () => {
    expect(classifyGraphError({ status: 503, body: null })).toMatchObject({ kind: "retry", reason: "http_503" });
    expect(classifyGraphError({ status: 400, body: { error: { code: 1234, error_subcode: 5, message: "secret text" } } })).toEqual({
      kind: "fatal",
      code: 1234,
      subcode: 5,
      reason: "graph_1234_5",
    });
    for (const code of [1, 2, 17, 32, 341, 613, 80001]) expect(classifyGraphError({ status: 400, body: { error: { code } } }).kind).toBe("retry");
    for (const code of [10, 283]) expect(classifyGraphError({ status: 400, body: { error: { code } } }).kind).toBe("permission");
  });
});

describe("mapping a Graph lead (§18.3)", () => {
  const lead = () => fixtureJson<GraphLead>("lead-full.json");
  it("maps names, the +91 phone, the district question over Facebook's city, class, course, parent and form defaults", () => {
    const mapped = mapMetaLead(lead(), { config: config(), centres: TEST_CENTRES });
    expect(mapped.input).toMatchObject({
      source: "meta_lead_ad",
      contactName: "Test Parent One",
      phone: "+919812345670",
      district: "Kangra",
      submittedBy: "parent",
      currentClass: "class-11",
      programInterest: "neet",
      centreSlug: "dharamshala",
      consent: { textVersion: `meta:${FORM_ID}:cb`, at: Date.parse("2026-10-21T04:45:30Z"), method: "meta_lead_form" },
      context: { utmSource: "instagram", utmMedium: "lead_ad", utmCampaign: "NEET 2027 Admissions", utmContent: "NEET Kangra Oct", utmTerm: "Parents 35-55 Kangra" },
    });
    expect(mapped.answers).toBe("best time to call: Evening");
    expect(mapped.submissionMeta).toMatchObject({ consentConfirmed: true, formId: FORM_ID, adId: "120200000000000001", campaignId: "120200000000000002", metaCreatedAt: "2026-10-21T04:45:30.000Z" });
    expect(mapped.dummy).toBe(false);
  });
  it("uses city when there is no district question; a super admin's field map wins over the guess", () => {
    const withoutDistrict = { ...lead(), field_data: lead().field_data?.filter((field) => field.name !== "which_district_do_you_live_in?") };
    expect(mapMetaLead(withoutDistrict, { config: config(), centres: TEST_CENTRES }).input.district).toBe("Chandigarh");
    const mapped = mapMetaLead(lead(), { config: config({ fieldMap: { full_name: "studentName", best_time_to_call: "ignore" } }), centres: TEST_CENTRES });
    expect(mapped.input.studentName).toBe("Test Parent One");
    expect(mapped.input.contactName).toBeNull();
    expect(mapped.answers).toBeNull();
  });
  it("versions consent without the checkbox (ticked off, or no key configured)", () => {
    const unticked = { ...lead(), custom_disclaimer_responses: [{ checkbox_key: CONSENT_KEY, is_checked: "0" }] };
    const a = mapMetaLead(unticked, { config: config(), centres: TEST_CENTRES });
    expect(a.input.consent.textVersion).toBe(`meta:${FORM_ID}`);
    expect(a.submissionMeta.consentConfirmed).toBe(false);
    const noKey = config({ forms: [{ id: FORM_ID, name: "x", status: "ACTIVE", defaults: {}, consentCheckboxKey: null }] });
    expect(mapMetaLead(lead(), { config: noKey, centres: TEST_CENTRES }).input.consent.textVersion).toBe(`meta:${FORM_ID}`);
  });
  it("keeps answers a normaliser cannot read, and spots dummy test data", () => {
    const odd = { ...lead(), field_data: [...(lead().field_data ?? []).filter((field) => field.name !== "which_course?"), { name: "which_course?", values: ["Both JEE and NEET"] }] };
    const mapped = mapMetaLead(odd, { config: config(), centres: TEST_CENTRES });
    expect(mapped.input.programInterest).toBe("jee"); // the form default fills the blank
    expect(mapped.answers).toContain("which course?: Both JEE and NEET");
    expect(mapMetaLead(fixtureJson<GraphLead>("lead-dummy.json"), { config: config(), centres: TEST_CENTRES }).dummy).toBe(true);
  });
});

describe("test mode (§18.7, A14)", () => {
  const now = Date.parse("2026-10-22T10:00:00Z");
  const on = config({ ...testModePatch({ on: true, phone: "98123 45679" }, now) });
  it("is on for 24 hours with a valid own number; off clears both", () => {
    expect(on.testPhone).toBe("+919812345679");
    expect(testModeActive(on, now + 23 * 3_600_000)).toBe(true);
    expect(testModeActive(on, now + 24 * 3_600_000 + 1)).toBe(false);
    expect(testModePatch({ on: true, phone: "12345" }, now)).toBeNull();
    expect(testModePatch({ on: false }, now)).toEqual({ acceptTestLeadsUntil: null, testPhone: null });
  });
  it("captures a dummy lead as the TEST lead with the owner's number; outside test mode it is dropped", () => {
    const dummy = mapMetaLead(fixtureJson<GraphLead>("lead-dummy.json"), { config: on, centres: TEST_CENTRES });
    const decision = decideTestLead(dummy, on, now);
    expect(decision.kind).toBe("capture");
    if (decision.kind !== "capture") return;
    expect(decision.lead.input).toMatchObject({ contactName: TEST_LEAD_NAME, phone: "+919812345679", studentName: null, email: null });
    expect(decision.lead.submissionMeta.test).toBe(true);
    expect(decision.lead.answers).toBeNull();
    expect(decideTestLead(dummy, config(), now).kind).toBe("drop");
  });
  it("treats a real lead with the owner's number as a test lead, others as real", () => {
    const own = mapMetaLead({ ...fixtureJson<GraphLead>("lead-full.json"), field_data: [{ name: "phone_number", values: ["+919812345679"] }] }, { config: on, centres: TEST_CENTRES });
    expect(decideTestLead(own, on, now).kind).toBe("capture");
    const other = mapMetaLead(fixtureJson<GraphLead>("lead-full.json"), { config: on, centres: TEST_CENTRES });
    expect(decideTestLead(other, on, now).kind).toBe("real");
  });
});

describe("status helpers (§18.5, Part 2 step 3)", () => {
  const now = Date.parse("2026-10-22T10:00:00Z");
  const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const on = { enabled: true, silenceAlertHours: 48 };
  it("counts silence from the last import, else from when the settings were saved (never imported)", () => {
    expect(silentHoursOf(on, { lastImportAt: hoursAgo(50) }, now)).toBe(50);
    expect(silentHoursOf(on, { lastImportAt: hoursAgo(47) }, now, hoursAgo(80))).toBeNull();
    expect(silentHoursOf(on, { lastImportAt: null }, now, hoursAgo(72))).toBe(72);
    expect(silentHoursOf(on, { lastImportAt: null }, now, hoursAgo(10))).toBeNull();
    expect(silentHoursOf(on, { lastImportAt: null }, now)).toBeNull();
    expect(silentHoursOf({ enabled: false, silenceAlertHours: 48 }, { lastImportAt: null }, now, hoursAgo(72))).toBeNull();
    expect(silentHoursOf({ enabled: true, silenceAlertHours: 0 }, { lastImportAt: hoursAgo(500) }, now)).toBeNull();
  });
  it("warns about a changed site address on the host name only (scheme and a loopback record prove nothing)", () => {
    const site = "https://aspire.thechunkmedia.com";
    expect(siteHostChanged("https://aspire.thechunkmedia.com", site)).toBe(false);
    expect(siteHostChanged("http://aspire.thechunkmedia.com", site)).toBe(false);
    expect(siteHostChanged("http://127.0.0.1:3011", site)).toBe(false);
    expect(siteHostChanged("http://localhost:3011", site)).toBe(false);
    expect(siteHostChanged("https://old.example.org", site)).toBe(true);
    expect(siteHostChanged(null, site)).toBe(false);
    expect(siteHostChanged("https://old.example.org", "")).toBe(false);
    expect(siteHostChanged("not a url", site)).toBe(false);
  });
});
