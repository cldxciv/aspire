import "server-only";
import { redirect } from "next/navigation";
import { isPortalPreviewEnabled } from "./config";
import { buildLoginHref } from "./paths";
import { decidePortalPage } from "./policy";
import type { Role, Session } from "./roles";
import { getSession } from "./session";

export type PortalAccess = { kind: "session"; session: Session } | { kind: "preview" };

/**
 * Server-side access check for portal pages. Returns `session` for a verified
 * session with the area's role, `preview` when data-free previews are enabled,
 * and otherwise redirects to `/login?next=<path>` (never returns).
 *
 * Reads the request, so callers must render under `<Suspense>` — use
 * `<PortalGate>` from `@/components/portal/PortalGate` rather than calling this
 * at the top of a page or layout.
 */
export async function requirePortalAccess(role: Role, path: string): Promise<PortalAccess> {
  const decision = decidePortalPage(await getSession(), role, isPortalPreviewEnabled());
  if (decision.kind === "deny") redirect(buildLoginHref(path));
  return decision;
}
