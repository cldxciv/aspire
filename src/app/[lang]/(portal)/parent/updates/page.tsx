import type { Metadata } from "next";
import { loadLinkedLearnersWithTools } from "@/components/portal/learner-tools";
import { ParentUpdates } from "@/components/portal/ParentViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.parent.updatesPage.metaTitle, description: t.parent.updatesPage.metaDescription };
}

/** Recent practice-tool activity for linked learners only; announcements stay "not connected". */
export default async function ParentUpdatesPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("portal")]);
  return (
    <PortalGate area="parent" path="/parent/updates">
      {(access) => (
        <ParentUpdates
          locale={locale}
          t={t}
          learners={access.kind === "session" ? loadLinkedLearnersWithTools(access.session, locale) : null}
        />
      )}
    </PortalGate>
  );
}
