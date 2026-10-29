import type { Metadata } from "next";
import { Suspense } from "react";
import { AdmissionsView } from "@/components/console/admissions/AdmissionsView";
import { numbersMessages } from "@/components/console/dashboard/labels";
import { DemoNote } from "@/components/console/shared/DemoNote";
import { consoleCommon } from "@/components/console/shared/messages";
import { SessionPicker } from "@/components/console/targets/SessionPicker";
import { CrmPageHeader } from "@/components/crm/CrmBlocks";
import { CrmGate, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { admissionsDone } from "@/lib/crm/console/admissions/admissions";
import { parseAdmissionsQuery } from "@/lib/crm/console/admissions/query";
import { consoleCentres, viewerCentreSlugs } from "@/lib/crm/console/centres";
import { admissionsHref } from "@/lib/crm/console/dashboard/links";
import { currentSession, sessionsForPicker } from "@/lib/crm/console/session";
import type { CentreRef } from "@/lib/crm/console/types";
import { getDb } from "@/lib/db/connection";

const PATH = "/crm/admissions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const m = numbersMessages(await getLocale()).admissions;
  return { title: m.metaTitle, description: m.metaDescription };
}

/**
 * Admissions done (docs/admin-phase-1b-plan.md §5.B, §6.3; owner: 1B-NUMBERS): every CRM role.
 * Counsellors see their own families, area heads their scope, admins everything. `?session=`
 * (default the current session), `?centre=` (effective centre; `none` = no centre yet), `?page=`.
 * The dashboard's "Admissions this session" links here and counts with the same condition.
 */
export default async function CrmAdmissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  const m = numbersMessages(locale).admissions;
  return (
    <CrmGate path={PATH} title={m.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={m.title} description={m.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Admissions access={access} searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function Admissions({ access, searchParams, locale, t }: { access: CrmAccess; searchParams: SearchParams; locale: Locale; t: CrmMessages }) {
  const params = await searchParams;
  const now = await requestTime();
  const { viewer } = access;
  const m = numbersMessages(locale);
  const query = parseAdmissionsQuery((name) => params[name], now);
  const report = admissionsDone(viewer, query.session, query.centre, query.page);

  // Centre filter: every console centre for admins and counsellors (their own families anyway),
  // the centres of their scope for area heads; plus "No centre yet".
  const db = getDb();
  const all = await consoleCentres(db, locale);
  const own = viewer.role === "manager" ? viewerCentreSlugs(db, viewer) : null;
  const centres: CentreRef[] = [
    ...(own === null ? all : own.map((slug) => all.find((centre) => centre.slug === slug) ?? { slug, label: slug, demo: all[0]?.demo ?? false })),
    { slug: null, label: "", demo: false },
  ];
  const current = currentSession(now).key;

  return (
    <div className="space-y-5">
      <section aria-labelledby="admissions-session" className="rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
        <h2 id="admissions-session" className="mb-3 text-base font-extrabold text-navy">
          {m.targets.sessionLabel}
        </h2>
        <SessionPicker
          sessions={sessionsForPicker(now)}
          current={current}
          selected={query.session}
          hrefFor={(key) => admissionsHref(key, query.centre)}
          label={m.targets.sessionNav}
          currentLabel={m.targets.currentSession}
          locale={locale}
        />
      </section>
      <DemoNote demo={all.some((centre) => centre.demo)} locale={locale} t={consoleCommon(locale)} />
      <AdmissionsView
        report={report}
        centres={centres}
        scopeNote={viewer.role === "counsellor" ? "own" : viewer.role === "manager" ? "manager" : null}
        locale={locale}
        crm={t}
      />
    </div>
  );
}
