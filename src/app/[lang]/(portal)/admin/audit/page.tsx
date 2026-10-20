import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPreviewPanel } from "@/components/portal/AdminViews";
import { AuditLog, parseAuditLimit, type AuditUserView } from "@/components/portal/AuditLog";
import { PortalPageHeader } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { getLocale, getMessages } from "@/i18n/server";
import { adminListAudit, adminListUsers } from "@/lib/auth/accounts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.audit.metaTitle, description: t.admin.audit.metaDescription };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Audit log (newest first, 50 / 100 / 200 entries). Read on the server only after the admin gate passed. */
export default async function AdminAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t, auth] = await Promise.all([getLocale(), getMessages("portal"), getMessages("auth")]);
  const a = t.admin.audit;
  return (
    <PortalGate area="admin" path="/admin/audit">
      {(access) => (
        <>
          <PortalPageHeader
            area="admin"
            eyebrow={t.areas.admin.label}
            title={a.title}
            description={access.kind === "session" ? a.lead : a.previewLead}
            badge={access.kind === "preview" ? t.blocks.previewBadge : undefined}
          />
          {access.kind === "session" ? (
            <Suspense fallback={<p className="text-sm text-muted">{t.shell.checkingAccess}</p>}>
              <AuditEntries searchParams={searchParams} locale={locale} t={a} roles={auth.roles} />
            </Suspense>
          ) : (
            <AdminPreviewPanel
              id="admin-audit-preview"
              title={a.listTitle}
              body={a.previewEmpty}
              locale={locale}
              path="/admin/audit"
              t={t}
            />
          )}
        </>
      )}
    </PortalGate>
  );
}

/** Rendered only inside the admin branch of the gate. */
async function AuditEntries({
  searchParams,
  locale,
  t,
  roles,
}: {
  searchParams: SearchParams;
  locale: Locale;
  t: Messages<"portal">["admin"]["audit"];
  roles: Messages<"auth">["roles"];
}) {
  const limit = parseAuditLimit((await searchParams).limit);
  const users = new Map<string, AuditUserView>(
    adminListUsers().map((user) => [user.id, { displayName: user.displayName, loginId: user.loginId }]),
  );
  return <AuditLog entries={adminListAudit({ limit })} users={users} limit={limit} locale={locale} t={t} roles={roles} />;
}
