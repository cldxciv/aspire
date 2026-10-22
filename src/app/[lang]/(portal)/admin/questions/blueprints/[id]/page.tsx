import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { QbMessages } from "@/components/qb-admin/api";
import { BlueprintEditor } from "@/components/qb-admin/BlueprintEditor";
import { QbNotAllowed, QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { QbGate, type QbAccess } from "@/components/qb-admin/QbGate";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("qb");
  return { title: t.blueprint.metaTitle, description: t.blueprints.metaDescription };
}

type Params = Promise<{ lang: string; id: string }>;

const BLUEPRINT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** One blueprint: pattern, editor (drafts), actions, readiness, sample paper and the 100-paper check. */
export default async function BlueprintPage({ params }: { params: Params }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <QbGate path={params.then(({ id }) => (BLUEPRINT_ID.test(id) ? `/admin/questions/blueprints/${id}` : "/admin/questions/blueprints"))} title={t.blueprint.metaTitle}>
      {(access) => (
        <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
          <Blueprint params={params} access={access} locale={locale} t={t} />
        </Suspense>
      )}
    </QbGate>
  );
}

async function Blueprint({ params, access, locale, t }: { params: Params; access: QbAccess; locale: Locale; t: QbMessages }) {
  const { id } = await params;
  const back = (
    <Link href={localePath("/admin/questions/blueprints", locale)} className="inline-flex min-h-11 items-center text-sm font-bold text-blue hover:underline">
      {t.blueprints.title}
    </Link>
  );
  if (!BLUEPRINT_ID.test(id)) {
    return (
      <>
        <QbPageHeader eyebrow={t.area.label} title={t.blueprint.metaTitle} actions={back} />
        <QbNotAllowed title={t.errors.notFound} body={t.errors.notFound} homeHref={localePath("/admin/questions/blueprints", locale)} homeLabel={t.blueprints.title} />
      </>
    );
  }
  return (
    <>
      <QbPageHeader eyebrow={t.area.label} title={t.blueprint.metaTitle} description={<span className="font-mono text-sm">{id}</span>} actions={back} />
      <BlueprintEditor blueprintId={id} t={t} locale={locale} can={access.can} />
    </>
  );
}
