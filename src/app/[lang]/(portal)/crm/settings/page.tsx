import type { Metadata } from "next";
import { Suspense } from "react";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { SettingsHub } from "@/components/crm/settings/SettingsHub";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { listSuperAdmins } from "@/lib/auth/super-admin";

const PATH = "/crm/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.settings.metaTitle, description: t.settings.metaDescription };
}

/**
 * CRM settings hub (docs/lead-routing-plan.md §20): Areas & people · Calling hours & speed ·
 * Import leads · Integrations → Meta · Staff & rules. Area heads and admins read; super admins
 * change; counsellors get a "not available" panel. Each section page re-checks on the server.
 */
export default async function CrmSettingsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  return (
    <CrmGate path={PATH} title={t.settings.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={t.settings.title} description={t.settings.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Hub access={access} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function Hub({ access, locale, t }: { access: CrmAccess; locale: Locale; t: CrmMessages }) {
  await requestTime();
  const { viewer, permissions } = access;
  if (!permissions.canViewSettings) {
    return <NotAllowed title={t.common.notAllowedTitle} body={t.settings.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  }
  const names = listSuperAdmins(viewer.userId)
    .items.filter((item) => item.effective)
    .map((item) => item.displayName);
  return <SettingsHub permissions={permissions} superAdminNames={names} locale={locale} t={t} />;
}
