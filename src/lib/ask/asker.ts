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
 *   (ASK_ASPIRE_GUEST_DAILY, client IP via TRUSTED_PROXY_HOPS), nothing stored.
 */
export interface Asker {
  account: AskAccount;
  key: UsageKey;
  limit: number;
  /** Set for students only: where weak topics are recorded. */
  studentId: string | null;
}

export function resolveAsker(current: CurrentSession | null, headers: Headers, config: AskConfig): Asker {
  const session = current?.session;
  if (session && !session.mustChangePassword) {
    if (session.role === "student") {
      return { account: "student", key: { scope: "user", id: session.userId }, limit: config.studentDaily, studentId: session.userId };
    }
    return { account: "member", key: { scope: "user", id: session.userId }, limit: config.guestDaily, studentId: null };
  }
  return { account: "guest", key: { scope: "ip", id: getClientIp(headers) }, limit: config.guestDaily, studentId: null };
}
