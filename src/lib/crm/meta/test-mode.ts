/**
 * Meta test leads (docs/lead-routing-plan.md §18.7, A14) — pure. While `acceptTestLeadsUntil` is in
 * the future, a Testing Tool dummy lead — and any Meta lead whose phone equals `testPhone` (the
 * super admin's own mobile) — is captured as "TEST – Meta test lead" with `testPhone`, tagged
 * `submissionMeta.test = true`, routed and timed like a real lead, and erased after 24 hours
 * (./housekeeping.ts). Outside test mode a dummy lead is only noted ("sample received"), never stored.
 */
import type { MetaConfig } from "../lead-ops-types";
import { normalizePhoneE164 } from "../pure";
import type { MappedMetaLead } from "./mapping";
import { META_TEST_MODE_HOURS } from "./types";

export const TEST_LEAD_NAME = "TEST – Meta test lead";
export const TEST_MODE_MS = META_TEST_MODE_HOURS * 60 * 60 * 1000;

export function testModeActive(config: Pick<MetaConfig, "acceptTestLeadsUntil" | "testPhone">, now: number): boolean {
  if (!config.acceptTestLeadsUntil || !config.testPhone) return false;
  const until = Date.parse(config.acceptTestLeadsUntil);
  return Number.isFinite(until) && until > now;
}

export type TestDecision =
  /** An ordinary lead: capture as mapped. */
  | { kind: "real" }
  /** Dummy data outside test mode: record "test lead received", store nothing. */
  | { kind: "drop" }
  /** Capture this instead (test mode). */
  | { kind: "capture"; lead: MappedMetaLead };

export function decideTestLead(mapped: MappedMetaLead, config: Pick<MetaConfig, "acceptTestLeadsUntil" | "testPhone">, now: number): TestDecision {
  const active = testModeActive(config, now);
  const testPhone = active ? normalizePhoneE164(config.testPhone) : null;
  const ownNumber = testPhone !== null && normalizePhoneE164(mapped.input.phone) === testPhone;
  if (!mapped.dummy && !ownNumber) return { kind: "real" };
  if (!active || !testPhone) return mapped.dummy ? { kind: "drop" } : { kind: "real" };
  return {
    kind: "capture",
    lead: {
      ...mapped,
      input: {
        ...mapped.input,
        contactName: TEST_LEAD_NAME,
        studentName: null,
        guardianName: null,
        email: null,
        phone: testPhone,
      },
      // Dummy answers are Meta's placeholders, not a family's words.
      answers: mapped.dummy ? null : mapped.answers,
      submissionMeta: { ...mapped.submissionMeta, test: true },
    },
  };
}

/** The config change for the `test_mode` action: on for 24 h with a phone, or off. Null phone when invalid. */
export function testModePatch(input: { on: boolean; phone?: string | null }, now: number): { acceptTestLeadsUntil: string | null; testPhone: string | null } | null {
  if (!input.on) return { acceptTestLeadsUntil: null, testPhone: null };
  const phone = normalizePhoneE164(input.phone ?? "");
  if (!phone) return null;
  return { acceptTestLeadsUntil: new Date(now + TEST_MODE_MS).toISOString(), testPhone: phone };
}
