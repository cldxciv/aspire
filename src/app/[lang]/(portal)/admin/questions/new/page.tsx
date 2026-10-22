import type { Metadata } from "next";
import Link from "next/link";
import { QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { QbGate } from "@/components/qb-admin/QbGate";
import { QuestionEditor } from "@/components/qb-admin/QuestionEditor";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("qb");
  return { title: t.editor.newMetaTitle, description: t.editor.metaDescription };
}

/** A hand-made draft (`edit_draft`). Official sources need evidence (§B2); samples cannot be made here. */
export default async function NewQuestionPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <QbGate path="/admin/questions/new" title={t.editor.newTitle} need="edit_draft">
      {(access) => (
        <>
          <QbPageHeader
            eyebrow={t.area.label}
            title={t.editor.newTitle}
            actions={
              <Link href={localePath("/admin/questions", locale)} className="inline-flex min-h-11 items-center text-sm font-bold text-blue hover:underline">
                {t.common.backToList}
              </Link>
            }
          />
          <QuestionEditor questionId={null} t={t} locale={locale} can={access.can} viewer={access.viewer} />
        </>
      )}
    </QbGate>
  );
}
