import { FileCheck, GraduationCap, MapPin, School } from "lucide-react";
import Link from "next/link";
import { InitialsAvatar } from "@/components/faculty/InitialsAvatar";
import { trackLabel, type TrackLabels } from "@/components/programs/exam-meta";
import { Badge, Card, DemoBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import type { ResultRecord } from "@/lib/types";
import { formatIsoDate } from "./format-date";

/** Copy a result card reads: `results.card`, `programs.tracks` and the DEMO label. */
export type ResultCardMessages = { card: Messages<"results">["card"]; tracks: TrackLabels; demo: string };

/** Exam badge text, e.g. "JEE Advanced · 2025" (falls back to the track label). */
export function examYearLabel(result: Pick<ResultRecord, "exam" | "examLabel" | "year">, tracks?: TrackLabels): string {
  return `${result.examLabel?.trim() || trackLabel(result.exam, tracks)} · ${result.year}`;
}

/** Destination, unless the outcome line already says it (e.g. "Allotted: AIIMS Jodhpur"). */
export function distinctDestination(result: Pick<ResultRecord, "destination" | "rankOrOutcome">): string | undefined {
  const destination = result.destination?.trim();
  return destination && !result.rankOrOutcome.includes(destination) ? destination : undefined;
}

/**
 * One result record. The student's name is shown only when `showName` is true —
 * server components pass `canShowStudentName(result)`; client lists receive records
 * whose names were already stripped on the server (server-view.ts). Without
 * `showName` the card falls back to the strict rule (consent granted). No photos:
 * an initials avatar sits beside the name. The source reference is always shown.
 * Safe to render from both server and client components; copy and links follow `t` / `locale`.
 */
export function ResultCard({
  result,
  showName,
  centreName,
  t,
  locale,
}: {
  result: ResultRecord;
  /** Whether the name may be rendered (pass canShowStudentName(result) from the server). */
  showName?: boolean;
  /** Campus name for `result.centreSlug`, linked to /centres#<slug>. */
  centreName?: string;
  t: ResultCardMessages;
  locale: Locale;
}) {
  const allowed = showName ?? result.consentStatus === "granted";
  const name = allowed ? result.studentDisplayName?.trim() || undefined : undefined;
  const destination = distinctDestination(result);
  const c = t.card;

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{examYearLabel(result, t.tracks)}</Badge>
        {result.status === "placeholder" && <DemoBadge label={t.demo} />}
      </div>
      <div className="mt-3 flex items-start gap-3">
        <InitialsAvatar name={name} size="sm" />
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug text-navy">{result.rankOrOutcome}</h3>
          <p className={name ? "text-sm font-semibold text-ink" : "text-sm text-muted"}>{name ?? c.nameWithheld}</p>
        </div>
      </div>
      {(destination || result.school || (result.centreSlug && centreName)) && (
        <dl className="mt-3 space-y-1.5 text-sm text-ink">
          {destination && (
            <div className="flex gap-2">
              <dt className="mt-0.5 shrink-0 text-blue">
                <GraduationCap aria-hidden="true" className="size-4" />
                <span className="sr-only">{c.destination}</span>
              </dt>
              <dd className="min-w-0 break-words">{destination}</dd>
            </div>
          )}
          {result.school && (
            <div className="flex gap-2">
              <dt className="mt-0.5 shrink-0 text-blue">
                <School aria-hidden="true" className="size-4" />
                <span className="sr-only">{c.school}</span>
              </dt>
              <dd className="min-w-0 break-words">{result.school}</dd>
            </div>
          )}
          {result.centreSlug && centreName && (
            <div className="flex gap-2">
              <dt className="mt-0.5 shrink-0 text-blue">
                <MapPin aria-hidden="true" className="size-4" />
                <span className="sr-only">{c.campus}</span>
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
      <dl className="mt-auto space-y-1 pt-4 text-xs text-muted">
        <div className="flex gap-1">
          <dt className="flex shrink-0 items-start gap-1.5 font-bold text-[#354b66]">
            <FileCheck aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {c.source}
          </dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{result.sourceReference}</dd>
        </div>
        {result.verifiedAt && (
          <div className="flex gap-1 pl-5">
            <dt className="shrink-0 font-bold text-[#354b66]">{c.verified}</dt>
            <dd>{formatIsoDate(result.verifiedAt, c.months)}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
