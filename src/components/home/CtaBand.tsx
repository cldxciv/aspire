import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui";

type CtaAction = { label: string; href: string };

/**
 * Mockup `.cta`: pale blue-to-gold band with a heading and up to two actions.
 * Used by several pages; `media` (optional) adds an image beside the copy — pass an
 * `<AspireImage>` so its maxWidth cap applies. Without `media` the layout is unchanged.
 */
export function CtaBand({
  headingId,
  title,
  description,
  primary,
  secondary,
  media,
}: {
  headingId: string;
  title: string;
  description: string;
  primary: CtaAction;
  secondary?: CtaAction;
  /** Decorative image shown above the copy on small screens and to its left from `lg`. */
  media?: ReactNode;
}) {
  const copy = (
    <div>
      <h2 id={headingId} className="text-[clamp(1.5rem,3vw,1.875rem)] font-extrabold leading-tight text-navy">
        {title}
      </h2>
      <p className="mt-2 text-muted">{description}</p>
    </div>
  );
  const actions = (
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
      <div className="grid items-center gap-5 rounded-card bg-linear-to-r from-[#eaf3ff] to-[#fff7dd] p-6 md:p-8 lg:grid-cols-[auto_1fr_auto] lg:gap-8">
        <div className="w-full max-w-sm lg:w-72">{media}</div>
        {copy}
        {actions}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start justify-between gap-5 rounded-card bg-linear-to-r from-[#eaf3ff] to-[#fff7dd] p-6 md:flex-row md:items-center md:p-8">
      {copy}
      {actions}
    </div>
  );
}
