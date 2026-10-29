import type { Metadata } from "next";
import { Suspense } from "react";
import { familyMessages } from "@/components/console/details/messages";
import { LostReviewView } from "@/components/console/lost/LostReviewView";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { listStaff } from "@/lib/crm";
import { lostReview, lostReviewDays, lostReviewStaff } from "@/lib/crm/console/lost/lost";
import { consolePermissions } from "@/lib/crm/console/types";

const PATH = "/crm/lost";

export async function generateMetadata(): Promise<Metadata> {
  const f = familyMessages(await getLocale()).lost;
  return { title: f.metaTitle, description: f.metaDescription };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Lost enquiries to review (docs/admin-phase-1b-plan.md §5.H, §6.5, O12; owner: 1B-FAMILY). Area
 * heads (their scope) and admins (everything) keep lost enquiries lost or reopen them with a
 * follow-up; the window (7 / 14 / 30 days, default 14) and the counsellor live in the URL. Each
 * write is re-checked by its API route. Counsellors get a "not available" panel.
 */
export default async function CrmLostReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  const f = familyMessages(locale).lost;
  return (
    <CrmGate path={PATH} title={f.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={f.title} description={f.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <LostReview access={access} searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function LostReview({ access, searchParams, locale, t }: { access: CrmAccess; searchParams: SearchParams; locale: Locale; t: CrmMessages }) {
  const [params, now] = await Promise.all([searchParams, requestTime()]);
  const { viewer, permissions } = access;
  if (!consolePermissions(viewer, permissions).canReviewLost) {
    return <NotAllowed title={t.common.notAllowedTitle} body={familyMessages(locale).lost.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  }
  const assignee = first(params.assignee);
  const result = lostReview(viewer, { days: lostReviewDays(first(params.days)), assignee: assignee ?? null }, now);
  if (!result.ok) {
    return <NotAllowed title={t.common.notAllowedTitle} body={familyMessages(locale).lost.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  }
  const staff = listStaff(viewer);
  const options = staff.ok ? staff.data.filter((member) => member.active && !member.disabled).map((member) => ({ value: member.userId, label: member.displayName })) : [];
  // Pickers offer only who lead routing allows (the API re-checks every write).
  const eligible = lostReviewStaff(viewer, result.data.items.map((item) => item.leadId));
  const pick = (ids: readonly string[]) => options.filter((option) => ids.includes(option.value));
  const filterIds = eligible.ok ? eligible.data.filter : null;
  const filterOptions = filterIds ? options.filter((option) => filterIds.includes(option.value) || option.value === result.data.assignee) : options;
  const reopenStaff: Record<string, typeof options> = eligible.ok ? Object.fromEntries(Object.entries(eligible.data.byLead).map(([leadId, ids]) => [leadId, pick(ids)])) : {};
  return <LostReviewView report={result.data} staff={filterOptions} reopenStaff={reopenStaff} now={now} locale={locale} t={t} />;
}
