import type { Metadata } from "next";
import { Suspense } from "react";
import { callsMessages, type CallsMessages } from "@/components/console/calls/messages";
import { TemplatesManager } from "@/components/console/templates/TemplatesManager";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { ReadOnlyNotice } from "@/components/crm/settings/ReadOnlyNotice";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { getWaLinks, listTemplates } from "@/lib/crm/console/templates/templates";
import { consolePermissions } from "@/lib/crm/console/types";

const PATH = "/crm/templates";

export async function generateMetadata(): Promise<Metadata> {
  const c = callsMessages(await getLocale());
  return { title: c.templates.metaTitle, description: c.templates.metaDescription };
}

/**
 * Staff WhatsApp templates (docs/admin-phase-1b-plan.md §5.D, O4, O5; owner: 1B-CALLS). Area heads
 * and admins read every template with its status; super admins edit, approve, retire and set the
 * prospectus link (each write is re-checked by its API route). Counsellors get a "not available"
 * panel: they use the approved templates from an enquiry's WhatsApp button.
 */
export default async function CrmTemplatesPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  const c = callsMessages(locale);
  return (
    <CrmGate path={PATH} title={c.templates.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={c.templates.title} description={c.templates.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Templates access={access} locale={locale} t={t} c={c} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function Templates({ access, locale, t, c }: { access: CrmAccess; locale: Locale; t: CrmMessages; c: CallsMessages }) {
  const now = await requestTime();
  const { viewer, permissions } = access;
  const allowed = consolePermissions(viewer, permissions);
  if (!allowed.canViewTemplateAdmin) {
    return <NotAllowed title={t.common.notAllowedTitle} body={c.templates.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  }
  const result = listTemplates(viewer, { all: true }, now);
  const links = getWaLinks();
  return (
    <>
      <ReadOnlyNotice canEdit={allowed.canManageTemplates} t={t} />
      <TemplatesManager
        templates={result.ok ? result.data : []}
        canManage={allowed.canManageTemplates}
        prospectus={{ url: links.value.prospectusUrl, version: links.version }}
        locale={locale}
        pagePath={PATH}
        t={{ errors: t.errors }}
        c={c}
      />
    </>
  );
}
