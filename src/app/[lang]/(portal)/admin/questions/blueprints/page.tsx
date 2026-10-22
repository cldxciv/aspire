import type { Metadata } from "next";
import { BlueprintList } from "@/components/qb-admin/BlueprintList";
import { QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { QbGate } from "@/components/qb-admin/QbGate";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("qb");
  return { title: t.blueprints.metaTitle, description: t.blueprints.metaDescription };
}

/** Exam-pattern blueprints by slot (§B1.3): drafts, published and archived versions. */
export default async function BlueprintsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <QbGate path="/admin/questions/blueprints" title={t.blueprints.title}>
      {(access) => (
        <>
          <QbPageHeader eyebrow={t.area.label} title={t.blueprints.title} description={t.blueprints.lead} />
          <BlueprintList t={t} locale={locale} can={access.can} />
        </>
      )}
    </QbGate>
  );
}
