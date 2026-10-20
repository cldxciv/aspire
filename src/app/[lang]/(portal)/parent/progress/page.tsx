import type { Metadata } from "next";
import { ParentProgress } from "@/components/portal/ParentViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getLocale, getMessages } from "@/i18n/server";
import { getLinkedStudents } from "@/lib/auth/accounts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.parent.progressPage.metaTitle, description: t.parent.progressPage.metaDescription };
}

export default async function ParentProgressPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("portal")]);
  return (
    <PortalGate area="parent" path="/parent/progress">
      {(access) => (
        <ParentProgress
          locale={locale}
          t={t}
          learners={access.kind === "session" ? getLinkedStudents(access.session.userId) : null}
        />
      )}
    </PortalGate>
  );
}
