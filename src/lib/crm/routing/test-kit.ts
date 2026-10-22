import type { Role, Session } from "@/lib/auth/roles";
import { getDb } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { resolveCrmViewer } from "../access";
import { writeStaffMembership } from "../admin";
import { captureLead } from "../capture";
import type { CaptureLeadInput, CaptureLeadOptions, CrmRole, CrmViewer } from "../types";
import { upsertMember } from "../repo/areas";
import { setAvailability } from "../repo/staff-ops";

/**
 * Shared set-up for LR-ROUTING's database tests (never imported by app code). Synthetic people and
 * numbers only. Call after `resetDatabaseForTests()` with `AUTH_DB_PATH=:memory:`.
 */

export const T0 = Date.UTC(2026, 9, 21, 6, 0, 0); // Wed 11:30 IST

let counter = 0;

export function user(role: Role, loginId: string, now = T0) {
  counter += 1;
  return insertUser(getDb(), { role, loginId, displayName: `Person ${loginId}`, passwordHash: "scrypt$test", mustChangePassword: false, now });
}

/** A CRM staff member (active membership). The first admin created is the bootstrap super admin. */
export function staff(loginId: string, crmRole: CrmRole, options: { centreSlugs?: string[]; actorId?: string } = {}) {
  const account = user("staff", loginId);
  writeStaffMembership(getDb(), options.actorId ?? account.id, account.id, { crmRole, centreSlugs: options.centreSlugs ?? [], active: true }, T0);
  return account;
}

export function viewerOf(userId: string, role: Role): CrmViewer {
  const viewer = resolveCrmViewer({ userId, role, displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

export function join(areaId: string, userId: string, options: { centreSlug?: string | null; takesLeads?: boolean } = {}) {
  upsertMember(getDb(), { areaId, userId, centreSlug: options.centreSlug ?? null, takesLeads: options.takesLeads ?? false, actorId: null, now: T0 });
}

export function away(userId: string, until: number) {
  setAvailability(getDb(), { userId, awayUntil: until, note: null, actorId: null, now: T0 });
}

export function lead(phone: string, overrides: Partial<CaptureLeadInput> = {}, now = T0, options: CaptureLeadOptions = {}) {
  const result = captureLead(
    { source: "admissions", studentName: "Test Student", phone, consent: { textVersion: "2026-10-20.v2" }, ...overrides },
    now,
    options,
  );
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result;
}

/** A unique synthetic mobile number (98 765 xxxxx style, never a real pattern from the mock-ups). */
export function phone(): string {
  counter += 1;
  return `97000${String(counter).padStart(5, "0")}`;
}
