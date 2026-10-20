import { describe, expect, it } from "vitest";

import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { CONSENT_VERSION, enquirySchema } from "@/lib/contracts/enquiry";
import { CONSENT_TEXTS, LEAD_GATE_CONSENT_TEXTS, leadGateConsentRecord } from "@/lib/server/enquiry-consent";

import { parseLeadGateConfig } from "./config";
import {
  isImplausibleMobile,
  LEAD_GATE_CONSENT_VERSION,
  LEAD_GATE_CONSENT_VERSIONS,
  LEAD_GATE_ERRORS,
  leadGateSubmitSchema,
  leadGateUsageSchema,
  mockScoreBand,
} from "./contract";
import { gatePhoneKey, ipBucket, LeadFloodBreaker } from "./limits";
import { generatePassId, hashPassId, signPassToken, verifyPassToken } from "./token";

const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const VALID = {
  studentName: "Test Student",
  phone: "98100 12345",
  currentClass: "class-11",
  submittedBy: "parent",
  consent: true,
  consentVersion: LEAD_GATE_CONSENT_VERSION,
  tool: "predictor",
};

function fieldErrors(input: Record<string, unknown>) {
  const result = leadGateSubmitSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

describe("pass token (signed cookie value)", () => {
  it("round-trips: id, hash and expiry come back for the right secret before expiry", () => {
    const passId = generatePassId();
    expect(passId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const token = signPassToken(SECRET, passId, NOW + 180 * DAY);
    expect(token).toMatch(/^lg1\.[A-Za-z0-9_-]{43}\.\d{10}\.[A-Za-z0-9_-]{43}$/);
    expect(verifyPassToken(SECRET, token, NOW)).toEqual({ passId, passHash: hashPassId(passId), expiresAt: NOW + 180 * DAY });
  });

  it("stores only a hash: it differs from the id and is stable", () => {
    const passId = generatePassId();
    expect(hashPassId(passId)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPassId(passId)).toBe(hashPassId(passId));
    expect(hashPassId(passId)).not.toContain(passId);
    expect(generatePassId()).not.toBe(passId);
  });

  it("rejects expiry, a wrong secret, and any tampering", () => {
    const passId = generatePassId();
    const token = signPassToken(SECRET, passId, NOW + DAY);
    expect(verifyPassToken(SECRET, token, NOW + DAY)).toBeNull(); // expired at the instant
    expect(verifyPassToken(SECRET, token, NOW + 2 * DAY)).toBeNull();
    expect(verifyPassToken(`${SECRET}x`, token, NOW)).toBeNull();
    expect(verifyPassToken(null, token, NOW)).toBeNull();

    const [version, id, seconds, signature] = token.split(".");
    const otherId = generatePassId();
    expect(verifyPassToken(SECRET, [version, otherId, seconds, signature].join("."), NOW)).toBeNull();
    expect(verifyPassToken(SECRET, [version, id, String(Number(seconds) + 3600), signature].join("."), NOW)).toBeNull();
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    expect(verifyPassToken(SECRET, [version, id, seconds, flipped].join("."), NOW)).toBeNull();
    expect(verifyPassToken(SECRET, ["lg2", id, seconds, signature].join("."), NOW)).toBeNull();
  });

  it("rejects malformed values without throwing", () => {
    for (const value of [undefined, null, 42, "", "lg1", "lg1...", "a".repeat(500), `lg1.${"a".repeat(43)}.12.${"b".repeat(43)}`]) {
      expect(verifyPassToken(SECRET, value, NOW)).toBeNull();
    }
  });
});

describe("contract: POST /api/lead-gate body", () => {
  it("accepts a complete submission and normalises the phone", () => {
    const result = leadGateSubmitSchema.safeParse({ ...VALID, context: { page: "/tools/predictor" }, website: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("9810012345");
  });

  it("gives one message per invalid field", () => {
    expect(fieldErrors({ ...VALID, studentName: "A" })).toEqual({ studentName: LEAD_GATE_ERRORS.studentName });
    expect(fieldErrors({ ...VALID, studentName: "A".repeat(81) })).toEqual({ studentName: LEAD_GATE_ERRORS.studentNameTooLong });
    expect(fieldErrors({ ...VALID, phone: "12345" })).toEqual({ phone: LEAD_GATE_ERRORS.phone });
    expect(fieldErrors({ ...VALID, phone: "9876543210" })).toEqual({ phone: LEAD_GATE_ERRORS.phoneImplausible });
    expect(fieldErrors({ ...VALID, currentClass: "class-13" })).toEqual({ currentClass: LEAD_GATE_ERRORS.currentClass });
    expect(fieldErrors({ ...VALID, submittedBy: "teacher" })).toEqual({ submittedBy: LEAD_GATE_ERRORS.submittedBy });
    expect(fieldErrors({ ...VALID, consent: false })).toEqual({ consent: LEAD_GATE_ERRORS.consent });
    expect(fieldErrors({ ...VALID, tool: "results" })).toEqual({ tool: LEAD_GATE_ERRORS.tool });
  });

  it("accepts only the gate's consent versions; the enquiry endpoint accepts only its own (no cross-use)", () => {
    expect(fieldErrors({ ...VALID, consentVersion: CONSENT_VERSION })).toEqual({ consentVersion: LEAD_GATE_ERRORS.consentVersion });
    expect(fieldErrors({ ...VALID, consentVersion: undefined })).toEqual({ consentVersion: LEAD_GATE_ERRORS.consentVersion });
    const enquiry = enquirySchema.safeParse({
      source: "contact",
      name: "Test Parent",
      phone: "9810012345",
      topic: "admissions",
      consent: true,
      consentVersion: LEAD_GATE_CONSENT_VERSION,
    });
    expect(enquiry.success).toBe(false);
    expect(Object.keys(CONSENT_TEXTS)).not.toContain(LEAD_GATE_CONSENT_VERSION);
  });

  it("an attribution context that is not an object is dropped, never a 422", () => {
    const result = leadGateSubmitSchema.safeParse({ ...VALID, context: "nope" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.context).toBeUndefined();
  });

  it("flags obviously fake numbers only", () => {
    for (const fake of ["9999999999", "+91 99999 99999", "9876543210", "9123456789", "6789012345", "8765432109", "09012345678"]) {
      expect(isImplausibleMobile(fake), fake).toBe(true);
    }
    for (const real of ["9810012345", "9876501234", "7000012345", "9898989898", "123"]) {
      expect(isImplausibleMobile(real), real).toBe(false);
    }
  });
});

describe("contract: POST /api/lead-gate/usage body", () => {
  it("accepts the predictor's exam + band and the planner's exam (band dropped)", () => {
    expect(leadGateUsageSchema.parse({ tool: "predictor", exam: "jee-main", band: "score-180-189", page: "/tools/predictor" })).toEqual({
      tool: "predictor",
      exam: "jee-main",
      band: "score-180-189",
      page: "/tools/predictor",
    });
    expect(leadGateUsageSchema.parse({ tool: "planner", exam: "neet", band: "score-1-2" }).band).toBeUndefined();
  });

  it("refuses tools recorded by their own server routes, and anything that is not a summary", () => {
    for (const body of [
      { tool: "ask", exam: "jee-main" },
      { tool: "mock-test", exam: "jee-main" },
      { tool: "predictor", exam: "JEE Main" },
      { tool: "predictor", exam: "jee-main", band: "187" },
    ]) {
      expect(leadGateUsageSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it("mock-test score bands: 10-point buckets of the maximum, never the score", () => {
    expect(mockScoreBand(0, 300)).toBe("pct-0-9");
    expect(mockScoreBand(29.97, 300)).toBe("pct-0-9"); // 9.99 %
    expect(mockScoreBand(30, 300)).toBe("pct-10-19");
    expect(mockScoreBand(140, 300)).toBe("pct-40-49");
    expect(mockScoreBand(299, 300)).toBe("pct-90-100");
    expect(mockScoreBand(300, 300)).toBe("pct-90-100");
    expect(mockScoreBand(-12, 300)).toBe("pct-below-0"); // negative marking
    expect(mockScoreBand(10, 0)).toBeNull();
    expect(mockScoreBand(Number.NaN, 300)).toBeNull();
  });
});

describe("configuration (runtime env only)", () => {
  const ON = { LEAD_GATE: "required", LEAD_GATE_SECRET: SECRET, NODE_ENV: "production" };

  it("is off unless LEAD_GATE asks for it", () => {
    expect(parseLeadGateConfig({}, { sampleData: false })).toMatchObject({ mode: "off", offReason: "unset" });
    expect(parseLeadGateConfig({ LEAD_GATE: "loud" }, { sampleData: false })).toMatchObject({
      mode: "off",
      warnings: ["lead_gate_mode_unknown"],
    });
    expect(parseLeadGateConfig(ON, { sampleData: false })).toMatchObject({ mode: "required", offReason: null, recordUse: "all", assignNew: true });
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE: "optional" }, { sampleData: false }).mode).toBe("optional");
  });

  it("is forced off while sample data is shown (unless explicitly allowed), with no lead store, or with no secret in production", () => {
    expect(parseLeadGateConfig(ON, { sampleData: true })).toMatchObject({ mode: "off", offReason: "sample_data" });
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_ALLOW_SAMPLE_DATA: "true" }, { sampleData: true }).mode).toBe("required");
    expect(parseLeadGateConfig({ ...ON, ENQUIRY_STORE: "off" }, { sampleData: false })).toMatchObject({ mode: "off", offReason: "store_off" });
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_SECRET: "" }, { sampleData: false })).toMatchObject({
      mode: "off",
      offReason: "no_secret",
      secret: null,
      warnings: ["lead_gate_secret_missing"],
    });
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_SECRET: "short" }, { sampleData: false })).toMatchObject({
      mode: "off",
      warnings: ["lead_gate_secret_too_short"],
    });
  });

  it("outside production a missing secret falls back to a per-process key (local QA), with a warning", () => {
    const config = parseLeadGateConfig({ LEAD_GATE: "required", NODE_ENV: "development" }, { sampleData: false });
    expect(config.mode).toBe("required");
    expect(config.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(config.warnings).toEqual(["lead_gate_secret_dev_fallback"]);
    expect(parseLeadGateConfig({ LEAD_GATE: "required", NODE_ENV: "development" }, { sampleData: false }).secret).toBe(config.secret);
  });

  it("keeps the secret when off (so old passes can still be forgotten) and parses the other switches", () => {
    expect(parseLeadGateConfig({ LEAD_GATE_SECRET: SECRET }, { sampleData: false })).toMatchObject({ mode: "off", secret: SECRET, warnings: [] });
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_RECORD_USE: "parent" }, { sampleData: false }).recordUse).toBe("parent");
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_RECORD_USE: "off" }, { sampleData: false }).recordUse).toBe("off");
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_RECORD_USE: "everything" }, { sampleData: false })).toMatchObject({
      recordUse: "off",
      warnings: ["lead_gate_record_use_unknown"],
    });
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_ASSIGN: "none" }, { sampleData: false }).assignNew).toBe(false);
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_MAX_NEW_LEADS_PER_HOUR: "25" }, { sampleData: false }).maxNewLeadsPerHour).toBe(25);
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_MAX_NEW_LEADS_PER_HOUR: "-1" }, { sampleData: false }).maxNewLeadsPerHour).toBe(300);
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_SINCE: "2026-11-01T00:00:00+05:30" }, { sampleData: false }).since).toBe(
      Date.UTC(2026, 9, 31, 18, 30, 0),
    );
    expect(parseLeadGateConfig({ ...ON, LEAD_GATE_SINCE: "soon" }, { sampleData: false }).since).toBeNull();
    expect(parseLeadGateConfig(ON, { sampleData: false }).since).toBeNull();
  });
});

