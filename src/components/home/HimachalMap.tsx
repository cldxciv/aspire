import { cn } from "@/lib/cn";

/**
 * Approximate, NOT-to-scale pin positions by centre slug, as a percentage of the map box
 * (x from the left, y from the top). Relative placement only: Dharamshala north-west,
 * Hamirpur west-centre, Kullu centre toward the north-east, Shimla south-east.
 *
 * Only centres that exist in the data get a pin; this table never adds a place on its own.
 * A centre whose slug is missing here is still listed in the picker, just without a pin.
 */
export const CENTRE_PIN_POSITIONS: Readonly<Record<string, { x: number; y: number }>> = {
  dharamshala: { x: 26, y: 33 },
  hamirpur: { x: 22, y: 60 },
  kullu: { x: 53, y: 42 },
  shimla: { x: 58, y: 77 },
};

/** Stylised outline: a soft hand-drawn shape, not survey geometry. */
const OUTLINE =
  "M70 40C95 18 140 22 168 34C200 20 240 12 278 26C318 38 352 40 372 68C390 98 376 130 384 160" +
  "C392 196 360 214 344 236C326 262 290 258 262 278C236 296 200 284 186 266C168 246 140 252 118 238" +
  "C92 222 64 226 50 200C36 176 54 150 42 126C30 100 52 66 70 40Z";

/** Decorative ridge lines clipped to the outline. */
const RIDGES = [
  "M40 110C90 92 130 118 180 100S280 80 390 104",
  "M40 160C100 140 150 168 210 150S310 128 390 150",
  "M40 210C110 190 160 214 220 198S320 180 390 196",
];

/**
 * Stylised silhouette of Himachal Pradesh (simplified, not to scale) used as the backdrop
 * of the centre picker. It shows no national or international boundaries, neighbouring
 * regions, roads or towns. Decorative only: the pins and the list in CentrePicker carry
 * the content, and the visible "Map not to scale" note is rendered beside it as HTML.
 *
 * The 400×300 viewBox fills a 4:3 box exactly, so CENTRE_PIN_POSITIONS (in %) line up.
 */
export function HimachalMap({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      className={cn("block size-full", className)}
    >
      <defs>
        <linearGradient id="hp-map-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d0e1f7" />
          <stop offset="1" stopColor="#e0ecfb" />
        </linearGradient>
        <clipPath id="hp-map-clip">
          <path d={OUTLINE} />
        </clipPath>
      </defs>
      <path d={OUTLINE} fill="url(#hp-map-fill)" stroke="#ffffff" strokeWidth="3" strokeLinejoin="round" />
      <g clipPath="url(#hp-map-clip)" fill="none" stroke="#b9d0ec" strokeWidth="1.5" strokeLinecap="round">
        {RIDGES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {/* A few stylised peaks along the northern ranges. */}
      <g fill="#c4d8f1" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M250 70l14-22 14 22z" />
        <path d="M272 74l18-28 18 28z" />
        <path d="M318 82l12-18 12 18z" />
        <path d="M120 66l11-17 11 17z" />
      </g>
    </svg>
  );
}
