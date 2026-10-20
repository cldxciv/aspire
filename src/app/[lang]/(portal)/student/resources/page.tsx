import type { Metadata } from "next";
import { PortalGate } from "@/components/portal/PortalGate";
import { StudentSection } from "@/components/portal/StudentViews";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.student.resources.metaTitle, description: t.student.resources.metaDescription };
}

export default async function StudentResourcesPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("portal")]);
  return (
    <PortalGate area="student" path="/student/resources">
      {(access) => <StudentSection section="resources" preview={access.kind === "preview"} locale={locale} t={t} />}
    </PortalGate>
  );
}