describe("limits", () => {
  it("buckets IPv6 per /64 and leaves IPv4 alone", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("2401:4900:1c2a:3b4c:aaaa:bbbb:cccc:dddd")).toBe("2401:4900:1c2a:3b4c::/64");
    expect(ipBucket("2401:4900:1c2a:3b4c:1111:2222:3333:4444")).toBe("2401:4900:1c2a:3b4c::/64");
    expect(ipBucket("2401:4900::1")).toBe("2401:4900:0000:0000::/64");
    expect(ipBucket("2401:4900:1c2a::abcd")).toBe("2401:4900:1c2a:0000::/64");
    expect(ipBucket("::1")).toBe("0000:0000:0000:0000::/64");
    expect(ipBucket("::ffff:198.51.100.4")).toBe("198.51.100.4");
    expect(ipBucket("unknown")).toBe("unknown");
  });

  it("keys phones by hash, separately from the enquiry cap", () => {
    expect(gatePhoneKey("+919810012345")).toMatch(/^[0-9a-f]{32}$/);
    expect(gatePhoneKey("+919810012345")).not.toContain("9810012345");
  });

  it("the flood breaker trips at its hourly ceiling and recovers as the hour rolls on", () => {
    const breaker = new LeadFloodBreaker();
    for (let i = 0; i < 3; i += 1) breaker.record(NOW + i);
    expect(breaker.tripped(NOW + 10, 3)).toBe(true);
    expect(breaker.tripped(NOW + 10, 4)).toBe(false);
    expect(breaker.tripped(NOW + 60 * 60 * 1000 + 5, 3)).toBe(false);
  });
});

