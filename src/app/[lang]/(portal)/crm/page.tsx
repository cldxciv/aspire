import type { Metadata } from "next";
import { Suspense } from "react";
import { AddLeadForm } from "@/components/crm/AddLeadForm";
import { CrmPageHeader } from "@/components/crm/CrmBlocks";
import {
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
import { InboxFiltersForm, LeadList, type InboxOptions } from "@/components/crm/InboxView";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { listLeads, listStaff } from "@/lib/crm";

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
  const filters = parseInboxFilters(params);
  const now = await requestTime();
  const { viewer, permissions } = access;
  const centres = await crmCentres(locale);
  const staff = permissions.canViewStaff ? listStaff(viewer) : null;
  const options: InboxOptions = {
    centres: centres.options,
    programs: programOptions(t),
    sources: sourceOptions(t),
    assignees:
      staff && staff.ok
        ? staff.data.filter((member) => member.userId !== viewer.userId).map((member) => ({ value: member.userId, label: member.displayName }))
        : [],
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
      <InboxFiltersForm filters={filters} options={options} permissions={permissions} locale={locale} t={t} />
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
