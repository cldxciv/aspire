import Link from "next/link";
import enCommon from "@/i18n/messages/en/common";
import hiCommon from "@/i18n/messages/hi/common";
import { localeFromPathname } from "@/i18n/paths";
import { cn } from "@/lib/cn";

export type Crumb = { label: string; href?: string };

/** `common` strings in the locale of `homeHref` (the hero's breadcrumb root). */
export function commonFor(homeHref: string) {
  return localeFromPathname(homeHref) === "hi" ? hiCommon : enCommon;
}

/**
 * Breadcrumb trail of every page hero (Home is prepended). Shared by `PageHero` (quiet) and
 * `HeroCopy` (rich heroes), so both render the same landmark: a named `<nav>` with an ordered
 * list, the last crumb marked `aria-current="page"`. Server-safe, no client JS.
 */
export function HeroBreadcrumbs({
  crumbs = [],
  homeLabel = "Home",
  homeHref = "/",
  label,
  className = "mb-3 text-xs text-[#b9d3f3]",
}: {
  /** Trail after Home; the last item is the current page and should omit href. */
  crumbs?: Crumb[];
  homeLabel?: string;
  homeHref?: string;
  /** Accessible name of the landmark; defaults to `common.labels.breadcrumb` in the locale of `homeHref`. */
  label?: string;
  className?: string;
}) {
  const trail: Crumb[] = [{ label: homeLabel, href: homeHref }, ...crumbs];
  return (
    <nav aria-label={label ?? commonFor(homeHref).labels.breadcrumb} className={cn(className)}>
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
  );
}
