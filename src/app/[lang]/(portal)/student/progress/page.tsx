import type { Metadata } from "next";
import { loadLearnerTools } from "@/components/portal/learner-tools";
import { PortalGate } from "@/components/portal/PortalGate";
import { StudentProgress } from "@/components/portal/StudentViews";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.student.progress.metaTitle, description: t.student.progress.metaDescription };
}

/** The student's own mock tests, planner consistency and doubt topics; classroom results / attendance stay "not connected". */
export default async function StudentProgressPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("portal")]);
  return (
    <PortalGate area="student" path="/student/progress">
      {(access) => (
        <StudentProgress
          locale={locale}
          t={t}
          tools={access.kind === "session" ? loadLearnerTools(access.session, access.session.userId, locale) : null}
        />
      )}
    </PortalGate>
  );
}
