import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { QbMessages } from "@/components/qb-admin/api";
import { parseQuestionFilters } from "@/components/qb-admin/filters";
import { QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { QbGate } from "@/components/qb-admin/QbGate";
import { QuestionList } from "@/components/qb-admin/QuestionList";
import { buttonClasses } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("qb");
  return { title: t.list.metaTitle, description: t.list.metaDescription };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The question list (§B7). Filters live in the URL; the list is fetched by the browser from the admin API. */
export default async function QuestionBankPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <QbGate path="/admin/questions" title={t.list.title}>
      {(access) => (
        <>
          <QbPageHeader
            eyebrow={t.area.label}
            title={t.list.title}
            description={t.list.lead}
            actions={
              access.can.edit_draft ? (
                <Link href={localePath("/admin/questions/new", locale)} className={buttonClasses({ variant: "primary" })}>
                  {t.list.newQuestion}
                </Link>
              ) : undefined
            }
          />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <List searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </QbGate>
  );
}

async function List({ searchParams, locale, t }: { searchParams: SearchParams; locale: Locale; t: QbMessages }) {
  const filters = parseQuestionFilters(await searchParams);
  return <QuestionList initialFilters={filters} t={t} locale={locale} pagePath="/admin/questions" syncUrl />;
}
