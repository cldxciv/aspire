import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CrmPageHeader, NotAllowed } from "@/components/crm/CrmBlocks";
import { CrmGate, requestTime, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { ImportHistory } from "@/components/crm/import/ImportHistory";
import { ImportWizard } from "@/components/crm/import/ImportWizard";
import { ReadOnlyNotice } from "@/components/crm/settings/ReadOnlyNotice";
import { Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { getCentres } from "@/lib/data";
import { listImportBatches } from "@/lib/crm/intake/import";
import type { ImportCentreOption } from "@/lib/crm/intake/rows";
import { listAreaNames } from "@/lib/crm/repo/areas-core";
import { getDb } from "@/lib/db/connection";

const PATH = "/crm/settings/import";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.importLeads.metaTitle, description: t.importLeads.metaDescription };
}

/**
 * "Import leads" (LR-IMPORT, docs/lead-routing-plan.md §8, §17, §20, §22): super admins import
 * (`canImport`); ordinary admins see the history read-only (`canViewImportHistory`); area heads and
 * executives get a "not available" panel. Every API call re-checks on the server.
 */
export default async function CrmImportPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  const ti = t.importLeads;
  return (
    <CrmGate path={PATH} title={ti.title}>
      {(access) => (
        <>
          <CrmPageHeader
            eyebrow={t.settings.title}
            title={ti.title}
            description={ti.lead}
            actions={
              <Link
                href={localePath("/crm/settings", locale)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-bold text-blue hover:underline focus-visible:underline"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                {ti.backToSettings}
              </Link>
            }
          />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <ImportBody access={access} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </CrmGate>
  );
}

async function centreOptions(): Promise<ImportCentreOption[]> {
  const [en, hi] = await Promise.all([getCentres(undefined, "en"), getCentres(undefined, "hi")]);
  return en.map((centre) => ({
    slug: centre.slug,
    names: [centre.name, ...hi.filter((other) => other.slug === centre.slug).map((other) => other.name)],
  }));
}

/** Area id → name in the page's language, for the preview's "new families by area". */
function areaNamesIn(locale: Locale): Record<string, string> {
  return Object.fromEntries(listAreaNames(getDb()).map((area) => [area.id, locale === "hi" ? area.hi : area.en]));
}

async function ImportBody({ access, locale, t }: { access: CrmAccess; locale: Locale; t: CrmMessages }) {
  await requestTime();
  const ti = t.importLeads;
  const { canImport, canViewImportHistory } = access.permissions;
  if (!canImport && !canViewImportHistory) {
    return <NotAllowed title={t.common.notAllowedTitle} body={ti.notAllowed} homeHref={localePath("/crm/settings", locale)} homeLabel={ti.backToSettings} />;
  }
  const batches = listImportBatches({ db: getDb() }, access.viewer.userId);
  // File fingerprint → when it was last imported (batches are newest first), for the "same file" note.
  const previousFiles: Record<string, string> = {};
  for (const batch of batches) {
    if (batch.fileSha256 !== null && batch.status === "finished") previousFiles[batch.fileSha256] ??= batch.createdAt;
  }
  return (
    <>
      <ReadOnlyNotice canEdit={canImport} t={t} />
      <div className="space-y-5">
        {canImport ? (
          <ImportWizard centres={await centreOptions()} areaNames={areaNamesIn(locale)} previousFiles={previousFiles} t={ti} crm={{ errors: t.errors }} />
        ) : (
          <Notice variant="info" role="note">
            {ti.readOnly}
          </Notice>
        )}
        <ImportHistory batches={batches} locale={locale} t={ti} />
      </div>
    </>
  );
}
