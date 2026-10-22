import type { Metadata } from "next";
import { Suspense } from "react";
import { AreasManager } from "@/components/crm/areas/AreasManager";
import type { AreasMessages } from "@/components/crm/areas/model";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, crmCentres, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { ReadOnlyNotice } from "@/components/crm/settings/ReadOnlyNotice";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { areasPageData } from "@/lib/crm/routing/areas-service";
import { listUnmatchedPlaces } from "@/lib/crm/routing/unmatched";

const PATH = "/crm/settings/areas";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.areasAdmin.metaTitle, description: t.areasAdmin.metaDescription };
}

/**
 * "Areas & people" (LR-ROUTING; docs/lead-routing-plan.md §13.6, §20): area heads and admins
 * read; super admins change (every API re-checks). Area heads may also mark their members away
 * and move their uncalled enquiries. Unmatched places (families' own words) are for super admins.
 */
export default async function CrmAreasPage() {
  const t = await getMessages("crm");
  return (
    <CrmGate path={PATH} title={t.areasAdmin.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={t.areasAdmin.title} description={t.areasAdmin.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <AreasBody access={access} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function AreasBody({ access, t }: { access: CrmAccess; t: CrmMessages }) {
  const now = await requestTime();
  const locale: Locale = await getLocale();
  const { viewer, permissions } = access;
  if (!permissions.canViewSettings) {
    return <NotAllowed title={t.common.notAllowedTitle} body={t.areasAdmin.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  }
  const page = areasPageData(viewer, now);
  if (!page.ok) {
    return <NotAllowed title={t.common.notAllowedTitle} body={t.areasAdmin.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  }
  const superAdmin = permissions.isSuperAdmin;
  const unmatched = superAdmin ? listUnmatchedPlaces(viewer, now) : null;
  const centres = await crmCentres(locale);
  const messages: AreasMessages = { a: t.areasAdmin, common: t.common, errors: t.errors, roles: t.roles };
  const ownAreaIds = viewer.areaScope?.areaIds ?? page.data.people.find((person) => person.userId === viewer.userId)?.areaIds ?? [];
  return (
    <>
      <ReadOnlyNotice canEdit={permissions.canEditSettings} t={t} />
      <AreasManager
        areas={page.data.areas}
        people={page.data.people}
        routing={{ mode: page.data.routing.value.mode, version: page.data.routing.version }}
        legacyManagerIds={page.data.legacyManagerIds}
        unmatched={unmatched?.ok ? unmatched.data : null}
        centres={centres.options}
        canEdit={permissions.canEditSettings}
        viewer={{ userId: viewer.userId, superAdmin, isManager: viewer.role === "manager", areaIds: ownAreaIds }}
        t={messages}
      />
    </>
  );
}
