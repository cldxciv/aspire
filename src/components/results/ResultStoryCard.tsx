import { FileCheck, GraduationCap, MapPin, School } from "lucide-react";
import Link from "next/link";
import { InitialsAvatar } from "@/components/faculty/InitialsAvatar";
import { AspireImage, Badge, DemoBadge } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import type { ResultRecord } from "@/lib/types";
import { distinctDestination, examYearLabel } from "./ResultCard";

/**
 * Featured success story: outcome, destination, the student's quote, school and
 * campus. Server component — pass `showName={canShowStudentName(result)}`.
 * No person photo beside the name (D-019): an initials avatar is used instead.
 */
export function ResultStoryCard({
  result,
  showName,
  centreName,
}: {
  result: ResultRecord;
  showName: boolean;
  centreName?: string;
}) {
  const name = showName ? result.studentDisplayName?.trim() || undefined : undefined;
  const destination = distinctDestination(result);
  const headingId = `story-${result.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col rounded-card border border-line bg-white p-5 shadow-soft md:p-6"
    >
      <div className="flex items-start gap-3">
        <InitialsAvatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className={name ? "text-lg font-bold leading-snug text-navy" : "text-lg font-bold text-muted"}>
            {name ?? "Name withheld"}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge>{examYearLabel(result)}</Badge>
            {result.status === "placeholder" && <DemoBadge label="Demo" />}
          </div>
        </div>
      </div>

      <p className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-navy">{result.rankOrOutcome}</p>
      {destination && (
        <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-ink">
          <GraduationCap aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue" />
          <span>
            <span className="sr-only">Destination: </span>
            {destination}
          </span>
        </p>
      )}

      {result.quote && (
        <figure className="mt-4 flex gap-3 rounded-control bg-surface p-4">
          {/* Decorative quote mark: 40px, well under the asset's maxWidth. */}
          <span className="block w-10 shrink-0 overflow-hidden rounded-md">
            <AspireImage asset={aspireAssets.quoteIcon} />
          </span>
          <div className="min-w-0">
            <blockquote className="text-sm italic text-ink">
              <p>{result.quote}</p>
            </blockquote>
            <figcaption className="mt-1 text-xs font-semibold text-muted">— {name ?? "Student"}</figcaption>
          </div>
        </figure>
      )}

      {(result.school || (result.centreSlug && centreName)) && (
        <dl className="mt-4 space-y-1.5 text-sm text-ink">
          {result.school && (
            <div className="flex gap-2">
              <dt className="mt-0.5 shrink-0 text-blue">
                <School aria-hidden="true" className="size-4" />
                <span className="sr-only">School</span>
              </dt>
              <dd className="min-w-0 break-words">{result.school}</dd>
            </div>
          )}
          {result.centreSlug && centreName && (
            <div className="flex gap-2">
              <dt className="mt-0.5 shrink-0 text-blue">
                <MapPin aria-hidden="true" className="size-4" />
                <span className="sr-only">Campus</span>
              </dt>
              <dd className="min-w-0">
                <Link href={`/centres#${result.centreSlug}`} className="font-semibold text-navy hover:underline">
                  {centreName}
                </Link>
              </dd>
            </div>
          )}
        </dl>
      )}

      <p className="mt-auto flex gap-1.5 pt-4 text-xs text-muted">
        <FileCheck aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span className="min-w-0 break-words">
          <span className="font-bold text-[#354b66]">Source:</span> {result.sourceReference}
        </span>
      </p>
    </article>
  );
}
