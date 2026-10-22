import type { Metadata } from "next";
import { Suspense } from "react";
import type { QbMessages } from "@/components/qb-admin/api";
import { isOneOf, QB_QUEUES, type QbCapabilityMap } from "@/components/qb-admin/constants";
import { QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { QbGate } from "@/components/qb-admin/QbGate";
import { ReviewQueues } from "@/components/qb-admin/ReviewQueues";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("qb");
  return { title: t.review.metaTitle, description: t.review.metaDescription };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Review queues (§B7): `?queue=to_review|flagged|duplicates|calibration|wrong_key|reports|hindi`. */
export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <QbGate path="/admin/questions/review" title={t.review.title}>
      {(access) => (
        <>
          <QbPageHeader eyebrow={t.area.label} title={t.review.title} description={t.review.lead} />
          <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
            <Queues searchParams={searchParams} can={access.can} locale={locale} t={t} />
          </Suspense>
        </>
      )}
    </QbGate>
  );
}

async function Queues({ searchParams, can, locale, t }: { searchParams: SearchParams; can: QbCapabilityMap; locale: Locale; t: QbMessages }) {
  const raw = (await searchParams).queue;
  const queue = Array.isArray(raw) ? raw[0] : raw;
  return <ReviewQueues t={t} locale={locale} can={can} initialQueue={isOneOf(QB_QUEUES, queue) ? queue : "to_review"} />;
}
