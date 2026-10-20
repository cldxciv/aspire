import "server-only";
import { redirect } from "next/navigation";
import { defaultLocale, type Locale } from "@/i18n/config";
import { isPortalPreviewEnabled } from "./config";
import { buildChangePasswordHref, buildLoginHref } from "./paths";
import { decidePortalPage } from "./policy";
import type { Role, Session } from "./roles";
import { getPageSession } from "./page-session";

export type PortalAccess = { kind: "session"; session: Session } | { kind: "preview" };

/**
 * Server-side access check for portal pages. Returns `session` for a verified
 * session with the area's role (or one of `role` when a list is given, e.g. the CRM:
 * `["staff", "admin"]`), `preview` when data-free previews are enabled (never for areas
 * that include `staff`: the CRM has no preview), and otherwise redirects to the login page
 * of `locale` with `?next=<path>` (never returns).
 *
 * A signed-in account that still has an admin-issued temporary password is sent to the
 * change-password page first (with `next`), whatever the area or preview setting: no
 * portal page renders for it until the password is changed.
 *
 * Reads the request, so callers must render under `<Suspense>` — use
 * `<PortalGate>` from `@/components/portal/PortalGate` rather than calling this
 * at the top of a page or layout.
 */
export async function requirePortalAccess(
  role: Role | readonly Role[],
  path: string,
  locale: Locale = defaultLocale,
): Promise<PortalAccess> {
  const session = await getPageSession();
  if (session?.mustChangePassword === true) redirect(buildChangePasswordHref(locale, path));
  const roles: readonly Role[] = typeof role === "string" ? [role] : role;
  const previewAllowed = !roles.includes("staff") && isPortalPreviewEnabled();
  const decision = decidePortalPage(session, roles, previewAllowed);
  if (decision.kind === "deny") redirect(buildLoginHref(path, locale));
  return decision;
}

/**
 * Server-side check for `/account/**` pages (any role, including accounts that must change
 * a temporary password): the verified session, or a redirect to the login page of `locale`.
 * There is no preview for account pages. Render under `<Suspense>`.
 */
export async function requireSignedIn(locale: Locale = defaultLocale): Promise<Session> {
  const session = await getPageSession();
  if (!session) redirect(buildLoginHref(undefined, locale));
  return session;
}
