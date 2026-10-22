import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, crmCentres, programOptions, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { MetaIntegrationPage } from "@/components/crm/integrations/MetaIntegrationPage";
import { ReadOnlyNotice } from "@/components/crm/settings/ReadOnlyNotice";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { kickMetaProcessing } from "@/lib/crm/meta";
import { afterResponse, originFromHeaders } from "@/lib/crm/meta/http";
import { metaInboxPage, metaIntegrationView, siteOriginFor } from "@/lib/crm/meta/view";
import { getDb } from "@/lib/db/connection";

const PATH = "/crm/settings/integrations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.metaAds.metaTitle, description: t.metaAds.metaDescription };
}

/**
 * Integrations → Meta Lead Ads (LR-META; docs/lead-routing-plan.md §20, §22): admins and area heads
 * see the connection status (no secrets); super admins set it up and run it; executives get a
 * "not available" panel. Every API call re-checks on the server.
 */
export default async function CrmIntegrationsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  const tm = t.metaAds;
  return (
    <CrmGate path={PATH} title={tm.title}>
      {(access) => (
        <>
          <CrmPageHeader
            eyebrow={t.settings.title}
            title={tm.title}
            description={tm.lead}
            actions={
              <Link
                href={localePath("/crm/settings", locale)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-bold text-blue hover:underline focus-visible:underline"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                {tm.backToSettings}
              </Link>
            }
          />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <IntegrationsBody access={access} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function IntegrationsBody({ access, locale, t }: { access: CrmAccess; locale: Locale; t: CrmMessages }) {
  const now = await requestTime();
  const { viewer, permissions } = access;
  if (!permissions.canViewIntegrationStatus && !permissions.canManageIntegrations) {
    return <NotAllowed title={t.common.notAllowedTitle} body={t.metaAds.notAllowed} homeHref={localePath("/crm/settings", locale)} homeLabel={t.metaAds.backToSettings} />;
  }
  const origin = originFromHeaders(await headers());
  const db = getDb();
  const view = metaIntegrationView(db, viewer, { now, siteOrigin: siteOriginFor(origin) });
  const inbox = permissions.canManageIntegrations ? metaInboxPage(db, null).items : null;
  afterResponse(() => kickMetaProcessing("status"));
  const centres = await crmCentres(locale);
  return (
    <>
      <ReadOnlyNotice canEdit={permissions.canManageIntegrations} t={t} />
      <MetaIntegrationPage view={view} inbox={inbox} locale={locale} programs={programOptions(t)} centres={centres.options} t={t} />
    </>
  );
}
