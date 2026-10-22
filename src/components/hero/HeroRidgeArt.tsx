import { cn } from "@/lib/cn";

/**
 * B · Himalayan editorial art: three layered ridges and a low gold sun along the bottom of the
 * navy hero panel (owner-approved design, 2026-10-22). An illustration, not a photo, so D-031's
 * "landscape photos only in the home hero" rule is untouched. Decorative: `aria-hidden`.
 *
 * - The ridges are one SVG stretched across a bottom band (`preserveAspectRatio="none"`) whose
 *   height grows with the viewport (140 px on phones → 280 px from `xl`): steeper on a phone,
 *   wider on a big screen, never overflowing (the panel clips it).
 * - The sun is a separate round element on the right (never stretched, never cut), painted under
 *   the far ridge. `HeroPanel` adds bottom padding with the art so copy never sits on the sun
 *   (phones), and from `md` the copy column ends well left of it.
 * - Colours: every ridge keeps white ≥ 7:1 and gold ≥ 4.5:1. The snow caps sit behind the copy
 *   column on wide screens, so they stay faint (30 %): white text on a cap still 4.8:1.
 */
export function HeroRidgeArt({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" data-hero-art="ridges" className={cn("pointer-events-none absolute inset-0 -z-10", className)}>
      <span
        className={cn(
          "absolute right-[7%] block rounded-full bg-gold/90",
          "bottom-[59px] size-14 sm:bottom-[73px] sm:size-16 md:bottom-[78px] md:size-20 lg:bottom-[93px] lg:size-28 xl:bottom-[108px] xl:size-[132px]",
        )}
      />
      <svg
        focusable="false"
        viewBox="0 0 1280 300"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 block h-[140px] w-full sm:h-[170px] md:h-[190px] lg:h-[240px] xl:h-[280px]"
      >
        <path
          fill="#123d74"
          d="M0 150 L120 86 L210 120 L330 46 L430 108 L560 40 L690 122 L800 66 L930 128 L1050 60 L1180 118 L1280 84 V300 H0 Z"
        />
        <path fill="#e8f1ff" fillOpacity="0.3" d="M318 54 L330 46 L344 58 Z M548 48 L560 40 L573 51 Z M1038 68 L1050 60 L1063 71 Z" />
        <path
          fill="#174a88"
          d="M0 208 L150 156 L260 186 L380 130 L520 198 L640 146 L760 192 L900 140 L1020 200 L1140 154 L1280 192 V300 H0 Z"
        />
        <path
          fill="#1b5394"
          d="M0 262 L180 222 L320 254 L470 214 L610 258 L760 222 L910 262 L1060 226 L1200 258 L1280 244 V300 H0 Z"
        />
      </svg>
    </div>
  );
}
