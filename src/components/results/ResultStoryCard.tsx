import { FileCheck, GraduationCap, MapPin, School } from "lucide-react";
import Link from "next/link";
import { InitialsAvatar } from "@/components/faculty/InitialsAvatar";
import { AspireImage, Badge, DemoBadge } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import type { WithQuoteLang } from "@/lib/data";
import type { ResultRecord } from "@/lib/types";
import { distinctDestination, examYearLabel } from "./ResultCard";

/**
 * Featured success story: outcome, destination, the student's quote, school and
 * campus. Server component — pass `showName={canShowStudentName(result)}`.
 * No person photo beside the name (D-019): an initials avatar is used instead.
 * The quote is the student's own (English) words: `lang={result.quoteLang}` on Hindi pages.
 */
export function ResultStoryCard({
  result,
  showName,
  centreName,
  locale,
}: {
  result: WithQuoteLang<ResultRecord>;
  showName: boolean;
  centreName?: string;
  locale: Locale;
}) {
  const t = messagesFor(locale, "results").card;
  const tracks = messagesFor(locale, "programs").tracks;
  const demoLabel = messagesFor(locale, "common").labels.demo;
  const name = showName ? result.studentDisplayName?.trim() || undefined : undefined;
  const destination = distinctDestination(result);
  const headingId = `story-${result.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col rounded-card border border-line bg-white p-6 shadow-soft md:p-7"
    >
      <div className="flex items-start gap-4">
        <InitialsAvatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className={name ? "text-lg font-bold leading-snug text-navy" : "text-lg font-bold text-muted"}>
            {name ?? t.nameWithheld}
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge>{examYearLabel(result, tracks)}</Badge>
            {result.status === "placeholder" && <DemoBadge label={demoLabel} />}
          </div>
        </div>
      </div>

      <p className="mt-5 text-2xl font-extrabold leading-tight tracking-tight text-navy">{result.rankOrOutcome}</p>
      {destination && (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold text-ink">
          <GraduationCap aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue" />
          <span>
            <span className="sr-only">{t.destinationPrefix} </span>
            {destination}
          </span>
        </p>
      )}

      {result.quote && (
        <figure className="mt-5 flex gap-3 rounded-control bg-surface p-4 md:p-5">
          {/* Decorative quote mark: 40px, well under the asset's maxWidth. */}
          <span className="block w-10 shrink-0 overflow-hidden rounded-md">
            <AspireImage asset={aspireAssets.quoteIcon} />
          </span>
          <div className="min-w-0">
            <blockquote lang={result.quoteLang} className="text-sm italic leading-relaxed text-ink">
              <p>{result.quote}</p>
            </blockquote>
            <figcaption className="mt-1.5 text-xs font-semibold text-muted">— {name ?? t.student}</figcaption>
          </div>
        </figure>
      )}

      {(result.school || (result.centreSlug && centreName)) && (
        <dl className="mt-5 space-y-2 text-sm text-ink">
          {result.school && (
            <div className="flex gap-2">
              <dt className="mt-0.5 shrink-0 text-blue">
                <School aria-hidden="true" className="size-4" />
                <span className="sr-only">{t.school}</span>
              </dt>
              <dd className="min-w-0 break-words">{result.school}</dd>
            </div>
          )}
          {result.centreSlug && centreName && (
            <div className="flex gap-2">
              <dt className="mt-0.5 shrink-0 text-blue">
                <MapPin aria-hidden="true" className="size-4" />
                <span className="sr-only">{t.campus}</span>
              </dt>
              <dd className="min-w-0">
                <Link
                  href={localePath(`/centres#${result.centreSlug}`, locale)}
                  className="font-semibold text-navy hover:underline"
                >
                  {centreName}
                </Link>
              </dd>
            </div>
          )}
        </dl>
      )}

      <p className="mt-auto flex gap-1.5 pt-5 text-xs text-muted">
        <FileCheck aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          <span className="font-bold text-[#354b66]">{t.source}</span> {result.sourceReference}
        </span>
      </p>
    </article>
  );
}
