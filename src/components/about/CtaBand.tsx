import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui";
import type { AspireAsset } from "@/content/aspire-assets";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Art } from "./Art";
import { PhotoPanel } from "./PhotoPanel";

type CtaLink = { label: string; href: string };

/**
 * Closing call-to-action band (mockup `.cta`). All copy and hrefs come from the caller's
 * messages; pass hrefs through `localePath()` so Hindi pages link to Hindi pages.
 *
 * With `image` (D-030) it becomes a wide photo panel with the copy on a navy gradient
 * (see `PhotoPanel`); pass `imageLabel` ("Illustrative stock photo") with it.
 *
 * With `media` (D-031) it becomes a navy panel with the copy and buttons in one row and `media`
 * as a full-width band below, e.g. an awaited standalone `ResultCardMosaic` (`variant="6x2"`) with
 * its own stock `fallbackImage` + `fallbackImageLabel` for production. Only where the band sits
 * beside no specific centre, campus or hostel.
 */
export function CtaBand({
  id = "cta-heading",
  title,
  description,
  primary,
  secondary,
  art,
  image,
  media,
  imageLabel,
  className,
}: {
  id?: string;
  title: string;
  description: string;
  primary: CtaLink;
  secondary?: CtaLink;
  /** Optional decorative illustration (never a person image — this band sits beside no names, keep it that way). */
  art?: AspireAsset;
  /** Optional licensed stock photo behind the copy (decorative; never a person beside a name). */
  image?: ImageAsset;
  /** A full-width band under the copy (e.g. previous results); takes precedence over `image`. */
  media?: ReactNode;
  imageLabel?: string;
  className?: string;
}) {
  const buttons = (
    <div className="flex flex-wrap gap-2.5">
      <ButtonLink href={primary.href}>
        {primary.label} <ArrowRight aria-hidden="true" className="size-4" />
      </ButtonLink>
      {secondary && (
        <ButtonLink href={secondary.href} variant="outline">
          {secondary.label}
        </ButtonLink>
      )}
    </div>
  );

  if (media) {
    return (
      <div
        data-surface="dark"
        className={cn("rounded-card bg-linear-to-br from-navy to-navy-2 p-5 text-white shadow-soft md:p-8", className)}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 id={id} className="text-2xl font-extrabold leading-snug tracking-tight text-white md:text-3xl">
              {title}
            </h2>
            <p className="mt-2 text-[#dbe8f7]">{description}</p>
          </div>
          {buttons}
        </div>
        {/* Light surface for the cards' own focus rings and badges (D-024). */}
        <div data-surface="light" className="mt-6">
          {media}
        </div>
      </div>
    );
  }

  if (image) {
    return (
      <PhotoPanel image={image} imageLabel={imageLabel} minHeight="lg" className={className}>
        <h2 id={id} className="text-2xl font-extrabold leading-snug tracking-tight text-white md:text-3xl">
          {title}
        </h2>
        <p className="mt-2 text-[#dbe8f7]">{description}</p>
        <div className="mt-6">{buttons}</div>
      </PhotoPanel>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-5 rounded-card bg-linear-to-r from-[#eaf3ff] to-[#fff7dd] p-6 md:flex-row md:items-center md:justify-between md:p-8",
        className,
      )}
    >
      <div className="flex items-center gap-5">
        {art && <Art asset={art} className="hidden w-28 shrink-0 sm:block" rounded />}
        <div>
          <h2 id={id} className="text-2xl font-extrabold tracking-tight text-navy md:text-3xl">
            {title}
          </h2>
          <p className="mt-2 text-muted">{description}</p>
        </div>
      </div>
      {buttons}
    </div>
  );
}