describe("consent registry (D-039) and the leadGate messages", () => {
  it.each(["en", "hi"] as const)("%s: the sentence the gate shows is exactly the stored text of LEAD_GATE_CONSENT_VERSION", (locale) => {
    const t = messagesFor(locale, "leadGate");
    expect(format(t.consent, { link: t.consentLink })).toBe(LEAD_GATE_CONSENT_TEXTS[LEAD_GATE_CONSENT_VERSION][locale]);
  });

  it("has both languages for every accepted version and discloses contact + tool notes", () => {
    for (const version of LEAD_GATE_CONSENT_VERSIONS) {
      expect(LEAD_GATE_CONSENT_TEXTS[version].en).toMatch(/parent or guardian/);
      expect(LEAD_GATE_CONSENT_TEXTS[version].en).toMatch(/phone or WhatsApp/);
      expect(LEAD_GATE_CONSENT_TEXTS[version].en).toMatch(/note which free tools are used/);
      expect(LEAD_GATE_CONSENT_TEXTS[version].en).not.toMatch(/email/i);
      expect(LEAD_GATE_CONSENT_TEXTS[version].hi).toMatch(/[ऀ-ॿ]/);
    }
    expect(leadGateConsentRecord(LEAD_GATE_CONSENT_VERSION, "hi", new Date(NOW))).toEqual({
      version: LEAD_GATE_CONSENT_VERSION,
      locale: "hi",
      text: LEAD_GATE_CONSENT_TEXTS[LEAD_GATE_CONSENT_VERSION].hi,
      givenAt: new Date(NOW).toISOString(),
    });
  });

  it("the English field errors repeat the contract's messages word for word", () => {
    const t = messagesFor("en", "leadGate").errors;
    for (const key of ["studentName", "studentNameTooLong", "phone", "phoneImplausible", "currentClass", "submittedBy", "consent"] as const) {
      expect(t[key], key).toBe(LEAD_GATE_ERRORS[key]);
    }
  });

  function leaves(value: unknown, prefix = ""): Map<string, unknown> {
    const out = new Map<string, unknown>();
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        for (const [path, leaf] of leaves(child, prefix ? `${prefix}.${key}` : key)) out.set(path, leaf);
      }
    } else out.set(prefix, value);
    return out;
  }

  it("Hindi has exactly the English keys, all non-empty, same placeholders, in Devanagari", () => {
    const en = leaves(messagesFor("en", "leadGate"));
    const hi = leaves(messagesFor("hi", "leadGate"));
    expect([...hi.keys()].sort()).toEqual([...en.keys()].sort());
    const placeholders = (text: unknown) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of hi) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(en.get(key)));
    }
    expect(messagesFor("hi", "leadGate").heading).toMatch(/[ऀ-ॿ]/);
  });

  it("never promises verification, never says an OTP is sent, and names the doubt solver Rancho", () => {
    for (const locale of ["en", "hi"] as const) {
      const all = [...leaves(messagesFor(locale, "leadGate")).values()].join(" \n ");
      expect(all).not.toMatch(/verif|we (have )?sent|OTP sent|Ask Aspire/i);
    }
    expect(messagesFor("en", "leadGate").submit.ask).toBe("Ask Rancho");
  });
});
