import type { Metadata } from "next";
import { PortalGate } from "@/components/portal/PortalGate";
import { StudentSection } from "@/components/portal/StudentViews";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.student.timetable.metaTitle, description: t.student.timetable.metaDescription };
}

export default async function StudentTimetablePage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("portal")]);
  return (
    <PortalGate area="student" path="/student/timetable">
      {(access) => <StudentSection section="timetable" preview={access.kind === "preview"} locale={locale} t={t} />}
    </PortalGate>
  );
}
