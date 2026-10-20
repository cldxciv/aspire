import type { Metadata } from "next";
import { loadLinkedLearnersWithTools } from "@/components/portal/learner-tools";
import { ParentProgress } from "@/components/portal/ParentViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.parent.progressPage.metaTitle, description: t.parent.progressPage.metaDescription };
}

/** Practice-tool progress for each learner linked to THIS parent only (D-033: the portal is the report). */
export default async function ParentProgressPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("portal")]);
  return (
    <PortalGate area="parent" path="/parent/progress">
      {(access) => (
        <ParentProgress
          locale={locale}
          t={t}
          learners={access.kind === "session" ? loadLinkedLearnersWithTools(access.session, locale) : null}
        />
      )}
    </PortalGate>
  );
}
