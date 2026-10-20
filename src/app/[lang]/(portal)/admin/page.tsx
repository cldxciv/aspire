import type { Metadata } from "next";
import { AdminOverview, countAccounts, type AdminViewMessages } from "@/components/portal/AdminViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getLocale, getMessages } from "@/i18n/server";
import { adminListUsers } from "@/lib/auth/accounts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.overview.metaTitle, description: t.admin.overview.metaDescription };
}

/** Admin overview: own account, real account counts from the database, links to the admin tools. */
export default async function AdminOverviewPage() {
  const [locale, t, auth, common] = await Promise.all([
    getLocale(),
    getMessages("portal"),
    getMessages("auth"),
    getMessages("common"),
  ]);
  const m: AdminViewMessages = { portal: t, roles: auth.roles, photoLabel: common.labels.illustrativeStockPhoto };
  return (
    <PortalGate area="admin" path="/admin">
      {(access) => (
        <AdminOverview
          locale={locale}
          m={m}
          account={
            access.kind === "session"
              ? {
                  displayName: access.session.displayName ?? "",
                  loginId: access.session.loginId ?? "",
                  counts: countAccounts(adminListUsers()),
                }
              : null
          }
        />
      )}
    </PortalGate>
  );
}
