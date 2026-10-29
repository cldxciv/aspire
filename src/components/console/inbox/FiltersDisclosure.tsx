"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** Tailwind's `lg` breakpoint (64rem): the filter form starts open from here up. */
const LG_QUERY = "(min-width: 64rem)";

/**
 * The Enquiries filter form folded into a native disclosure "Filters (2 on)" (docs/admin-phase-1b-
 * plan.md §5.I; owner: 1B-FAMILY): it starts closed below `lg` and open at `lg` and up, and from
 * then on it is an ordinary disclosure on every screen (the summary always opens AND closes it, so
 * its announced state is always true). A native `<details>` works before JavaScript loads. From
 * `lg` the content is shown from the first paint where the browser supports `::details-content`
 * (only while `data-first-paint` is set); the effect then opens the disclosure for real and drops
 * that attribute, so the user's later choice stands.
 */
export function FiltersDisclosure({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    if (typeof window.matchMedia === "function" && window.matchMedia(LG_QUERY).matches) details.open = true;
    details.removeAttribute("data-first-paint");
  }, []);
  return (
    <details ref={ref} className="group lg:data-first-paint:details-content:[content-visibility:visible]" data-first-paint="">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-control text-base font-extrabold text-navy [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <ChevronDown aria-hidden="true" className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
