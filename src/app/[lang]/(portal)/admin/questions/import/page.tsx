import type { Metadata } from "next";

import { ImportHome } from "@/components/qb-import/ImportHome";
import { QbGate } from "@/components/qb-admin/QbGate";
import { QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("qbImport");
  return { title: t.meta.title, description: t.meta.description };
}

/**
 * Question bank → Import (QB-IMPORT, docs/question-bank-plan.md §B8). Gated by `QbGate` (QB staff
 * only; `import_tabular` at least). The client island reads everything from
 * /api/admin/qb/imports, which re-checks the viewer on every call; reviewers and admins may also
 * upload files that are read by AI.
 */
export default async function QbImportPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qbImport")]);
  return (
    <QbGate path="/admin/questions/import" title={t.page.title} need="import_tabular">
      {() => (
        <>
          <QbPageHeader eyebrow={t.page.eyebrow} title={t.page.title} description={t.page.lead} />
          <ImportHome t={t} locale={locale} />
        </>
      )}
    </QbGate>
  );
}
