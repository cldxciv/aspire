import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { QbGate } from "@/components/qb-admin/QbGate";
import { ImportJobView } from "@/components/qb-import/ImportJobView";
import type { ImportMessages } from "@/components/qb-import/import-view";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // Generic title: never the file name in a tab title or history.
  const t = await getMessages("qbImport");
  return { title: t.meta.jobTitle, description: t.meta.description };
}

type Params = Promise<{ lang: string; id: string }>;

const IMPORT_ID = /^imp_[a-z0-9]{16}$/;

/**
 * One import (QB-IMPORT): progress polled every 10 s while it runs, the estimate and spend, the
 * actions the viewer's role allows, page marks, the pattern snapshot and the dry-run / key report.
 * The id is read under Suspense (inside the gate); the client island loads the job from
 * /api/admin/qb/imports/[id], which re-checks the viewer.
 */
export default async function QbImportJobPage({ params }: { params: Params }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qbImport")]);
  return (
    <QbGate path={params.then(({ id }) => (IMPORT_ID.test(id) ? `/admin/questions/import/${id}` : "/admin/questions/import"))} title={t.page.jobTitle} need="import_tabular">
      {() => (
        <Suspense fallback={<p className="text-sm text-muted">{t.page.loading}</p>}>
          <JobBody params={params} t={t} locale={locale} />
        </Suspense>
      )}
    </QbGate>
  );
}

async function JobBody({ params, t, locale }: { params: Params; t: ImportMessages; locale: Locale }) {
  const { id } = await params;
  const back = (
    <Link href={localePath("/admin/questions/import", locale)} className="text-sm font-bold text-blue underline-offset-2 hover:underline">
      {t.page.backToImports}
    </Link>
  );
  if (!IMPORT_ID.test(id)) {
    return (
      <>
        <QbPageHeader eyebrow={t.page.eyebrow} title={t.page.notFoundTitle} description={t.page.notFoundBody} actions={back} />
      </>
    );
  }
  return (
    <>
      <QbPageHeader eyebrow={t.page.eyebrow} title={t.page.jobTitle} actions={back} />
      <ImportJobView id={id} t={t} locale={locale} />
    </>
  );
}
