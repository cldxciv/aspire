import type { Metadata } from "next";
import { Suspense } from "react";
import { CrmPageHeader } from "@/components/crm/CrmBlocks";
import { CrmGate, crmCentres, programOptions, sourceOptions, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import { inboxQuery, parseInboxFilters, toLeadCard, toLeadFilters, type CrmMessages } from "@/components/crm/format";
import { InboxFiltersForm } from "@/components/crm/InboxView";
import { PipelineBoard, type PipelineColumn, type PipelineMessages } from "@/components/crm/PipelineBoard";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { LEAD_STAGES, listLeads, listStaff } from "@/lib/crm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.pipeline.metaTitle, description: t.pipeline.metaDescription };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Cards shown per column; the rest are one click away in the inbox (filtered to that stage). */
const PER_COLUMN = 25;

export default async function CrmPipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  return (
    <CrmGate path="/crm/pipeline" title={t.pipeline.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={t.pipeline.title} description={t.pipeline.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Pipeline access={access} searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function Pipeline({ access, searchParams, locale, t }: { access: CrmAccess; searchParams: SearchParams; locale: Locale; t: CrmMessages }) {
  const filters = { ...parseInboxFilters(await searchParams), stage: "" as const, due: "" as const, page: 1 };
  const now = await requestTime();
  const { viewer, permissions } = access;
  const centres = await crmCentres(locale);
  const staff = permissions.canViewStaff ? listStaff(viewer) : null;
  const base = toLeadFilters(filters);
  const columns: PipelineColumn[] = LEAD_STAGES.map((stage) => {
    const page = listLeads(viewer, { ...base, stage }, { pageSize: PER_COLUMN }, now);
    return {
      stage,
      total: page.total,
      cards: page.items.map((lead) => toLeadCard(lead, { t, centres: centres.names, viewerId: viewer.userId })),
    };
  });
  const messages: PipelineMessages = {
    common: t.common,
    errors: t.errors,
    stages: t.stages,
    lostReasons: t.lostReasons,
    lead: t.lead,
    pipeline: t.pipeline,
  };
  return (
    <>
      <InboxFiltersForm
        mode="pipeline"
        filters={filters}
        options={{
          centres: centres.options,
          programs: programOptions(t),
          sources: sourceOptions(t),
          assignees:
            staff && staff.ok
              ? staff.data.filter((member) => member.userId !== viewer.userId).map((member) => ({ value: member.userId, label: member.displayName }))
              : [],
        }}
        permissions={permissions}
        locale={locale}
        t={t}
      />
      <PipelineBoard columns={columns} inboxQuery={inboxQuery(filters)} t={messages} />
    </>
  );
}
