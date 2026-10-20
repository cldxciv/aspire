import type { Metadata } from "next";
import { ParentOverview, type ParentViewMessages } from "@/components/portal/ParentViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getLocale, getMessages } from "@/i18n/server";
import { getLinkedStudents } from "@/lib/auth/accounts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.parent.metaTitle, description: t.parent.metaDescription };
}

/**
 * Parent dashboard: only learners linked to THIS parent (resolved server-side from the
 * session's own user id; enabled learner accounts only), each with "not connected" states.
 */
export default async function ParentOverviewPage() {
  const [locale, t, auth, common] = await Promise.all([
    getLocale(),
    getMessages("portal"),
    getMessages("auth"),
    getMessages("common"),
  ]);
  const m: ParentViewMessages = { portal: t, roles: auth.roles, photoLabel: common.labels.illustrativeStockPhoto };
  return (
    <PortalGate area="parent" path="/parent">
      {(access) => (
        <ParentOverview
          locale={locale}
          m={m}
          account={
            access.kind === "session"
              ? {
                  displayName: access.session.displayName ?? "",
                  loginId: access.session.loginId ?? "",
                  learners: getLinkedStudents(access.session.userId),
                }
              : null
          }
        />
      )}
    </PortalGate>
  );
}
