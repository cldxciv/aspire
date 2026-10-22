import type { Role, Session } from "@/lib/auth/roles";
import { getDb } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { resolveCrmViewer } from "../access";
import { writeStaffMembership } from "../admin";
import { captureLead } from "../capture";
import type { CaptureLeadInput, CaptureLeadOptions, CrmRole, CrmViewer } from "../types";
import { IST_OFFSET_MS } from "./calling-hours";

/**
 * Shared set-up for LR-SLA's database tests (never imported by app code). Synthetic people and
 * numbers only. Call after `resetDatabaseForTests()` with `AUTH_DB_PATH=:memory:`.
 */

/** An instant given as an India (IST) wall-clock time. */
export function ist(day: string, time: string): number {
  return Date.parse(`${day}T${time}:00.000Z`) - IST_OFFSET_MS;
}

/** Wednesday 21 Oct 2026, 11:30 IST (inside the default calling hours). */
export const T0 = ist("2026-10-21", "11:30");
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

let counter = 0;

export function user(role: Role, loginId: string, now = T0) {
  counter += 1;
  return insertUser(getDb(), { role, loginId, displayName: `Person ${loginId}`, passwordHash: "scrypt$test", mustChangePassword: false, now });
}

/** A CRM staff member with an active membership (no centre scope). */
export function staff(loginId: string, crmRole: CrmRole) {
  const account = user("staff", loginId);
  writeStaffMembership(getDb(), account.id, account.id, { crmRole, centreSlugs: [], active: true }, T0);
  return account;
}

export function viewerOf(userId: string, role: Role, channel: "ui" | "mcp" = "ui"): CrmViewer {
  const viewer = resolveCrmViewer({ userId, role, displayName: "x" } as Session, getDb(), { channel });
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

/** A unique synthetic mobile number. */
export function phone(): string {
  counter += 1;
  return `95000${String(counter).padStart(5, "0")}`;
}

export function lead(overrides: Partial<CaptureLeadInput> = {}, now = T0, options: CaptureLeadOptions = {}) {
  const result = captureLead(
    { source: "admissions", studentName: "Test Student", phone: phone(), consent: { textVersion: "2026-10-20.v2" }, ...overrides },
    now,
    options,
  );
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result;
}

/** Every clock row of a lead (oldest first), raw. */
export function clocksOf(leadId: string) {
  return getDb()
    .prepare("SELECT * FROM crm_sla_clocks WHERE lead_id = ? ORDER BY id")
    .all(leadId)
    .map((row) => ({
      reason: String(row.reason),
      source: String(row.source),
      startedAt: Number(row.started_at),
      dueAt: Number(row.due_at),
      tier1At: row.tier1_at === null ? null : Number(row.tier1_at),
      tier2At: row.tier2_at === null ? null : Number(row.tier2_at),
      policyVersion: Number(row.policy_version),
      resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at),
      resolution: row.resolution === null ? null : String(row.resolution),
      firstAttemptAt: row.first_attempt_at === null ? null : Number(row.first_attempt_at),
      firstAttemptBy: row.first_attempt_by === null ? null : String(row.first_attempt_by),
      firstAttemptChannel: row.first_attempt_channel === null ? null : String(row.first_attempt_channel),
      assigneeAtDue: row.assignee_at_due === null ? null : String(row.assignee_at_due),
      workMs: row.work_ms === null ? null : Number(row.work_ms),
      met: row.met === null ? null : Number(row.met) === 1,
      attempts: Number(row.attempts),
      retriesCreated: Number(row.retries_created),
      reachedAt: row.reached_at === null ? null : Number(row.reached_at),
    }));
}

/** Open tasks of a lead, by due time. */
export function openTasksOf(leadId: string) {
  return getDb()
    .prepare("SELECT id, title, due_at, assignee_id, created_by FROM crm_tasks WHERE lead_id = ? AND done_at IS NULL ORDER BY due_at")
    .all(leadId)
    .map((row) => ({ id: String(row.id), title: String(row.title), dueAt: Number(row.due_at), assigneeId: row.assignee_id === null ? null : String(row.assignee_id), createdBy: row.created_by }));
}
