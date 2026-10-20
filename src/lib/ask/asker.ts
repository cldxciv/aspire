import "server-only";

import type { CurrentSession } from "@/lib/auth/session";
import { getClientIp } from "@/lib/server/request-guards";

import type { AskConfig } from "./config";
import type { AskAccount } from "./constants";
import type { UsageKey } from "./usage";

/**
 * Who is asking, for allowances and topic tracking:
 * - signed-in student → own allowance (ASK_ASPIRE_STUDENT_DAILY) and weak-topic tracking;
 * - signed-in parent / admin → own allowance at the guest rate, nothing stored;
 * - guest, or an account that still has to change its temporary password → per-IP allowance
 *   (ASK_ASPIRE_GUEST_DAILY, client IP via TRUSTED_PROXY_HOPS), nothing stored. A guest whose
 *   browser holds a lead-gate pass is ALSO charged to the family (`familyKey`, the pass's lead):
 *   one pass used from several connections shares one guest allowance, and a pass never raises
 *   it (docs/lead-gate-plan.md §5.6, critique 1.3).
 */
export interface Asker {
  account: AskAccount;
  key: UsageKey;
  /** Guests with a lead-gate pass only: checked and counted with `key`, same limit. */
  familyKey: UsageKey | null;
  limit: number;
  /** Set for students only: where weak topics are recorded. */
  studentId: string | null;
}

/** `pass`: the lead-gate pass this request was unlocked by (`LeadGateAccess.via === "pass"`), else null. */
export function resolveAsker(
  current: CurrentSession | null,
  headers: Headers,
  config: AskConfig,
  pass: { leadId: string } | null = null,
): Asker {
  const session = current?.session;
  if (session && !session.mustChangePassword) {
    if (session.role === "student") {
      return { account: "student", key: { scope: "user", id: session.userId }, familyKey: null, limit: config.studentDaily, studentId: session.userId };
    }
    return { account: "member", key: { scope: "user", id: session.userId }, familyKey: null, limit: config.guestDaily, studentId: null };
  }
  return {
    account: "guest",
    key: { scope: "ip", id: getClientIp(headers) },
    familyKey: pass ? { scope: "lead", id: pass.leadId } : null,
    limit: config.guestDaily,
    studentId: null,
  };
}

/** The keys an asker is charged to, for the usage helpers (`{ key, extraKeys }`). */
export function askerUsageKeys(asker: Asker): { key: UsageKey; extraKeys: readonly UsageKey[] } {
  return { key: asker.key, extraKeys: asker.familyKey ? [asker.familyKey] : [] };
}
