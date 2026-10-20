import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AspireImage, ButtonLink, Card, DemoBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { Program } from "@/lib/types";
import { EXAM_META, programTracks, trackLabel } from "./exam-meta";
import { cardFacts } from "./program-facts";

/**
 * The `programs` messages a card reads (plus the DEMO label and, for the stock banner photo,
 * the visible "Illustrative stock photo" label from `common`, D-030).
 */
export type ProgramCardMessages = Pick<Messages<"programs">, "card" | "units" | "tracks"> & {
  demoLabel: string;
  stockPhotoLabel?: string;
};

/** Card-level focus ring, shown when the stretched title link has keyboard focus. */
const cardFocus =
  "has-[.card-link:focus-visible]:outline-3 has-[.card-link:focus-visible]:outline-offset-2 has-[.card-link:focus-visible]:outline-blue";

/** Cards sit in 1 / 2 / 3–4 column grids inside the 1200px container. */
const CARD_IMAGE_SIZES = "(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw";

/**
 * Program summary card (mockup `.card.program`). The title link is stretched over
 * the whole card; the optional "Enquire" action sits above it. When the program
 * has an `image`, it is shown as a fixed 16:9 banner (no layout shift); images are
 * decorative here (alt="") because the card's title and summary carry the meaning.
 * The track illustration (Aspire asset, 64px — well under its maxWidth) replaces the
 * old line icon. Course facts (class, duration, daily teaching, batch size) render
 * only when present. Safe to render from both server and client components; copy and
 * links follow `t` / `locale`.
 */
export function ProgramCard({
  program,
  t,
  locale,
  showEnquire = false,
  showFacts = true,
}: {
  program: Program;
  t: ProgramCardMessages;
  locale: Locale;
  /** Adds an "Enquire" button (programs directory). */
  showEnquire?: boolean;
  /** Shows the class / duration / daily teaching / batch size facts when the record has them. */
  showFacts?: boolean;
}) {
  const { tint, illustration } = EXAM_META[program.exam];
  const placeholder = program.status === "placeholder";
  const { image } = program;
  const tracks = programTracks(program);
  const facts = showFacts ? cardFacts(program, t.card.facts, t.units) : [];

  return (
    <Card tint={tint} interactive className={cn("@container group relative flex h-full flex-col", cardFocus)}>
      {image && (
        <div className="relative aspect-video overflow-hidden bg-blue-soft">
          <Image
            src={image.src}
            alt=""
            fill
            sizes={CARD_IMAGE_SIZES}
            className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
          />
          {t.stockPhotoLabel && (
            <span className="absolute left-2 top-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
              {t.stockPhotoLabel}
            </span>
          )}
        </div>
      )}
      {/* Roomier padding once the card is at least 18rem wide (narrow 4-up cards keep the compact size). */}
      <div className="flex flex-1 flex-col p-5 @min-[18rem]:p-6">
        <div className="mb-4 flex items-start justify-between gap-2">
          <span
            className={cn(
              "block w-16 shrink-0 overflow-hidden rounded-xl bg-blue-soft",
              image && "relative -mt-12 shadow-soft ring-4 ring-white",
            )}
          >
            <AspireImage asset={illustration} />
          </span>
          {placeholder && <DemoBadge label={t.demoLabel} />}
        </div>
        <h3 className="text-lg font-bold leading-snug text-navy">
          <Link
            href={localePath(`/programs/${program.slug}`, locale)}
            className="card-link after:absolute after:inset-0 after:content-[''] focus-visible:outline-hidden"
          >
            {program.title}
          </Link>
        </h3>
        {tracks.length > 0 && (
          <p className="mt-1.5 text-xs font-bold text-blue">
            <span className="sr-only">{t.card.preparesFor} </span>
            {tracks.map((track) => trackLabel(track, t.tracks)).join(" · ")}
          </p>
        )}
        <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted">{program.shortDescription}</p>
        {facts.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-2 text-xs @min-[18rem]:gap-2.5">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-lg bg-white/80 px-2.5 py-2 ring-1 ring-line @min-[18rem]:px-3 @min-[18rem]:py-2.5">
                <dt className="font-semibold text-muted">{fact.label}</dt>
                <dd className="mt-0.5 font-bold text-navy">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span aria-hidden="true" className="inline-flex items-center gap-1 text-sm font-extrabold text-blue">
            {t.card.learnMore} <ArrowRight className="size-4" />
          </span>
          {showEnquire && (
            <ButtonLink href={localePath("/admissions#enquiry", locale)} variant="dark" className="relative z-10">
              {t.card.enquire}
              <span className="sr-only"> {format(t.card.enquireSuffix, { title: program.title })}</span>
            </ButtonLink>
          )}
        </div>
      </div>
    </Card>
  );
}
