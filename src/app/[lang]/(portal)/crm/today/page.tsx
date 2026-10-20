import type { Metadata } from "next";
import { Suspense } from "react";
import { CrmPageHeader } from "@/components/crm/CrmBlocks";
import { CrmGate, crmCentres, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { TodayView } from "@/components/crm/TodayView";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { listLeads, myTasks } from "@/lib/crm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.today.metaTitle, description: t.today.metaDescription };
}

/** The viewer's own day: overdue / due-today tasks and new leads assigned to them. */
export default async function CrmTodayPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  return (
    <CrmGate path="/crm/today" title={t.today.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={t.today.title} description={t.today.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Today access={access} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function Today({ access, locale, t }: { access: CrmAccess; locale: Locale; t: CrmMessages }) {
  const now = await requestTime();
  const { viewer } = access;
  const overdue = myTasks(viewer, "overdue", now);
  const overdueIds = new Set(overdue.map((task) => task.id));
  const dueToday = myTasks(viewer, "today", now).filter((task) => !overdueIds.has(task.id));
  const fresh = listLeads(viewer, { assignee: "me", stage: "new", sort: "newest" }, { pageSize: 50 }, now).items;
  const centres = await crmCentres(locale);
  return <TodayView data={{ overdue, dueToday, fresh }} centres={centres.names} now={now} locale={locale} t={t} />;
}
