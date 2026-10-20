import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink, MediaSplit } from "@/components/ui";
import type { ImageAsset } from "@/lib/types";
import { BleedSplit } from "./BleedSplit";

type CtaAction = { label: string; href: string };

/**
 * Closing call to action as a 50/50 photo split (D-030): heading, one line and up to two
 * buttons beside a licensed stock photo (never a landscape, D-031).
 * Render inside a `<Section aria-labelledby={headingId}>`. Hrefs must already be localised.
 */
export function CtaSplit({
  headingId,
  title,
  description,
  primary,
  secondary,
  image,
  imageLabel,
  imageSide = "right",
  caption,
}: {
  headingId: string;
  title: string;
  description: string;
  primary: CtaAction;
  secondary?: CtaAction;
  image: ImageAsset;
  /** Visible label on the photo, e.g. common.labels.illustrativeStockPhoto. */
  imageLabel?: string;
  imageSide?: "left" | "right";
  /** Optional caption under the photo (e.g. "Stock photo for illustration — not taken at an Aspire centre"). */
  caption?: string;
}) {
  return (
    <MediaSplit image={image} imageLabel={imageLabel} imageSide={imageSide} aspect="16/10" caption={caption}>
      <div className="rounded-card bg-linear-to-br from-[#eaf3ff] to-[#fff7dd] p-6 sm:p-8 lg:p-10">
        <h2 id={headingId} className="font-serif text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight text-navy">
          {title}
        </h2>
        <p className="mt-4 max-w-prose leading-relaxed text-muted">{description}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href={primary.href}>
            {primary.label} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
          {secondary && (
            <ButtonLink href={secondary.href} variant="outline">
              {secondary.label}
            </ButtonLink>
          )}
        </div>
      </div>
    </MediaSplit>
  );
}

/**
 * The same closing call to action as a half-bleed photo section (`BleedSplit`, D-030): the
 * gradient copy box in one half of the container, the photo filling the other half of the
 * viewport. `media` (D-031, e.g. resultMosaicMedia()) replaces the photo when set; `image` is then
 * the fallback. Renders its own `<section aria-labelledby={headingId}>`: place it directly in the page.
 */
export function CtaBleedSplit({
  headingId,
  title,
  description,
  primary,
  secondary,
  image,
  media,
  imageLabel,
  imageSide = "right",
  caption,
  tone = "white",
}: Omit<Parameters<typeof CtaSplit>[0], "imageSide" | "caption"> & {
  imageSide?: "left" | "right";
  tone?: "white" | "surface";
  /** Replaces the photo when set (see BleedSplit). */
  media?: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <BleedSplit
      aria-labelledby={headingId}
      image={image}
      media={media}
      imageLabel={imageLabel}
      imageSide={imageSide}
      caption={caption}
      tone={tone}
    >
      <div className="rounded-card bg-linear-to-br from-[#eaf3ff] to-[#fff7dd] p-6 sm:p-8 lg:p-10">
        <h2 id={headingId} className="font-serif text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight text-navy">
          {title}
        </h2>
        <p className="mt-4 max-w-prose leading-relaxed text-muted">{description}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href={primary.href}>
            {primary.label} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
          {secondary && (
            <ButtonLink href={secondary.href} variant="outline">
              {secondary.label}
            </ButtonLink>
          )}
        </div>
      </div>
    </BleedSplit>
  );
}
