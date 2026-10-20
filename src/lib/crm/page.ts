import "server-only";

import { defaultLocale, type Locale } from "@/i18n/config";
import { requirePortalAccess } from "@/lib/auth/portal-access";

import { resolveCrmViewer } from "./access";
import { crmPermissions, type CrmPermissions, type CrmViewer } from "./types";

export type CrmPageAccess =
  | { kind: "viewer"; viewer: CrmViewer; permissions: CrmPermissions }
  /** A signed-in staff account without an active CRM membership: show "ask an admin to set you up". */
  | { kind: "no_membership"; displayName: string | null };

/**
 * Gate for `/crm/**` pages (render under `<Suspense>`; reads the request). Signed out or wrong role
 * → redirect to the login page of `locale` with `next=path`; temporary password pending → the
 * change-password page. There is no preview mode for the CRM.
 */
export async function requireCrmPage(path: string, locale: Locale = defaultLocale): Promise<CrmPageAccess> {
  const access = await requirePortalAccess(["staff", "admin"], path, locale);
  // requirePortalAccess never returns `preview` for an area that includes staff; be explicit anyway.
  if (access.kind !== "session") return { kind: "no_membership", displayName: null };
  const viewer = resolveCrmViewer(access.session);
  if (!viewer) return { kind: "no_membership", displayName: access.session.displayName ?? null };
  return { kind: "viewer", viewer, permissions: crmPermissions(viewer) };
}
