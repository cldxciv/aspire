import Image from "next/image";
import { Badge, DemoBadge } from "@/components/ui";
import type { ImageAsset, Milestone } from "@/lib/types";

/**
 * "Our journey" block (mockup `.history`): navy intro panel + milestone timeline.
 * Imagery with figures must never sit beside a name: the optional `image` is a landscape
 * (no people) behind the intro panel, under a navy gradient that keeps the copy legible.
 * On `lg+` the panel stretches to the timeline's height; below that the photo is a strip
 * under the copy.
 */
export function MilestoneTimeline({
  headingId,
  milestones,
  eyebrow,
  title,
  description,
  demoLabel,
  image,
  imageLabel,
}: {
  headingId: string;
  milestones: Milestone[];
  eyebrow: string;
  title: string;
  description: string;
  /** DEMO badge label (localised); omitted for verified content. */
  demoLabel?: string;
  /** Licensed landscape photo without people (pass it through `localizeImage`). Decorative. */
  image?: ImageAsset;
  /** Visible label on the photo ("Illustrative stock photo"). */
  imageLabel?: string;
}) {
  const ordered = [...milestones].sort((a, b) => a.year - b.year);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2 lg:items-stretch">
      <div
        data-surface="dark"
        className="relative isolate flex flex-col overflow-hidden rounded-card bg-linear-to-br from-navy to-navy-2 text-white lg:min-h-112"
      >
        <div className="flex flex-col gap-4 p-6 md:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">{eyebrow}</p>
          <h2 id={headingId} className="text-[clamp(1.6rem,3vw,2.25rem)] font-extrabold leading-snug tracking-tight">
            {title}
          </h2>
          <p className="text-[#d9e6f6]">{description}</p>
          {demoLabel && <DemoBadge label={demoLabel} className="self-start" />}
        </div>
        {image && (
          <div className="relative aspect-video lg:absolute lg:inset-0 lg:-z-10 lg:aspect-auto">
            <Image src={image.src} alt="" fill sizes="(min-width: 1024px) 1160px, 100vw" className="object-cover" />
            {/* Desktop: the copy sits on the top part, which stays ≥ 85 % navy. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 hidden bg-linear-to-b from-navy from-40% via-navy/85 via-65% to-navy/10 lg:block"
            />
            {imageLabel && (
              <span className="absolute right-2 bottom-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                {imageLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <ol className="grid content-start gap-3 sm:grid-cols-2">
        {ordered.map((milestone) => (
          <li
            key={`${milestone.year}-${milestone.title}`}
            className="rounded-r-control border-l-[3px] border-gold bg-white p-4 shadow-soft"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-extrabold text-blue">{milestone.year}</span>
              {milestone.tag && <Badge variant="info">{milestone.tag}</Badge>}
            </div>
            <h3 className="mt-1.5 font-bold leading-snug text-navy">{milestone.title}</h3>
            <p className="mt-1 text-sm text-muted">{milestone.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
