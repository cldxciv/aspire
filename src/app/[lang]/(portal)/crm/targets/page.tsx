import type { Metadata } from "next";
import { Suspense } from "react";
import { numbersMessages } from "@/components/console/dashboard/labels";
import { DemoNote } from "@/components/console/shared/DemoNote";
import { consoleCommon } from "@/components/console/shared/messages";
import { SessionPicker } from "@/components/console/targets/SessionPicker";
import { TargetsView } from "@/components/console/targets/TargetsView";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { consoleCentres, viewerCentreSlugs } from "@/lib/crm/console/centres";
import { targetsHref } from "@/lib/crm/console/dashboard/links";
import { currentSession, isSessionKey, sessionRef, sessionsForPicker } from "@/lib/crm/console/session";
import { getTargets } from "@/lib/crm/console/targets/targets";
import { consolePermissions } from "@/lib/crm/console/types";
import { getDb } from "@/lib/db/connection";

const PATH = "/crm/targets";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = numbersMessages(await getLocale()).targets;
  return { title: t.metaTitle, description: t.metaDescription };
}

/**
 * Targets (docs/admin-phase-1b-plan.md §5.B, O4, O6; owner: 1B-NUMBERS): admission targets per
 * session × centre × programme, plus optional enquiry and counselling targets. Super admins edit;
 * CRM admins and area heads read (area heads: their centres); counsellors get a "not available"
 * panel. `?session=S2026` picks the session (default the current one).
 */
export default async function CrmTargetsPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  const m = numbersMessages(locale).targets;
  return (
    <CrmGate path={PATH} title={m.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={m.title} description={m.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Targets access={access} searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function Targets({ access, searchParams, locale, t }: { access: CrmAccess; searchParams: SearchParams; locale: Locale; t: CrmMessages }) {
  const params = await searchParams;
  const now = await requestTime();
  const { viewer } = access;
  const m = numbersMessages(locale).targets;
  const permissions = consolePermissions(viewer, { isSuperAdmin: viewer.superAdmin === true });
  const notAllowed = <NotAllowed title={t.common.notAllowedTitle} body={m.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  if (!permissions.canViewTargets) return notAllowed;

  const current = currentSession(now).key;
  const raw = Array.isArray(params.session) ? params.session[0] : params.session;
  const selected = isSessionKey(raw) ? raw : current;
  const result = getTargets(viewer, selected);
  if (!result.ok) return notAllowed;
  const grid = result.data;

  // Rows: the viewer's centres (every console centre for admins) plus any centre that already has a
  // cell, so a save never drops a target the page did not show.
  const db = getDb();
  const all = await consoleCentres(db, locale);
  const own = viewerCentreSlugs(db, viewer);
  const labels = new Map(all.flatMap((centre) => (centre.slug === null ? [] : [[centre.slug, centre.label] as const])));
  const slugs = own === null ? [...labels.keys()] : [...own];
  for (const cell of grid.cells) if (!slugs.includes(cell.centreSlug)) slugs.push(cell.centreSlug);
  const centres = slugs.map((slug) => ({ slug, label: labels.get(slug) ?? slug }));
  const common = consoleCommon(locale);

  return (
    <div className="space-y-5">
      <section aria-labelledby="targets-session" className="rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
        <h2 id="targets-session" className="mb-3 text-base font-extrabold text-navy">
          {m.sessionLabel}
        </h2>
        <SessionPicker
          sessions={sessionsForPicker(now)}
          current={current}
          selected={selected}
          hrefFor={(key) => targetsHref(key)}
          label={m.sessionNav}
          currentLabel={m.currentSession}
          locale={locale}
        />
      </section>
      <DemoNote demo={all.some((centre) => centre.demo)} locale={locale} t={common} />
      <TargetsView
        grid={grid}
        session={sessionRef(selected)}
        centres={centres}
        canEdit={permissions.canEditTargets}
        managerScope={viewer.role === "manager"}
        pagePath={PATH}
        locale={locale}
        crm={{ superAdmin: t.superAdmin, errors: t.errors }}
      />
    </div>
  );
}
