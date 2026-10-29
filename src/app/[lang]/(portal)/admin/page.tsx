import type { Metadata } from "next";
import { Suspense } from "react";
import { CentreNumbers, NumbersLoading } from "@/components/console/dashboard/CentreNumbers";
import { NeedsAttention } from "@/components/console/dashboard/NeedsAttention";
import { requestTime } from "@/components/crm/CrmGate";
import { AdminOverview, countAccounts, type AdminViewMessages } from "@/components/portal/AdminViews";
import { PortalGate } from "@/components/portal/PortalGate";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { adminListUsers } from "@/lib/auth/accounts";
import type { Session } from "@/lib/auth/roles";
import { resolveCrmViewer } from "@/lib/crm/access";
import { needsAttention } from "@/lib/crm/console/dashboard/attention";
import { consoleNumbers } from "@/lib/crm/console/dashboard/numbers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.overview.metaTitle, description: t.admin.overview.metaDescription };
}

/**
 * Admin overview (Console Home): the five numbers for every centre and Needs attention (admin
 * console 1b, 1B-NUMBERS; CRM admins only — the gate lets core admins in, never staff), then the
 * own account, real account counts from the database and links to the admin tools. The data-free
 * preview shows "—" everywhere and never reads the database.
 */
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
          numbers={
            access.kind === "session" ? (
              <Suspense fallback={<NumbersLoading locale={locale} />}>
                <AdminNumbers session={access.session} locale={locale} />
              </Suspense>
            ) : (
              <NumbersPreview locale={locale} />
            )
          }
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

/** The data-free preview: "—" and "Preview · no live data", no database read. */
function NumbersPreview({ locale }: { locale: Locale }) {
  return (
    <>
      <CentreNumbers data={null} variant="admin" canEditTargets={false} locale={locale} />
      <NeedsAttention items={null} variant="admin" locale={locale} />
    </>
  );
}

/** The live numbers for a signed-in admin (every centre), as of the request time. */
async function AdminNumbers({ session, locale }: { session: Session; locale: Locale }) {
  const now = await requestTime();
  const viewer = resolveCrmViewer(session);
  if (!viewer || viewer.role !== "admin") return null;
  const numbers = await consoleNumbers(viewer, now, locale);
  const attention = needsAttention(viewer, now, "admin");
  return (
    <>
      <CentreNumbers data={numbers} variant="admin" canEditTargets={viewer.superAdmin === true} locale={locale} />
      <NeedsAttention items={attention} variant="admin" locale={locale} />
    </>
  );
}
