import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AspireImage, Card, DemoBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Program } from "@/lib/types";
import { TRACK_META } from "./track-meta";

/** Card-level focus ring, shown when the stretched title link has keyboard focus. */
const cardFocus =
  "has-[.card-link:focus-visible]:outline-3 has-[.card-link:focus-visible]:outline-offset-2 has-[.card-link:focus-visible]:outline-blue";

/** "5.5" → "5.5", "6" → "6" (no trailing zeros, no rounding of stated values). */
const formatNumber = (value: number) => String(value);

/**
 * Home-page program card (mockup `.card.program`): the track's program illustration
 * (aspireAssets.icon*Program, shown well under its maxWidth), tracks, summary and the
 * batch facts the source states. Facts that are absent are omitted, never filled in.
 * The title link is stretched over the card.
 */
export function HomeProgramCard({ program }: { program: Program }) {
  const { illustration, tint } = TRACK_META[program.exam];
  const tracks = program.tracks?.length ? program.tracks : [program.exam];
  const facts = [
    program.classLevel && { term: "For", detail: program.classLevel },
    program.duration && { term: "Duration", detail: program.duration },
    program.batchSize !== undefined && { term: "Batch size", detail: `Up to ${program.batchSize} students` },
    program.dailyContactHours !== undefined && {
      term: "Daily teaching",
      detail: `${formatNumber(program.dailyContactHours)} hrs / day`,
    },
  ].filter((fact): fact is { term: string; detail: string } => Boolean(fact));

  return (
    <Card tint={tint} interactive className={cn("relative flex h-full flex-col p-5", cardFocus)}>
      <div className="flex items-start justify-between gap-2">
        {/* Decorative: the title and track list carry the meaning. */}
        <AspireImage asset={illustration} rounded className="w-24 shadow-soft" />
        {program.status === "placeholder" && <DemoBadge label="Demo" />}
      </div>
      <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.12em] text-blue">
        {tracks.map((track) => TRACK_META[track].label).join(" · ")}
      </p>
      <h3 className="mt-1 text-lg font-bold leading-snug text-navy">
        <Link
          href={`/programs/${program.slug}`}
          className="card-link after:absolute after:inset-0 after:content-[''] focus-visible:outline-hidden"
        >
          {program.title}
        </Link>
      </h3>
      <p className="mt-1.5 text-sm text-muted">{program.shortDescription}</p>
      {facts.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3 text-xs">
          {facts.map((fact) => (
            <div key={fact.term}>
              <dt className="font-semibold text-muted">{fact.term}</dt>
              <dd className="font-bold text-ink">{fact.detail}</dd>
            </div>
          ))}
        </dl>
      )}
      <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-extrabold text-blue">
        Learn more <ArrowRight className="size-4" />
      </span>
    </Card>
  );
}
