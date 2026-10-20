import Link from "next/link";
import { defaultLocale, type Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";

/**
 * Serif wordmark + "A"-with-mountain mark recreated from the approved design
 * (reference/homepage/01). PLACEHOLDER: Aspire has not supplied official brand
 * files yet (docs/homepage-implementation-plan.md §7) — replace the inline SVG
 * and wordmark with the official logo when it arrives.
 *
 * `tone` describes the background the logo sits on:
 * - "light" (default): white/pale surfaces, e.g. the portal shell header — navy wordmark.
 * - "dark": navy surfaces, e.g. the site header and footer — white wordmark, gold mark.
 *
 * Localisation (D-028): pass `locale` (home link target) and `label` (accessible name, from
 * `common.logo.homeLabel`); the defaults are English. The wordmark is the brand and stays Latin.
 */
export function Logo({
  tone = "light",
  locale = defaultLocale,
  label = "Aspire IIT & Medical — home",
  className,
}: {
  tone?: "light" | "dark";
  locale?: Locale;
  label?: string;
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <Link
      href={localePath("/", locale)}
      className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-md", className)}
      aria-label={label}
    >
      <LogoMark dark={dark} />
      {/* Latin brand wordmark: lang="en" keeps its letter-spacing on Hindi pages (globals.css). */}
      <span lang="en" className={cn("flex flex-col font-serif leading-none", dark ? "text-white" : "text-navy")}>
        <span className="text-[26px] font-semibold tracking-[0.04em]">ASPIRE</span>
        <span
          className={cn(
            "mt-1 text-[10px] font-semibold tracking-[0.26em]",
            dark ? "text-[#d6e2f1]" : "text-muted",
          )}
        >
          IIT &amp; MEDICAL
        </span>
      </span>
    </Link>
  );
}

/** Decorative "A" whose crossbar is a mountain ridge. Placeholder artwork, not the official mark. */
function LogoMark({ dark }: { dark: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className="size-10 shrink-0" fill="none">
      {/* The "A": two strokes meeting at the summit. */}
      <path
        d="M4 36 20 4l16 32"
        stroke={dark ? "var(--color-gold)" : "var(--color-navy)"}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Mountain ridge in place of the crossbar. */}
      <path
        d="M10.5 30.5 16 23l3 3.5 4.5-7 6 11z"
        fill={dark ? "#ffffff" : "var(--color-gold-2)"}
        stroke={dark ? "#ffffff" : "var(--color-gold-2)"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
