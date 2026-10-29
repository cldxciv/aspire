import type { Metadata } from "next";
import { Suspense } from "react";
import { AddLeadForm } from "@/components/crm/AddLeadForm";
import { CrmPageHeader } from "@/components/crm/CrmBlocks";
import {
  areaOptions,
  classOptions,
  CrmGate,
  crmCentres,
  manualSourceOptions,
  programOptions,
  sourceOptions,
  requestTime,
  type CrmAccess,
} from "@/components/crm/CrmGate";
import { ADD_LEAD_PARAM, inboxQuery, parseInboxFilters, toLeadFilters, type CrmMessages } from "@/components/crm/format";
import { InboxControls, LeadList, type InboxOptions, type InboxPresetContext } from "@/components/crm/InboxView";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { leadFilterForbidden, listLeads, listStaff } from "@/lib/crm";
import { consoleCentres, titleCaseSlug, viewerCentreSlugs } from "@/lib/crm/console/centres";
import { listAreaNames } from "@/lib/crm/repo/areas-core";
import { getDb } from "@/lib/db/connection";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.inbox.metaTitle, description: t.inbox.metaDescription };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Enquiries (the lead inbox): filters live in the URL (GET form); the list is read on the server
 * for the viewer. `?add=1` (the console top bar's "+ Add enquiry") opens the add-enquiry drawer.
 */
export default async function CrmInboxPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  return (
    <CrmGate path="/crm" title={t.inbox.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={t.inbox.title} description={t.inbox.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Inbox access={access} searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function Inbox({ access, searchParams, locale, t }: { access: CrmAccess; searchParams: SearchParams; locale: Locale; t: CrmMessages }) {
  const params = await searchParams;
  const parsed = parseInboxFilters(params);
  // Lead routing (§21): filters only narrow; an area outside an area head's areas is dropped here
  // (the API answers 403 for the same request).
  const filters = leadFilterForbidden(access.viewer, { area: parsed.area }) ? { ...parsed, area: "" } : parsed;
  const now = await requestTime();
  const { viewer, permissions } = access;
  const centres = await crmCentres(locale);
  const staff = permissions.canViewStaff ? listStaff(viewer) : null;
  // An area head is offered only the areas they answer for (any other would be dropped above).
  const scopeAreas = viewer.areaScope?.areaIds;
  const areaNames = permissions.canAssign ? listAreaNames(getDb()).filter((area) => !scopeAreas || scopeAreas.includes(area.id)) : [];
  const options: InboxOptions = {
    centres: centres.options,
    programs: programOptions(t),
    sources: sourceOptions(t),
    assignees:
      staff && staff.ok
        ? staff.data.filter((member) => member.userId !== viewer.userId).map((member) => ({ value: member.userId, label: member.displayName }))
        : [],
    areas: permissions.canAssign ? areaOptions(t, locale, areaNames) : undefined,
  };
  // Admin console 1b (§5.I): quick views — "This centre" for the centres in the viewer's scope.
  const labels = new Map((await consoleCentres(getDb(), locale)).flatMap((centre) => (centre.slug ? [[centre.slug, centre.label] as const] : [])));
  const presets: InboxPresetContext = {
    viewer: { role: viewer.role },
    centres: (viewerCentreSlugs(getDb(), viewer) ?? [...labels.keys()]).map((slug) => ({ slug, label: labels.get(slug) ?? titleCaseSlug(slug) })),
  };
  const page = listLeads(viewer, toLeadFilters(filters), { page: filters.page }, now);
  const addParam = params[ADD_LEAD_PARAM];
  const openAdd = permissions.canCreateLeads && (Array.isArray(addParam) ? addParam[0] : addParam) === "1";
  return (
    <>
      {permissions.canCreateLeads && (
        <div className="mb-4 flex justify-end">
          <AddLeadForm
            openSignal={openAdd ? now : null}
            sources={manualSourceOptions(t)}
            options={{ classes: classOptions(t), programs: programOptions(t), centres: centres.options }}
            t={{ add: t.add, common: t.common, errors: t.errors }}
          />
        </div>
      )}
      <InboxControls filters={filters} options={options} permissions={permissions} presets={presets} locale={locale} t={t} />
      <LeadList
        page={page}
        filters={filters}
        ctx={{
          centres: centres.names,
          viewerId: viewer.userId,
          now,
          locale,
          t,
          counsellor: viewer.role === "counsellor",
          back: `/crm${inboxQuery(filters)}`,
        }}
      />
    </>
  );
}
