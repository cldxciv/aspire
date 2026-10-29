import type { Metadata } from "next";
import { AdminPreviewPanel } from "@/components/portal/AdminViews";
import { PortalPageHeader } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import { pick } from "@/components/console/shared/messages";
import { UserManager, type UserManagerMessages } from "@/components/portal/UserManager";
import consolePeopleEn from "@/i18n/messages/en/console-people";
import consolePeopleHi from "@/i18n/messages/hi/console-people";
import { getLocale, getMessages } from "@/i18n/server";
import { adminListUsers } from "@/lib/auth/accounts";
import { withPeopleCrm } from "@/lib/console/people";
import { getCentres } from "@/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.users.metaTitle, description: t.admin.users.metaDescription };
}

/**
 * Admin user management (People). The initial list is read on the server only after the admin gate
 * passed, with each staff account's CRM role, areas, away status and open enquiries (admin console
 * 1b §5.L, the same enrichment as GET /api/admin/users); every change goes through the same-origin
 * JSON admin APIs (which re-check the role). Centre names (public site content, read like the CRM
 * staff page does) turn the older centre scope's slugs into names in the page language.
 */
export default async function AdminUsersPage() {
  const [locale, t, auth] = await Promise.all([getLocale(), getMessages("portal"), getMessages("auth")]);
  const u = t.admin.users;
  const messages: UserManagerMessages = { users: u, errors: t.errors, roles: auth.roles, people: pick(locale, consolePeopleEn, consolePeopleHi) };
  const centreNames: Record<string, string> = await getCentres(undefined, locale)
    .then((centres) => Object.fromEntries(centres.map((centre) => [centre.slug, centre.name])))
    .catch((): Record<string, string> => ({}));
  return (
    <PortalGate area="admin" path="/admin/users">
      {(access) => (
        <>
          <PortalPageHeader
            area="admin"
            eyebrow={t.areas.admin.label}
            title={u.title}
            description={access.kind === "session" ? u.lead : u.previewLead}
            badge={access.kind === "preview" ? t.blocks.previewBadge : undefined}
          />
          {access.kind === "session" ? (
            <UserManager
              initialUsers={withPeopleCrm(adminListUsers())}
              currentUserId={access.session.userId}
              messages={messages}
              centreNames={centreNames}
            />
          ) : (
            <AdminPreviewPanel
              id="admin-users-preview"
              title={u.listTitle}
              body={u.previewEmpty}
              locale={locale}
              path="/admin/users"
              t={t}
            />
          )}
        </>
      )}
    </PortalGate>
  );
}
