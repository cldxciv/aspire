import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AspireImage, ButtonLink, Card, DemoBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Program } from "@/lib/types";
import { EXAM_META, programTracks } from "./exam-meta";
import { cardFacts } from "./program-facts";

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
 * only when present. Safe to render from both server and client components.
 */
export function ProgramCard({
  program,
  showEnquire = false,
  showFacts = true,
}: {
  program: Program;
  /** Adds an "Enquire" button (programs directory). */
  showEnquire?: boolean;
  /** Shows the class / duration / daily teaching / batch size facts when the record has them. */
  showFacts?: boolean;
}) {
  const { tint, illustration } = EXAM_META[program.exam];
  const placeholder = program.status === "placeholder";
  const { image } = program;
  const tracks = programTracks(program);
  const facts = showFacts ? cardFacts(program) : [];

  return (
    <Card tint={tint} interactive className={cn("group relative flex h-full flex-col", cardFocus)}>
      {image && (
        <div className="relative aspect-video overflow-hidden bg-blue-soft">
          <Image
            src={image.src}
            alt=""
            fill
            sizes={CARD_IMAGE_SIZES}
            className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span
            className={cn(
              "block w-16 shrink-0 overflow-hidden rounded-xl bg-blue-soft",
              image && "relative -mt-12 shadow-soft ring-4 ring-white",
            )}
          >
            <AspireImage asset={illustration} />
          </span>
          {placeholder && <DemoBadge label="Demo" />}
        </div>
        <h3 className="text-lg font-bold leading-snug text-navy">
          <Link
            href={`/programs/${program.slug}`}
            className="card-link after:absolute after:inset-0 after:content-[''] focus-visible:outline-hidden"
          >
            {program.title}
          </Link>
        </h3>
        {tracks.length > 0 && (
          <p className="mt-1 text-xs font-bold text-blue">
            <span className="sr-only">Prepares for: </span>
            {tracks.map((track) => EXAM_META[track].label).join(" · ")}
          </p>
        )}
        <p className="mt-1.5 flex-1 text-sm text-muted">{program.shortDescription}</p>
        {facts.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-lg bg-white/80 px-2.5 py-2 ring-1 ring-line">
                <dt className="font-semibold text-muted">{fact.label}</dt>
                <dd className="mt-0.5 font-bold text-navy">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span aria-hidden="true" className="inline-flex items-center gap-1 text-sm font-extrabold text-blue">
            Learn more <ArrowRight className="size-4" />
          </span>
          {showEnquire && (
            <ButtonLink href="/admissions#enquiry" variant="dark" className="relative z-10">
              Enquire<span className="sr-only"> about {program.title}</span>
            </ButtonLink>
          )}
        </div>
      </div>
    </Card>
  );
}
