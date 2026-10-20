import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import enCommon from "@/i18n/messages/en/common";
import hiCommon from "@/i18n/messages/hi/common";
import { localeFromPathname } from "@/i18n/paths";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Container } from "./Layout";

export type Crumb = { label: string; href?: string };

/**
 * Interior-page hero with breadcrumbs (Home is prepended automatically). Renders the page's only <h1>.
 *
 * With `image` (D-030) it becomes a 50/50 split on `lg+`: copy on the left, a rounded photo on the
 * right (stacked under the copy on smaller screens). `imageLabel` adds a visible caption pill
 * (e.g. "Illustrative stock photo") — use it for stock or AI imagery.
 *
 * Localisation: pass `homeLabel` / `homeHref` from the page's messages (defaults are English).
 * The breadcrumb landmark label follows the locale of `homeHref` unless `breadcrumbLabel` is given.
 */
export function PageHero({
  title,
  lead,
  crumbs = [],
  children,
  image,
  imageLabel,
  imagePriority = true,
  homeLabel = "Home",
  homeHref = "/",
  breadcrumbLabel,
}: {
  title: string;
  lead?: ReactNode;
  /** Trail after Home; the last item is the current page and should omit href. */
  crumbs?: Crumb[];
  children?: ReactNode;
  /** Optional hero photo (licensed stock or approved asset). Decorative: alt comes from the asset. */
  image?: ImageAsset;
  /** Visible label on the photo, e.g. "Illustrative stock photo". */
  imageLabel?: string;
  /** Preload the hero photo (it is above the fold). */
  imagePriority?: boolean;
  homeLabel?: string;
  homeHref?: string;
  /** Accessible name of the breadcrumb landmark; defaults to `common.labels.breadcrumb` in the locale of `homeHref`. */
  breadcrumbLabel?: string;
}) {
  const trail: Crumb[] = [{ label: homeLabel, href: homeHref }, ...crumbs];
  const navLabel =
    breadcrumbLabel ?? (localeFromPathname(homeHref) === "hi" ? hiCommon : enCommon).labels.breadcrumb;

  const copy = (
    <div className={cn(image && "lg:py-4")}>
      <nav aria-label={navLabel} className="mb-3 text-xs text-[#b9d3f3]">
        <ol className="flex flex-wrap items-center gap-1.5">
          {trail.map((crumb, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="hover:text-white hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
                )}
                {!last && <span aria-hidden="true">/</span>}
              </li>
            );
          })}
        </ol>
      </nav>
      <h1 className="font-serif text-[clamp(2rem,4.5vw,2.75rem)] font-semibold leading-tight tracking-tight">{title}</h1>
      {lead && <div className="mt-2.5 max-w-3xl text-[#dbe8f7]">{lead}</div>}
      {children && <div className="mt-5 flex flex-wrap gap-3">{children}</div>}
    </div>
  );

  return (
    <div data-surface="dark" className="bg-linear-to-r from-navy to-navy-2 py-9 text-white md:py-12">
      <Container>
        {image ? (
          <div className="grid items-center gap-7 lg:grid-cols-2 lg:gap-12">
            {copy}
            <figure className="relative">
              <div className="relative aspect-16/10 overflow-hidden rounded-card shadow-card ring-1 ring-white/15">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  preload={imagePriority}
                  sizes="(min-width: 1200px) 560px, (min-width: 1024px) 46vw, 100vw"
                  className="object-cover"
                />
              </div>
              {imageLabel && (
                <figcaption className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {imageLabel}
                </figcaption>
              )}
            </figure>
          </div>
        ) : (
          copy
        )}
      </Container>
    </div>
  );
}
