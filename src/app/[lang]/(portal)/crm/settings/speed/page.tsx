import type { Metadata } from "next";
import { Suspense } from "react";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { ReadOnlyNotice } from "@/components/crm/settings/ReadOnlyNotice";
import { SpeedSettingsForm } from "@/components/crm/sla/SpeedSettingsForm";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { getSpeedSettings } from "@/lib/crm/sla/policy";

const PATH = "/crm/settings/speed";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.speed.metaTitle, description: t.speed.metaDescription };
}

/**
 * "Calling hours & speed" (LR-SLA; docs/lead-routing-plan.md §15, §20): area heads and admins read;
 * super admins change (PUT /api/crm/settings/speed re-checks on the server). Counsellors get a
 * "not available" panel.
 */
export default async function CrmSpeedSettingsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  return (
    <CrmGate path={PATH} title={t.speed.title}>
      {(access) => (
        <>
          <CrmPageHeader eyebrow={t.area.label} title={t.speed.title} description={t.speed.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <SpeedBody access={access} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function SpeedBody({ access, locale, t }: { access: CrmAccess; locale: Locale; t: CrmMessages }) {
  await requestTime();
  const { viewer, permissions } = access;
  const settings = permissions.canViewSettings ? getSpeedSettings(viewer) : null;
  if (!settings?.ok) {
    return <NotAllowed title={t.common.notAllowedTitle} body={t.speed.notAllowedBody} homeHref={localePath("/crm/today", locale)} homeLabel={t.nav.today} />;
  }
  return (
    <>
      <ReadOnlyNotice canEdit={permissions.canEditSettings} t={t} />
      <SpeedSettingsForm
        initial={settings.data}
        canEdit={permissions.canEditSettings}
        pagePath={PATH}
        locale={locale}
        t={{
          speed: { form: t.speed.form, hours: t.speed.hours, rule: t.speed.rule },
          sources: t.sources,
          outcomes: t.lead.contact.outcomes,
          errors: t.errors,
        }}
      />
    </>
  );
}
