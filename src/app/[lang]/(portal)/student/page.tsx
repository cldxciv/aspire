import type { Metadata } from "next";
import { PortalGate } from "@/components/portal/PortalGate";
import { StudentOverview, type StudentViewMessages } from "@/components/portal/StudentViews";
import { getLocale, getMessages } from "@/i18n/server";
import { getLinkedParentCount } from "@/lib/auth/accounts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.student.metaTitle, description: t.student.metaDescription };
}

/** Student dashboard: own account details + honest "not connected" areas (D-029); data-free preview when signed out (D-014). */
export default async function StudentOverviewPage() {
  const [locale, t, auth, common] = await Promise.all([
    getLocale(),
    getMessages("portal"),
    getMessages("auth"),
    getMessages("common"),
  ]);
  const m: StudentViewMessages = { portal: t, roles: auth.roles, photoLabel: common.labels.illustrativeStockPhoto };
  return (
    <PortalGate area="student" path="/student">
      {(access) => (
        <StudentOverview
          locale={locale}
          m={m}
          account={
            access.kind === "session"
              ? {
                  displayName: access.session.displayName ?? "",
                  loginId: access.session.loginId ?? "",
                  // Resolved from the session's own user id only.
                  linkedParents: getLinkedParentCount(access.session.userId),
                }
              : null
          }
        />
      )}
    </PortalGate>
  );
}
