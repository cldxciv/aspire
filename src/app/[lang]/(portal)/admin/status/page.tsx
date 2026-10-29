import type { Metadata } from "next";
import { Suspense } from "react";
import { STATUS_TEXT, StatusView } from "@/components/console/status/StatusView";
import { requestTime } from "@/components/crm/CrmGate";
import { PortalPageHeader } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import type { Locale } from "@/i18n/config";
import portalEn from "@/i18n/messages/en/portal";
import { getLocale, getMessages } from "@/i18n/server";
import { buildSiteStatus, istTimeLabel } from "@/lib/console/status";

const PATH = "/admin/status";

export async function generateMetadata(): Promise<Metadata> {
  return { title: STATUS_TEXT.metaTitle, description: STATUS_TEXT.metaDescription };
}

/**
 * Admin console › Site status (docs/admin-phase-1b-plan.md §5.M; owner: 1B-HOUSEKEEPING). Admins
 * only (the admin gate), English only (decision 5). Content mode, indexing, enquiries, contact form,
 * Rancho, Meta lead ads, super admins, release, database size, free disk (warns under 3 GB),
 * snapshots, "Off-server backups: not set up (deferred)" and the static go-live summary. The
 * data-free console preview shows "—" and reads nothing. On a Hindi URL the English header and body
 * are marked `lang="en"` (WCAG 3.1.2).
 */
export default async function AdminStatusPage() {
  const [locale, portal] = await Promise.all([getLocale(), getMessages("portal")]);
  return (
    <PortalGate area="admin" path={PATH}>
      {(access) => (
        <>
          <div lang={locale === "en" ? undefined : "en"}>
            <PortalPageHeader
              area="admin"
              eyebrow={portalEn.areas.admin.label}
              title={STATUS_TEXT.title}
              description={STATUS_TEXT.lead}
              badge={access.kind === "preview" ? STATUS_TEXT.previewNote : undefined}
            />
          </div>
          {access.kind === "session" ? (
            <Suspense fallback={<p className="text-sm text-muted">{portal.shell.checkingAccess}</p>}>
              <LiveStatus locale={locale} />
            </Suspense>
          ) : (
            <StatusView status={null} asOf={null} locale={locale} />
          )}
        </>
      )}
    </PortalGate>
  );
}

/** Rendered only inside the admin branch of the gate, after the request (never prerendered). */
async function LiveStatus({ locale }: { locale: Locale }) {
  const now = await requestTime();
  const status = buildSiteStatus(now);
  return <StatusView status={status} asOf={istTimeLabel(status.generatedAt)} locale={locale} />;
}
