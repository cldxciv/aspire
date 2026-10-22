import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { HERO_ACTION, type HeroActionVariant } from "./hero-styles";

/** A site path ("/admissions", "/hi/results#x") or an in-page anchor: rendered with next/link. */
export function isInternalHref(href: string): boolean {
  return (href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#");
}

/**
 * A call to action in a hero (a link styled as a 48 px button). Internal paths use next/link;
 * `tel:`, `mailto:` and https links a plain `<a>`. `newTabLabel` opens the link in a new tab and
 * adds that text (e.g. `common.labels.opensInNewTab`) for screen readers.
 */
export function HeroAction({
  href,
  children,
  variant = "primary",
  icon,
  newTabLabel,
  className,
  "aria-label": ariaLabel,
}: {
  href: string;
  children: ReactNode;
  variant?: HeroActionVariant;
  /** Decorative icon after the text (give it aria-hidden). */
  icon?: ReactNode;
  newTabLabel?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const classes = cn(HERO_ACTION[variant], className);
  const body = (
    <>
      {children}
      {icon}
      {newTabLabel && <span className="sr-only"> {newTabLabel}</span>}
    </>
  );
  if (isInternalHref(href) && !newTabLabel) {
    return (
      <Link href={href} className={classes} aria-label={ariaLabel}>
        {body}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={classes}
      aria-label={ariaLabel}
      {...(newTabLabel ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {body}
    </a>
  );
}
