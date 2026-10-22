import type { Metadata } from "next";
import { Suspense } from "react";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import { DashboardView, type DashboardPreset } from "@/components/crm/dashboard/DashboardView";
import { reportDayRange, type CrmMessages } from "@/components/crm/format";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { DASHBOARD_MAX_DAYS, dashboardAreaScope, dashboardData } from "@/lib/crm/dashboard";
import { DAY_MS } from "@/lib/crm/pure";
import { listAreaNames } from "@/lib/crm/repo/areas-core";
import { slaQueue } from "@/lib/crm/sla/views";
import { getDb } from "@/lib/db/connection";

const PATH = "/crm/dashboard";
const AREA_ID = /^[A-Za-z0-9_-]{1,64}$/;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.dashboard.metaTitle, description: t.dashboard.metaDescription };
}

/**
 * The lead dashboard (LR-SLA; docs/lead-routing-plan.md §16, §20): area heads see their areas,
 * admins and super admins everything; counsellors get a "not available" panel (their own calls are
 * on Today's calls). Reports stays for the funnel and the CSV export (linked from here, A9).
 */
export default async function CrmDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  return (
    <CrmGate path={PATH} title={t.dashboard.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={t.dashboard.title} description={t.dashboard.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Dashboard access={access} searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function Dashboard({ access, searchParams, locale, t }: { access: CrmAccess; searchParams: SearchParams; locale: Locale; t: CrmMessages }) {
  const params = await searchParams;
  const now = await requestTime();
  const { viewer, permissions } = access;
  if (!permissions.canViewDashboard) {
    return <NotAllowed title={t.common.notAllowedTitle} body={t.dashboard.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  }

  let range = reportDayRange(params.from, params.to, now);
  if (Date.parse(range.toIso) - Date.parse(range.fromIso) > DASHBOARD_MAX_DAYS * DAY_MS) range = { ...reportDayRange(undefined, undefined, now), invalid: true };
  const presets: DashboardPreset[] = ([7, 30, 90] as const).map((days) => {
    const preset = reportDayRange(undefined, undefined, now, days);
    return { key: `last${days}` as const, fromDay: preset.fromDay, toDay: preset.toDay };
  });
  const rawArea = Array.isArray(params.area) ? params.area[0] : params.area;
  const wantedArea = typeof rawArea === "string" && AREA_ID.test(rawArea) ? rawArea : null;
  const query = { from: Date.parse(range.fromIso), to: Date.parse(range.toIso) };

  // An area outside the viewer's areas is refused by the service (M2); show their own areas instead.
  let area = wantedArea;
  let result = dashboardData(viewer, { ...query, area }, now, { lang: locale });
  if (!result.ok && area !== null) {
    area = null;
    result = dashboardData(viewer, { ...query, area }, now, { lang: locale });
  }
  if (!result.ok) {
    return <NotAllowed title={t.common.notAllowedTitle} body={t.dashboard.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  }

  const db = getDb();
  const names = listAreaNames(db);
  const areaNames = Object.fromEntries(names.map((entry) => [entry.id, locale === "hi" ? entry.hi || entry.en : entry.en]));
  const allowed = dashboardAreaScope(db, viewer);
  const areaOptions = names
    .filter((entry) => entry.active && (allowed === "all" || (allowed ?? []).includes(entry.id)))
    .map((entry) => ({ id: entry.id, name: areaNames[entry.id] }));
  const escalated = permissions.isSuperAdmin ? slaQueue(viewer, "escalated", now) : null;

  return (
    <DashboardView
      data={result.data}
      escalated={escalated?.ok ? escalated.data.items : null}
      permissions={permissions}
      range={{ fromDay: range.fromDay, toDay: range.toDay, invalid: range.invalid }}
      presets={presets}
      areaOptions={areaOptions}
      area={area}
      areaNames={areaNames}
      now={now}
      locale={locale}
      t={t}
    />
  );
}
