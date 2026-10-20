import type { Metadata } from "next";
import { Suspense } from "react";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, crmCentres, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { LeadDetailView } from "@/components/crm/LeadDetailView";
import type { Option } from "@/components/crm/types";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { getLead, listStaff, scopeCovers, type CrmStaffMember } from "@/lib/crm";

export async function generateMetadata(): Promise<Metadata> {
  // Never the family's name in a tab title / history: the lead page is generic.
  const t = await getMessages("crm");
  return { title: t.lead.metaTitle, description: t.lead.metaDescription };
}

type Params = Promise<{ lang: string; id: string }>;

/** One lead. Reading it is audited by CRM-CORE (`crm.lead_view`); leads outside the viewer's scope are a 404-style panel. */
export default async function CrmLeadPage({ params }: { params: Params }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  return (
    <CrmGate path={params.then(({ id }) => (LEAD_ID.test(id) ? `/crm/leads/${id}` : "/crm"))} title={t.lead.metaTitle}>
      {(access) => (
        <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
          <Lead access={access} params={params} locale={locale} t={t} />
        </Suspense>
      )}
    </CrmGate>
  );
}

const LEAD_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function Lead({ access, params, locale, t }: { access: CrmAccess; params: Params; locale: Locale; t: CrmMessages }) {
  const { id } = await params;
  const now = await requestTime();
  const { viewer, permissions } = access;
  const result = LEAD_ID.test(id) ? getLead(viewer, id, now) : null;
  if (!result || !result.ok) {
    return (
      <>
        <CrmPageHeader eyebrow={t.lead.eyebrow} title={t.lead.notFoundTitle} />
        <NotAllowed title={t.lead.notFoundTitle} body={t.lead.notFoundBody} homeHref={localePath("/crm", locale)} homeLabel={t.lead.back} />
      </>
    );
  }
  const lead = result.data;
  const centres = await crmCentres(locale);
  const staffResult = permissions.canViewStaff ? listStaff(viewer) : null;
  const staff: CrmStaffMember[] = staffResult && staffResult.ok ? staffResult.data : [];

  const staffNames: Record<string, string> = Object.fromEntries(staff.map((member) => [member.userId, member.displayName]));
  if (lead.assignee) staffNames[lead.assignee.userId] = lead.assignee.displayName;
  for (const task of lead.tasks) if (task.assignee) staffNames[task.assignee.userId] = task.assignee.displayName;
  for (const activity of lead.activities) if (activity.actorId && activity.actorName) staffNames[activity.actorId] = activity.actorName;

  const assigneeOptions: Option[] = permissions.canAssign
    ? staff
        .filter((member) => member.active && !member.disabled)
        .filter((member) => viewer.role !== "manager" || viewer.centreSlugs.length === 0 || scopeCovers(member.centreSlugs, lead.centreSlug))
        .map((member) => ({ value: member.userId, label: `${member.displayName} · ${t.roles[member.crmRole]}` }))
    : [];
  // Keep the current assignee selectable even if they are no longer in the assignable list.
  if (lead.assignee && !assigneeOptions.some((option) => option.value === lead.assignee?.userId)) {
    assigneeOptions.unshift({ value: lead.assignee.userId, label: lead.assignee.displayName });
  }

  return (
    <LeadDetailView
      lead={lead}
      viewer={viewer}
      permissions={permissions}
      centres={centres.names}
      assigneeOptions={assigneeOptions}
      staffNames={staffNames}
      now={now}
      locale={locale}
      t={t}
    />
  );
}
