"use client";

import { Copy, Download, MessageCircle, Share2 } from "lucide-react";
import Image from "next/image";
import { useId, useState } from "react";
import { Button, buttonClasses } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import {
  bucketRange,
  predictShareCard,
  shareBucketFor,
  type CollegeMatchPrediction,
  type ExamScoreTable,
  type PredictorData,
  type ShareBucket,
} from "@/lib/predictor/engine";
import { formatNumber, formatRankRange } from "./format";

/** Card image URL: exam + bucket only (no category, state, gender or name). */
export function shareCardUrl(bucket: ShareBucket): string {
  const query = new URLSearchParams({ exam: bucket.exam, mode: bucket.mode, from: String(bucket.from) });
  return `/api/predictor/card?${query.toString()}`;
}

/** WhatsApp share link (no prefilled phone number). */
export function whatsappHref(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/**
 * Share card preview + buttons (Web Share API, WhatsApp, download, copy link). The card and the
 * share text carry only the exam, a score/percentile bucket and the band computed for that bucket.
 */
export function SharePanel({
  result,
  data,
  table,
  messages,
  pageUrl,
}: {
  result: CollegeMatchPrediction;
  data: PredictorData | null;
  table: ExamScoreTable;
  messages: Pick<Messages<"predictor">, "share" | "result" | "form">;
  pageUrl: string;
}) {
  const locale = useLocale();
  const ids = useId();
  const t = messages.share;
  const [note, setNote] = useState("");
  const bucket = shareBucketFor(result.band.input, table);
  const card = predictShareCard(bucket, data);
  if (card.status !== "ok") return null;

  const range = bucketRange(bucket, table);
  const decimals = bucket.mode === "percentile" ? 2 : 0;
  const rangeText = format(bucket.mode === "percentile" ? t.rangePercentile : t.rangeScore, {
    from: formatNumber(range.low, locale, decimals),
    to: formatNumber(range.high, locale, decimals),
  });
  const examName = messages.form.exams[bucket.exam];
  const bandText = formatRankRange(card.crl, locale, messages.result.range);
  const text = format(card.sample ? t.textSample : t.text, { exam: examName, range: rangeText, band: bandText });
  const cardUrl = shareCardUrl(bucket);
  const titleId = `${ids}-title`;

  async function share() {
    setNote("");
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      setNote(t.unavailable);
      return;
    }
    try {
      await navigator.share({ title: examName, text, url: pageUrl });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setNote(t.unavailable);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setNote(t.copied);
    } catch {
      setNote(t.unavailable);
    }
  }

  return (
    <section aria-labelledby={titleId} className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-6">
      <h2 id={titleId} className="font-serif text-2xl font-bold text-navy">
        {t.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.lead}</p>
      <Image
        src={cardUrl}
        alt={format(t.previewAlt, { exam: examName, range: rangeText, band: bandText })}
        width={1200}
        height={630}
        unoptimized
        loading="lazy"
        className="mt-4 h-auto w-full rounded-control border border-line bg-surface"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={share} variant="dark" size="sm">
          <Share2 aria-hidden="true" className="size-4" />
          {t.share}
        </Button>
        <a href={whatsappHref(text, pageUrl)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "outline", size: "sm" })}>
          <MessageCircle aria-hidden="true" className="size-4" />
          {t.whatsapp}
          <span className="sr-only"> {t.opensInNewTab}</span>
        </a>
        <a href={cardUrl} download="aspire-rank-band.png" className={buttonClasses({ variant: "outline", size: "sm" })}>
          <Download aria-hidden="true" className="size-4" />
          {t.download}
        </a>
        <Button onClick={copy} variant="outline" size="sm">
          <Copy aria-hidden="true" className="size-4" />
          {t.copy}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-muted">
        {note}
      </p>
    </section>
  );
}
