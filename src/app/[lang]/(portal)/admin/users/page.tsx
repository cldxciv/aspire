import type { Metadata } from "next";
import { AdminPreviewPanel } from "@/components/portal/AdminViews";
import { PortalPageHeader } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import { UserManager, type UserManagerMessages } from "@/components/portal/UserManager";
import { getLocale, getMessages } from "@/i18n/server";
import { adminListUsers } from "@/lib/auth/accounts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.users.metaTitle, description: t.admin.users.metaDescription };
}

/**
 * Admin user management. The initial list is read on the server only after the admin gate
 * passed; every change goes through the same-origin JSON admin APIs (which re-check the role).
 */
export default async function AdminUsersPage() {
  const [locale, t, auth] = await Promise.all([getLocale(), getMessages("portal"), getMessages("auth")]);
  const u = t.admin.users;
  const messages: UserManagerMessages = { users: u, errors: t.errors, roles: auth.roles };
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
            <UserManager initialUsers={adminListUsers()} currentUserId={access.session.userId} messages={messages} />
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
