import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Centres content at the 1200px max width with responsive gutters. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-content px-4 sm:px-5", className)} {...props} />;
}

export type SectionTone = "white" | "surface" | "navy";

const tones: Record<SectionTone, string> = {
  white: "bg-white",
  surface: "bg-surface",
  navy: "bg-linear-to-r from-navy to-navy-2 text-white",
};

/** Page section with vertical rhythm. Alternate white/surface; reserve navy for high-value emphasis. */
export function Section({
  tone = "white",
  className,
  containerClassName,
  children,
  ...props
}: ComponentProps<"section"> & { tone?: SectionTone; containerClassName?: string }) {
  return (
    <section className={cn("py-11 md:py-16", tones[tone], className)} {...props}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}

/**
 * Section heading row: optional eyebrow, title, description and a trailing action (e.g. a link).
 * Pass `id` and reference it from the section's aria-labelledby.
 */
export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  action,
  as: Heading = "h2",
  tone = "light",
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <p className={cn("mb-2 text-xs font-extrabold uppercase tracking-[0.14em]", dark ? "text-gold" : "text-blue")}>
            {eyebrow}
          </p>
        )}
        <Heading
          id={id}
          className={cn(
            "text-[clamp(1.6rem,3vw,2.25rem)] font-extrabold leading-tight tracking-tight",
            dark ? "text-white" : "text-navy",
          )}
        >
          {title}
        </Heading>
        {description && <p className={cn("mt-2", dark ? "text-[#d3e1f3]" : "text-muted")}>{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
