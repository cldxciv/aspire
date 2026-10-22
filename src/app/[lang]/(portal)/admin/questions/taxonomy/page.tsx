import type { Metadata } from "next";
import { Suspense } from "react";
import type { QbMessages } from "@/components/qb-admin/api";
import { isOneOf, QB_ADMIN_EXAMS, type QbCapabilityMap } from "@/components/qb-admin/constants";
import { QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { QbGate } from "@/components/qb-admin/QbGate";
import { TaxonomyView } from "@/components/qb-admin/TaxonomyView";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("qb");
  return { title: t.taxonomy.metaTitle, description: t.taxonomy.metaDescription };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Official units and Aspire chapters per exam, and the admin confirmation that unlocks imports (§B3). */
export default async function TaxonomyPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <QbGate path="/admin/questions/taxonomy" title={t.taxonomy.title}>
      {(access) => (
        <>
          <QbPageHeader eyebrow={t.area.label} title={t.taxonomy.title} description={t.taxonomy.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Taxonomy searchParams={searchParams} can={access.can} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </QbGate>
  );
}

async function Taxonomy({ searchParams, can, locale, t }: { searchParams: SearchParams; can: QbCapabilityMap; locale: Locale; t: QbMessages }) {
  const raw = (await searchParams).exam;
  const exam = Array.isArray(raw) ? raw[0] : raw;
  return <TaxonomyView t={t} locale={locale} can={can} initialExam={isOneOf(QB_ADMIN_EXAMS, exam) ? exam : "JEE_MAIN"} />;
}
