import type { Metadata } from "next";
import { Suspense } from "react";
import type { QbMessages } from "@/components/qb-admin/api";
import { isOneOf, QB_ADMIN_EXAMS } from "@/components/qb-admin/constants";
import { CoverageView } from "@/components/qb-admin/CoverageView";
import { QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { QbGate } from "@/components/qb-admin/QbGate";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("qb");
  return { title: t.coverage.metaTitle, description: t.coverage.metaDescription };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Approved questions per chapter and difficulty, figure backlog and answer positions (`?exam=`). */
export default async function CoveragePage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <QbGate path="/admin/questions/coverage" title={t.coverage.title}>
      {() => (
        <>
          <QbPageHeader eyebrow={t.area.label} title={t.coverage.title} description={t.coverage.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Coverage searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </QbGate>
  );
}

async function Coverage({ searchParams, locale, t }: { searchParams: SearchParams; locale: Locale; t: QbMessages }) {
  const raw = (await searchParams).exam;
  const exam = Array.isArray(raw) ? raw[0] : raw;
  return <CoverageView t={t} locale={locale} initialExam={isOneOf(QB_ADMIN_EXAMS, exam) ? exam : "JEE_MAIN"} />;
}
