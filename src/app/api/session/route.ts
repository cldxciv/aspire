import { portalApiItem } from "@/lib/auth/responses";
import type { Role } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

type SessionStatus = { authenticated: false } | { authenticated: true; role: Role; displayName: string | null };

/**
 * GET /api/session — whether the current request has a verified session:
 * `{ authenticated: false }` or `{ authenticated: true, role, displayName }`.
 * Never exposes ids, linked learners or the session token. `Cache-Control: no-store`.
 */
export async function GET() {
  const session = await getSession();
  const data: SessionStatus = session
    ? { authenticated: true, role: session.role, displayName: session.displayName ?? null }
    : { authenticated: false };
  return portalApiItem(data);
}
