import { ArrowRight } from "lucide-react";
import { ButtonLink, MediaSplit } from "@/components/ui";
import type { ImageAsset } from "@/lib/types";
import { BleedSplit } from "./BleedSplit";

type CtaAction = { label: string; href: string };

/**
 * Closing call to action as a 50/50 photo split (D-030): heading, one line and up to two
 * buttons beside a licensed stock photo. Used by the programs, results and centres pages.
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
  /** Optional caption under the photo (e.g. "a stock photo of the region, not a centre"). */
  caption?: string;
}) {
  return (
    <MediaSplit image={image} imageLabel={imageLabel} imageSide={imageSide} aspect="16/10" caption={caption}>
      <div className="rounded-card bg-linear-to-br from-[#eaf3ff] to-[#fff7dd] p-6 md:p-8">
        <h2 id={headingId} className="font-serif text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight text-navy">
          {title}
        </h2>
        <p className="mt-3 text-muted">{description}</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
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
 * viewport. Renders its own `<section aria-labelledby={headingId}>`: place it directly in the page.
 */
export function CtaBleedSplit({
  headingId,
  title,
  description,
  primary,
  secondary,
  image,
  imageLabel,
  imageSide = "right",
  caption,
  tone = "white",
}: Omit<Parameters<typeof CtaSplit>[0], "imageSide"> & {
  imageSide?: "left" | "right";
  tone?: "white" | "surface";
}) {
  return (
    <BleedSplit
      aria-labelledby={headingId}
      image={image}
      imageLabel={imageLabel}
      imageSide={imageSide}
      caption={caption}
      tone={tone}
    >
      <div className="rounded-card bg-linear-to-br from-[#eaf3ff] to-[#fff7dd] p-6 md:p-8">
        <h2 id={headingId} className="font-serif text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight text-navy">
          {title}
        </h2>
        <p className="mt-3 text-muted">{description}</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
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
