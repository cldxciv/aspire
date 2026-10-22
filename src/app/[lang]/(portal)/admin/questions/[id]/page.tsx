import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { QbMessages } from "@/components/qb-admin/api";
import { QbNotAllowed, QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { QbGate, type QbAccess } from "@/components/qb-admin/QbGate";
import { QuestionEditor } from "@/components/qb-admin/QuestionEditor";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // Generic: question text never goes into a tab title or browser history.
  const t = await getMessages("qb");
  return { title: t.editor.metaTitle, description: t.editor.metaDescription };
}

type Params = Promise<{ lang: string; id: string }>;

const QUESTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** One question: the editor and its review side column (§B7). The data loads from the admin API. */
export default async function QuestionPage({ params }: { params: Params }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <QbGate path={params.then(({ id }) => (QUESTION_ID.test(id) ? `/admin/questions/${id}` : "/admin/questions"))} title={t.editor.metaTitle}>
      {(access) => (
        <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
          <Editor params={params} access={access} locale={locale} t={t} />
        </Suspense>
      )}
    </QbGate>
  );
}

async function Editor({ params, access, locale, t }: { params: Params; access: QbAccess; locale: Locale; t: QbMessages }) {
  const { id } = await params;
  const back = (
    <Link href={localePath("/admin/questions", locale)} className="inline-flex min-h-11 items-center text-sm font-bold text-blue hover:underline">
      {t.common.backToList}
    </Link>
  );
  if (!QUESTION_ID.test(id)) {
    return (
      <>
        <QbPageHeader eyebrow={t.area.label} title={t.editor.metaTitle} actions={back} />
        <QbNotAllowed title={t.editor.loadFailed} body={t.errors.notFound} homeHref={localePath("/admin/questions", locale)} homeLabel={t.common.backToList} />
      </>
    );
  }
  return (
    <>
      <QbPageHeader eyebrow={t.area.label} title={t.editor.metaTitle} description={<span className="font-mono text-sm">{id}</span>} actions={back} />
      <QuestionEditor questionId={id} t={t} locale={locale} can={access.can} viewer={access.viewer} />
    </>
  );
}
