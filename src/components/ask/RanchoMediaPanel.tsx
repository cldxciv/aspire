import { RanchoMascot } from "@/components/rancho/RanchoMascot";
import { cn } from "@/lib/cn";

/**
 * Put on an element that wraps a `RanchoMascot`: the stand-in SVG's idle loops (wave, blink) then
 * play once and finish within 4.5 s instead of looping forever, so motion that starts on its own
 * never runs past 5 s (WCAG 2.2.2 Pause, Stop, Hide). `prefers-reduced-motion` still stops it
 * entirely; the official artwork does not move. `svg *` outranks the mascot's own `animate-*`
 * classes, so no `!important` is needed. Interim: replace with a RanchoMascot prop once the
 * component's owner (RANCHO-UI) adds one.
 */
export const RANCHO_MOTION_ONCE = "[&_svg_*]:[animation-iteration-count:1] [&_svg_*]:[animation-duration:4.5s]";

/**
 * Rancho waving on a soft light backdrop, for a positioned media box: `PageHero` `media` on
 * /tools/ask and `MediaSplit` `media` on the /tools hub. It fills its box (`absolute inset-0`).
 *
 * The mascot is sized by width only inside a box with the stand-in's aspect ratio, so both the
 * temporary SVG and Aspire's official artwork (next/image, `h-auto`) fit without competing
 * height utilities. `caption` is a visible pill (e.g. "AI doubt solver") in the same style as
 * the "Illustrative stock photo" pills on the photos it sits beside. The wave plays once
 * (`RANCHO_MOTION_ONCE`), so the hero has no endless motion beside the copy.
 */
export function RanchoMediaPanel({ title, caption, className }: { title: string; caption?: string; className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-linear-to-b from-[#dce9fb] via-blue-soft to-gold-soft", className)}>
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-[62%] aspect-square w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/35 blur-2xl"
      />
      <div className="absolute inset-x-0 bottom-0 top-[8%] flex items-end justify-center">
        <div className={cn("flex aspect-[128/140] h-full max-w-[92%] items-end justify-center", RANCHO_MOTION_ONCE)}>
          <RanchoMascot variant="wave" title={title} className="max-h-full w-full" />
        </div>
      </div>
      {caption && (
        <span className="absolute left-2 top-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">{caption}</span>
      )}
    </div>
  );
}
