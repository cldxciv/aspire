import type { Metadata } from "next";
import { Suspense } from "react";
import { CrmPageHeader } from "@/components/crm/CrmBlocks";
import { CrmGate, crmCentres, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import { reportDayRange, type CrmMessages } from "@/components/crm/format";
import { ReportRangeForm, ReportsView } from "@/components/crm/ReportsView";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { funnelReport } from "@/lib/crm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.reports.metaTitle, description: t.reports.metaDescription };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Funnel and breakdowns for leads received in a date range (scoped to the viewer by CRM-CORE). */
export default async function CrmReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  return (
    <CrmGate path="/crm/reports" title={t.reports.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={t.reports.title} description={t.reports.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Reports access={access} searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function Reports({ access, searchParams, locale, t }: { access: CrmAccess; searchParams: SearchParams; locale: Locale; t: CrmMessages }) {
  const params = await searchParams;
  const now = await requestTime();
  const range = reportDayRange(params.from, params.to, now);
  const presets = ([7, 30, 90] as const).map((days) => ({
    key: `last${days}` as const,
    ...reportDayRange(undefined, undefined, now, days),
  }));
  const report = funnelReport(access.viewer, { from: Date.parse(range.fromIso), to: Date.parse(range.toIso) });
  const centres = await crmCentres(locale);
  return (
    <>
      <ReportRangeForm range={range} presets={presets} locale={locale} t={t} />
      <ReportsView report={report} range={range} permissions={access.permissions} centres={centres.names} locale={locale} t={t} />
    </>
  );
}
