import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoNote } from "@/components/console/shared/DemoNote";
import { consoleCommon, pick } from "@/components/console/shared/messages";
import type { CentreLinkRow } from "@/components/console/sources/CentreLinksCard";
import type { SourcesMessages } from "@/components/console/sources/labels";
import { SourcesFilters } from "@/components/console/sources/SourcesFilters";
import { SourcesView } from "@/components/console/sources/SourcesView";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n/config";
import sourcesEn from "@/i18n/messages/en/console-sources";
import sourcesHi from "@/i18n/messages/hi/console-sources";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { getCentreLinks } from "@/lib/crm/console/centre-links";
import { consoleCentres, viewerCentreSlugs } from "@/lib/crm/console/centres";
import { gbpTaggedPath } from "@/lib/crm/console/channels";
import { inboxHref } from "@/lib/crm/console/counts";
import { currentSession } from "@/lib/crm/console/session";
import { parseSourcesQuery } from "@/lib/crm/console/sources/range";
import { sourcesPermissions, sourcesReport } from "@/lib/crm/console/sources/sources";
import type { CentreRef } from "@/lib/crm/console/types";
import { getDb } from "@/lib/db/connection";

const PATH = "/crm/sources";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const s = pick(await getLocale(), sourcesEn, sourcesHi);
  return { title: s.page.metaTitle, description: s.page.metaDescription };
}

/**
 * Where enquiries come from (docs/admin-phase-1b-plan.md §5.J; owner: 1B-SOURCES): channels,
 * Google Maps and AI assistants (all signals), campaign tags, referring websites, landing pages,
 * how they heard, Free tools & Rancho, and the weekly trend. CRM admins see every enquiry, area
 * heads their own scope (read-only); counsellors get a "not available" panel. Super admins edit
 * the centres' Google Maps links here (`#maps`).
 */
export default async function CrmSourcesPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  const s = pick(locale, sourcesEn, sourcesHi);
  return (
    <CrmGate path={PATH} title={s.page.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={s.page.title} description={s.page.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Sources access={access} searchParams={searchParams} locale={locale} t={t} s={s} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

/** Centre links rows: the viewer's centres plus any centre already in the document (nothing is dropped on save). */
function linkRows(centres: readonly CentreRef[], links: Record<string, { mapsUrl: string | null }>, showExtra: boolean): CentreLinkRow[] {
  const rows: CentreLinkRow[] = [];
  const seen = new Set<string>();
  const add = (slug: string, label: string) => {
    if (seen.has(slug)) return;
    seen.add(slug);
    rows.push({ slug, label, mapsUrl: links[slug]?.mapsUrl ?? null, taggedUrl: new URL(gbpTaggedPath(slug), siteConfig.url).toString() });
  };
  for (const centre of centres) if (centre.slug !== null) add(centre.slug, centre.label);
  if (showExtra) for (const slug of Object.keys(links).sort()) add(slug, slug);
  return rows;
}

async function Sources({
  access,
  searchParams,
  locale,
  t,
  s,
}: {
  access: CrmAccess;
  searchParams: SearchParams;
  locale: Locale;
  t: CrmMessages;
  s: SourcesMessages;
}) {
  const params = await searchParams;
  const now = await requestTime();
  const { viewer } = access;
  const permissions = sourcesPermissions(viewer);
  if (!permissions.canViewSources) {
    return <NotAllowed title={t.common.notAllowedTitle} body={s.page.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  }

  const db = getDb();
  const query = parseSourcesQuery((name) => params[name], now);
  const report = sourcesReport(viewer, query.range, query.centre, now);
  const allCentres = await consoleCentres(db, locale);
  const own = viewerCentreSlugs(db, viewer);
  const centres = own === null ? allCentres : allCentres.filter((centre) => centre.slug !== null && own.includes(centre.slug));
  const links = getCentreLinks(db);
  const common = consoleCommon(locale);

  return (
    <>
      <DemoNote demo={centres.some((centre) => centre.demo)} locale={locale} t={common} className="mb-5" />
      <SourcesView
        report={report}
        managerScope={viewer.role === "manager"}
        links={{ rows: linkRows(centres, links.value.centres, permissions.canEditCentreLinks), version: links.version, canEdit: permissions.canEditCentreLinks }}
        freeToolUsersHref={permissions.canSeeToolUsage ? inboxHref({ area: "tool_signups", stage: "open" }) : null}
        pagePath={PATH}
        locale={locale}
        s={s}
        common={common}
        crm={{ errors: t.errors }}
        filters={
          <SourcesFilters
            range={query.range}
            centre={query.centre}
            centres={centres}
            sessionLabel={currentSession(now).label}
            invalid={query.invalid}
            locale={locale}
            s={s}
          />
        }
      />
    </>
  );
}
