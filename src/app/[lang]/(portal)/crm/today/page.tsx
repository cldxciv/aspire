import type { Metadata } from "next";
import { Suspense } from "react";
import { CrmPageHeader } from "@/components/crm/CrmBlocks";
import { CrmGate, crmCentres, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { TodayView } from "@/components/crm/TodayView";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { listLeads, myTasks } from "@/lib/crm";
import { listAreaNames } from "@/lib/crm/repo/areas-core";
import { loadPolicy } from "@/lib/crm/sla/policy";
import { slaQueue } from "@/lib/crm/sla/views";
import { getDb } from "@/lib/db/connection";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.today.metaTitle, description: t.today.metaDescription };
}

/**
 * The viewer's own day: "Call now" (families waiting for their first call, LR-SLA §15), overdue /
 * due-today tasks (incl. "Call again" retries) and new leads assigned to them.
 */
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
  const queue = slaQueue(viewer, "mine", now);
  const db = getDb();
  const { retry } = loadPolicy(db).rule;
  const callNow = queue.ok
    ? {
        items: queue.data.items,
        total: queue.data.total,
        areaNames: Object.fromEntries(listAreaNames(db).map((area) => [area.id, locale === "hi" ? area.hi || area.en : area.en])),
        maxRetries: retry.enabled ? retry.maxAttempts : 0,
      }
    : undefined;
  const centres = await crmCentres(locale);
  return <TodayView data={{ overdue, dueToday, fresh, callNow }} centres={centres.names} now={now} locale={locale} t={t} />;
}
