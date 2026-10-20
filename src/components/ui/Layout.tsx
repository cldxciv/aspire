import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Side gutters for page content (sections, heroes, splits). The site header keeps the narrower Container padding so the full nav fits at 1280px. */
export const SECTION_GUTTERS = "px-5 sm:px-6 md:px-8 lg:px-10";

/**
 * Page sections are rounded panels floating on the main area's soft backdrop (--color-gap), with a
 * visible gap between them (owner request). Use on every page-level block that isn't the hero:
 * `<Section>` applies it by default; custom full-width blocks (BleedSplit, CentresShowcase, CtaBand)
 * add it to their own <section>. `overflow-clip` (not hidden) keeps `position: sticky` working inside.
 */
export const SECTION_PANEL =
  "mx-2 mt-3 overflow-clip rounded-2xl shadow-panel ring-1 ring-navy/5 sm:mx-3 sm:mt-5 sm:rounded-[1.25rem] lg:mx-4 lg:mt-7 lg:rounded-[1.75rem] 2xl:mx-6";

/** The page hero (first block, under the navy header) stays full width and only rounds its bottom corners. */
export const HERO_PANEL = "overflow-clip rounded-b-2xl sm:rounded-b-[1.25rem] lg:rounded-b-[1.75rem]";

/**
 * Centres content at the 1200px max width with responsive gutters. `gutters="section"` uses the
 * wider page-content gutters (SECTION_GUTTERS) instead of the default ones — `cn` doesn't merge
 * conflicting Tailwind classes, so pick one set here rather than stacking both.
 */
export function Container({
  className,
  gutters = "default",
  ...props
}: ComponentProps<"div"> & { gutters?: "default" | "section" }) {
  return (
    <div
      className={cn("mx-auto w-full max-w-content", gutters === "section" ? SECTION_GUTTERS : "px-4 sm:px-5", className)}
      {...props}
    />
  );
}

export type SectionTone = "white" | "surface" | "blue" | "navy";

const tones: Record<SectionTone, string> = {
  white: "bg-white",
  surface: "bg-surface",
  /** Light blue band (homepage stats band, D-022). */
  blue: "bg-blue-soft/60",
  navy: "bg-linear-to-r from-navy to-navy-2 text-white",
};

/** Page section with vertical rhythm. Alternate white/surface; reserve navy for high-value emphasis. */
export function Section({
  tone = "white",
  panel = true,
  className,
  containerClassName,
  children,
  ...props
}: ComponentProps<"section"> & {
  tone?: SectionTone;
  /** Rounded floating panel with outer margins (default). Pass false for a plain full-width band. */
  panel?: boolean;
  containerClassName?: string;
}) {
  return (
    <section
      className={cn(panel && SECTION_PANEL, "py-14 sm:py-16 md:py-20 lg:py-24", tones[tone], className)}
      data-surface={tone === "navy" ? "dark" : undefined}
      {...props}
    >
      <Container gutters="section" className={containerClassName}>{children}</Container>
    </section>
  );
}

/**
 * Section heading row: optional eyebrow, title, description and a trailing action (e.g. a link).
 * Pass `id` and reference it from the section's aria-labelledby. The action sits beside the title
 * from `md`; in a half-width column pass `stack` (always under the title) or `stack="lg"` (under it
 * from `lg`, where a half-bleed split starts), so the title is not squeezed next to a badge.
 */
export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  action,
  as: Heading = "h2",
  tone = "light",
  stack = false,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
  tone?: "light" | "dark";
  stack?: boolean | "lg";
  className?: string;
}) {
  const dark = tone === "dark";
  const row =
    stack === true
      ? undefined
      : stack === "lg"
        ? "md:flex-row md:items-end md:justify-between lg:flex-col lg:items-start lg:justify-start"
        : "md:flex-row md:items-end md:justify-between";
  return (
    <div className={cn("mb-8 flex flex-col gap-4 md:mb-10 md:gap-6", row, className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <p className={cn("mb-2 text-xs font-extrabold uppercase tracking-[0.14em]", dark ? "text-gold" : "text-blue")}>
            {eyebrow}
          </p>
        )}
        <Heading
          id={id}
          className={cn(
            "text-[clamp(1.6rem,3vw,2.25rem)] font-extrabold leading-tight tracking-tight text-balance",
            dark ? "text-white" : "text-navy",
          )}
        >
          {title}
        </Heading>
        {description && <p className={cn("mt-3 leading-relaxed", dark ? "text-[#d3e1f3]" : "text-muted")}>{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
