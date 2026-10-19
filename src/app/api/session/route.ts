import { portalApiItem } from "@/lib/auth/responses";
import type { Role } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

type SessionStatus = { authenticated: false } | { authenticated: true; role: Role };

/**
 * GET /api/session — whether the current request has a verified session.
 * `{ ok: true, data: { authenticated: false } }` today (no identity provider).
 * Exposes the role only — never ids, linked learners or provider tokens.
 * `Cache-Control: no-store`.
 */
export async function GET() {
  const session = await getSession();
  const data: SessionStatus = session ? { authenticated: true, role: session.role } : { authenticated: false };
  return portalApiItem(data);
}
