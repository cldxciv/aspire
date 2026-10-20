import Image from "next/image";
import { useId } from "react";

import { cn } from "@/lib/cn";

import { OFFICIAL_RANCHO_ART_AVAILABLE, RANCHO_ART } from "./rancho-assets";

/**
 * Rancho, Aspire's mascot (Ask Aspire is "Rancho"; docs/rancho.md).
 *
 * - `head`: face / avatar, square. `wave`: upper body with one paw waving (heroes, empty states).
 * - Decorative (`aria-hidden`) without `title`; `role="img"` + `<title>` with one.
 * - Server-safe: no client JS. Size it with `className` (e.g. "h-8 w-8").
 *
 * PLACEHOLDER: the SVG below is a temporary stand-in drawn for the site. Rancho is Aspire's own
 * existing character; once the official artwork is in `public/images/rancho/`, flip
 * `OFFICIAL_RANCHO_ART_AVAILABLE` in ./rancho-assets.ts and this renders that art instead.
 */
export function RanchoMascot({
  variant = "head",
  className,
  title,
}: {
  variant?: "head" | "wave";
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (OFFICIAL_RANCHO_ART_AVAILABLE) return <RanchoOfficialArt variant={variant} className={className} title={title} />;

  const titleId = `rancho-${uid}-title`;
  // Per-instance ids, so several mascots on one page never share gradients / clip paths.
  const ids: Ids = { fur: `rancho-${uid}-fur`, vest: `rancho-${uid}-vest`, clip: `rancho-${uid}-clip` };
  const head = variant === "head";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={head ? "0 0 100 100" : "0 0 128 140"}
      className={cn("block", className)}
      focusable="false"
      {...(title ? { role: "img", "aria-labelledby": titleId } : { "aria-hidden": true })}
      data-rancho={variant}
      data-placeholder="true"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <style>{KEYFRAMES}</style>
      <defs>
        <radialGradient id={ids.fur} cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" stopColor={FUR_LIGHT} />
          <stop offset="0.6" stopColor={FUR} />
          <stop offset="1" stopColor={FUR_SHADE} />
        </radialGradient>
        <linearGradient id={ids.vest} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={VEST_LIGHT} />
          <stop offset="1" stopColor={VEST_DARK} />
        </linearGradient>
        <clipPath id={ids.clip}>
          <path d={FACE} />
        </clipPath>
      </defs>
      {head ? (
        <>
          <AvatarCollar ids={ids} />
          <g transform="translate(5 0) scale(0.9)">
            <Face ids={ids} />
          </g>
        </>
      ) : (
        <>
          <WaveBody ids={ids} />
          <g transform="translate(18 1) scale(0.8)">
            <Face ids={ids} />
          </g>
          <WavingArm />
        </>
      )}
    </svg>
  );
}

/** The official artwork (only used when OFFICIAL_RANCHO_ART_AVAILABLE is true). Exported for tests. */
export function RanchoOfficialArt({ variant = "head", className, title }: { variant?: "head" | "wave"; className?: string; title?: string }) {
  const art = RANCHO_ART[variant];
  return (
    <Image
      src={art.src}
      width={art.width}
      height={art.height}
      sizes={art.sizes}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      className={cn("block h-auto object-contain", className)}
      data-rancho={variant}
    />
  );
}

/* ---------- temporary stand-in drawing ----------
 * Flat vector rendition of Rancho as he appears in Aspire's reels: a snow leopard with cream fur,
 * dark rosettes, white muzzle, blue-grey eyes behind thin black glasses, a chocolate Nehru-style
 * vest with the "ASPIRE / IIT & MEDICAL" chest badge over a beige shirt, and a wristwatch.
 * Spots are kept few and bold so the face still reads at 20–32 px.
 */

type Ids = { fur: string; vest: string; clip: string };

const FUR = "#ecdfc6";
const FUR_LIGHT = "#f7efe0";
const FUR_SHADE = "#d6c1a0";
const MUZZLE = "#fcf8f0";
const SPOT = "#3b2a1e"; // rosettes, brows, outline
const ROSETTE = "#c9ad88"; // tawny centre of a rosette
const EAR_BACK = "#4d3a2b";
const EAR_INNER = "#f4e9d6";
const EAR_SHADE = "#dcc5a8";
const IRIS = "#7f9bad";
const PUPIL = "#1e1a17";
const FRAME = "#1a1411";
const NOSE = "#b5786a";
const NOSE_DARK = "#5c3429";
const MOUTH = "#5a2a24";
const TONGUE = "#d9877d";
const VEST_LIGHT = "#5a3a2a";
const VEST_DARK = "#36211a";
const SHIRT = "#d9c6a5";
const SHIRT_SHADE = "#bba582";
const RED = "#c4262e";
const PAD = "#c99184";
const WATCH_BAND = "#2c2522";
const WATCH_FACE = "#cfd4d9";

/** Head outline in the 100×100 face frame: round crown, fluffy cheek ruffs, soft jaw. */
const FACE =
  "M50 12C67 12 80 20 84.5 33C87 39 88.5 45 89.5 51C92 53 95 55 96 58C93.5 59 91.5 59.5 90 60C92.5 62.5 94 65 94.5 68" +
  "C92 68 89.5 68.5 88 69C85 80 71 89 50 89C29 89 15 80 12 69C10.5 68.5 8 68 5.5 68C6 65 7.5 62.5 10 60" +
  "C8.5 59.5 6.5 59 4 58C5 55 8 53 10.5 51C11.5 45 13 39 15.5 33C20 20 33 12 50 12Z";

const MOUTH_PATH = "M38.6 66.8C42.8 69.6 47 69 50 67.4C53 69 57.2 69.6 61.4 66.8C60 72.8 55.4 75.8 50 75.8C44.6 75.8 40 72.8 38.6 66.8Z";

// Idle motion only under prefers-reduced-motion: no-preference (Tailwind `motion-safe:`).
const KEYFRAMES =
  "@keyframes rancho-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.12)}}" +
  "@keyframes rancho-wave{0%,55%,100%{transform:rotate(0deg)}62%,76%{transform:rotate(14deg)}69%,83%{transform:rotate(-10deg)}}";

/**
 * Monoline capitals for the chest badge, drawn as paths (cap height 10) rather than SVG <text>, so
 * the mascot adds no text to the page: nothing leaks into a button's accessible name, find-in-page
 * or copied text. Only the letters the badge needs: [advance width, path].
 */
const GLYPHS: Record<string, [number, string]> = {
  A: [7.2, "M0 10L3.6 0L7.2 10M1.4 6.4H5.8"],
  C: [6.2, "M6.2 2C5.5 0.7 4.4 0 3.2 0C1.4 0 0 2 0 5C0 8 1.4 10 3.2 10C4.4 10 5.5 9.3 6.2 8"],
  D: [6.4, "M0.3 0V10H2.8C5 10 6.4 8 6.4 5C6.4 2 5 0 2.8 0Z"],
  E: [5.6, "M5.6 0H0.3V10H5.6M0.3 5H4.8"],
  I: [2, "M0 0H2M1 0V10M0 10H2"],
  L: [5.4, "M0.3 0V10H5.4"],
  M: [7.6, "M0.3 10V0L3.8 6.4L7.3 0V10"],
  P: [6, "M0.3 10V0H3.4C5 0 6 1.1 6 2.9C6 4.7 5 5.8 3.4 5.8H0.3"],
  R: [6.3, "M0.3 10V0H3.4C5 0 6 1.1 6 2.9C6 4.7 5 5.8 3.4 5.8H0.3M3.4 5.8L6.3 10"],
  S: [6.2, "M6 1.6C5.3 0.5 4.3 0 3.1 0C1.4 0 0.2 1 0.2 2.5C0.2 5.6 6 4.4 6 7.5C6 9 4.8 10 3.1 10C1.6 10 0.5 9.4 0 8.2"],
  T: [6, "M0 0H6M3 0V10"],
  "&": [6.6, "M6.4 10L1.8 4.2C0.9 3.1 1.1 0 3.2 0C5.2 0 5.4 2.6 3.6 3.9L1.4 5.6C-0.4 7 0.3 10 2.8 10C4.4 10 5.6 8.6 6.4 6.6"],
  " ": [3, ""],
};
const GLYPH_GAP = 1.6;
const round = (n: number) => Math.round(n * 1000) / 1000;

/** White badge lettering centred on `x`, top at `y`, `height` = cap height, `weight` = stroke (user units). */
function Lettering({ text, x, y, height, weight }: { text: string; x: number; y: number; height: number; weight: number }) {
  const scale = height / 10;
  let cursor = 0;
  const glyphs: { x: number; d: string }[] = [];
  for (const char of text) {
    const [advance, d] = GLYPHS[char] ?? GLYPHS[" "];
    if (d) glyphs.push({ x: round(cursor), d });
    cursor += advance + GLYPH_GAP;
  }
  const width = (cursor - GLYPH_GAP) * scale;
  return (
    <g
      transform={`translate(${round(x - width / 2)} ${y}) scale(${round(scale)})`}
      fill="none"
      stroke="#fff"
      strokeWidth={round(weight / scale)}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyphs.map((glyph, index) => (
        <path key={index} d={glyph.d} transform={glyph.x ? `translate(${glyph.x} 0)` : undefined} />
      ))}
    </g>
  );
}

/** A snow-leopard rosette: tawny centre inside a broken dark ring. */
function Rosette({ x, y, r, turn = 0 }: { x: number; y: number; r: number; turn?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn})`}>
      <circle r={r} fill={ROSETTE} />
      <circle r={r} fill="none" stroke={SPOT} strokeWidth={r * 0.66} strokeDasharray={`${r * 1.9} ${r * 0.7}`} strokeLinecap="round" />
    </g>
  );
}

function Face({ ids }: { ids: Ids }) {
  return (
    <g strokeLinejoin="round">
      {/* ears: rounded, set wide, dark backs and pale fronts */}
      {[0, 1].map((side) => (
        <g key={side} transform={side ? "matrix(-1 0 0 1 100 0)" : undefined}>
          <path d="M13 38C8.5 27 9.5 15.5 16 11.5C22 8 30 11 38 18.5Z" fill={EAR_BACK} stroke={SPOT} strokeWidth="2.4" />
          <path d="M15.5 34C13 25.5 14 17 19 14C23.5 11.5 29.5 13.5 35 19.5Z" fill={EAR_INNER} />
          <path d="M19 29C18 24.5 19 20.5 22 19.5C24.5 18.8 27.5 20.5 30 23.5Z" fill={EAR_SHADE} />
        </g>
      ))}

      {/* head */}
      <path d={FACE} fill={`url(#${ids.fur})`} />

      {/* spots: a few bold ones (clipped to the head) */}
      <g clipPath={`url(#${ids.clip})`}>
        <g fill={SPOT}>
          <ellipse cx="50" cy="19" rx="2.5" ry="1.9" />
          <ellipse cx="44.4" cy="23" rx="1.6" ry="2.1" transform="rotate(20 44.4 23)" />
          <ellipse cx="56" cy="22.6" rx="2" ry="1.5" transform="rotate(-15 56 22.6)" />
          <ellipse cx="50.6" cy="27" rx="1.3" ry="1.7" />
          <ellipse cx="39" cy="18.4" rx="1.9" ry="1.3" transform="rotate(-30 39 18.4)" />
          <circle cx="61.6" cy="17.8" r="1.5" />
          <ellipse cx="33" cy="25" rx="2" ry="1.4" transform="rotate(35 33 25)" />
          <ellipse cx="67.4" cy="25.4" rx="1.8" ry="1.5" transform="rotate(-40 67.4 25.4)" />
          <circle cx="45" cy="15.4" r="1.1" />
          <circle cx="56.2" cy="14.8" r="1.2" />
          <ellipse cx="19.4" cy="34" rx="1.9" ry="1.4" transform="rotate(-20 19.4 34)" />
          <ellipse cx="80.6" cy="34" rx="1.9" ry="1.4" transform="rotate(20 80.6 34)" />
        </g>
        <Rosette x={28.5} y={19.5} r={2.3} turn={-60} />
        <Rosette x={71.5} y={19.5} r={2.3} turn={240} />
        <Rosette x={12.8} y={47} r={3.3} turn={20} />
        <Rosette x={87.2} y={47} r={3.3} turn={160} />
        <Rosette x={11.6} y={61} r={3.1} turn={-40} />
        <Rosette x={88.4} y={61} r={3.1} turn={220} />
        <Rosette x={21} y={73} r={3.3} turn={70} />
        <Rosette x={79} y={73} r={3.3} turn={110} />
      </g>
      <path d={FACE} fill="none" stroke={SPOT} strokeWidth="2.4" />

      {/* light nose bridge + white muzzle and chin */}
      <ellipse cx="50" cy="46" rx="5.5" ry="10" fill={FUR_LIGHT} />
      <path
        d="M50 56C42 55.5 31.5 58.5 31 66.5C30.5 75 38 84 50 85C62 84 69.5 75 69 66.5C68.5 58.5 58 55.5 50 56Z"
        fill={MUZZLE}
      />
      <g fill={SPOT} opacity="0.55">
        <circle cx="37.6" cy="63.6" r="0.85" />
        <circle cx="35.2" cy="66.4" r="0.85" />
        <circle cx="39.4" cy="66.8" r="0.85" />
        <circle cx="62.4" cy="63.6" r="0.85" />
        <circle cx="64.8" cy="66.4" r="0.85" />
        <circle cx="60.6" cy="66.8" r="0.85" />
      </g>

      {/* bold dark brow markings sitting on the frames */}
      <g fill={SPOT}>
        <path d="M24.5 36.5C27.5 28.5 39.5 25.8 47 31.4C40 31.4 31 32.6 24.5 36.5Z" />
        <path d="M75.5 36.5C72.5 28.5 60.5 25.8 53 31.4C60 31.4 69 32.6 75.5 36.5Z" />
      </g>

      {/* blue-grey eyes */}
      <g className="origin-center [transform-box:fill-box] motion-safe:animate-[rancho-blink_6s_ease-in-out_infinite]">
        <ellipse cx="36.5" cy="45" rx="4.5" ry="4.7" fill={IRIS} />
        <ellipse cx="63.5" cy="45" rx="4.5" ry="4.7" fill={IRIS} />
        <circle cx="37" cy="45.4" r="2.5" fill={PUPIL} />
        <circle cx="63" cy="45.4" r="2.5" fill={PUPIL} />
        <circle cx="35.4" cy="43.4" r="1.15" fill="#fff" />
        <circle cx="61.4" cy="43.4" r="1.15" fill="#fff" />
        <path d="M31.4 43.6C33.4 39.4 39.6 39.4 41.6 43.6M58.4 43.6C60.4 39.4 66.6 39.4 68.6 43.6" fill="none" stroke={SPOT} strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* thin black round-rectangular glasses */}
      <g fill="none" stroke={FRAME} strokeLinecap="round">
        <rect x="25.5" y="36.6" width="22" height="17" rx="6.5" fill="#fff" fillOpacity="0.16" strokeWidth="2.4" />
        <rect x="52.5" y="36.6" width="22" height="17" rx="6.5" fill="#fff" fillOpacity="0.16" strokeWidth="2.4" />
        <path d="M47.5 42.2C48.8 40.6 51.2 40.6 52.5 42.2M25.5 41.4L13.5 39.8M74.5 41.4L86.5 39.8" strokeWidth="2.2" />
        <path d="M42.4 39.6L44.6 41.8M69.4 39.6L71.6 41.8" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.1" />
      </g>

      {/* pink-brown nose */}
      <path
        d="M43.5 56.4C46 54.7 54 54.7 56.5 56.4C57.5 57.3 57 58.6 56.2 59.4L51.6 63.4C50.7 64.2 49.3 64.2 48.4 63.4L43.8 59.4C43 58.6 42.5 57.3 43.5 56.4Z"
        fill={NOSE}
        stroke={NOSE_DARK}
        strokeWidth="1"
      />
      <ellipse cx="47.6" cy="57.3" rx="2" ry="0.9" fill="#fff" opacity="0.45" />

      {/* warm, wide toothy grin */}
      <path d="M50 63.8V67" stroke={SPOT} strokeWidth="1.3" strokeLinecap="round" />
      <path d={MOUTH_PATH} fill={MOUTH} />
      <path d="M44.4 73.8C46.8 71.9 53.2 71.9 55.6 73.8C54.2 75.2 52.2 75.8 50 75.8C47.8 75.8 45.8 75.2 44.4 73.8Z" fill={TONGUE} />
      <path
        d="M40.2 68.2C44 70.2 47.4 69.6 50 68.6C52.6 69.6 56 70.2 59.8 68.2L59 70C55.4 71.6 52.4 71.2 50 70.4C47.6 71.2 44.6 71.6 41 70ZM42.4 69.4L44.6 70.2L43.4 72.6ZM57.6 69.4L55.4 70.2L56.6 72.6Z"
        fill="#fff"
      />
      <path d={`${MOUTH_PATH}M38.6 66.8L37 65.4M61.4 66.8L63 65.4`} fill="none" stroke={SPOT} strokeWidth="1.3" strokeLinecap="round" />
    </g>
  );
}

/** Head variant: shoulders of the brown vest and the beige shirt collar, kept inside the avatar circle. */
function AvatarCollar({ ids }: { ids: Ids }) {
  return (
    <g strokeLinejoin="round">
      <path d="M10 78C18 73 28 71 38 70.5H62C72 71 82 73 90 78A49 49 0 0 1 10 78Z" fill={`url(#${ids.vest})`} stroke={SPOT} strokeWidth="2" />
      <path d="M36 75.5C42 80.5 58 80.5 64 75.5L65 82C58 87.5 42 87.5 35 82Z" fill={SHIRT} stroke={SPOT} strokeWidth="1.6" />
      <path d="M34.5 81.5C41 87.5 59 87.5 65.5 81.5L66.5 86C59 92.5 41 92.5 33.5 86Z" fill={VEST_DARK} stroke={SPOT} strokeWidth="1.6" />
      <path d="M50 90V99" stroke={VEST_DARK} strokeWidth="1.4" />
      <circle cx="50" cy="95" r="1.7" fill={SPOT} />
      {/* the chest badge: "ASPIRE" over a red bar (a white-on-red mark at avatar sizes) */}
      <Lettering text="ASPIRE" x={67} y={86.8} height={2.4} weight={0.7} />
      <rect x="62" y="90.6" width="10" height="2" rx="0.4" fill={RED} />
    </g>
  );
}

function WaveBody({ ids }: { ids: Ids }) {
  const buttons = [92, 103, 114, 125, 136];
  return (
    <g strokeLinejoin="round">
      {/* beige shirt: shoulders, hanging left sleeve, raised right upper arm */}
      <path d="M8 140C8 112 13 93 27 86C37 81 47 78.5 58 78.5C69 78.5 79 81 89 86C103 93 108 112 108 140Z" fill={SHIRT} stroke={SPOT} strokeWidth="1.8" />
      <path d="M27 100C24 110 22.5 118 22 126" fill="none" stroke={SHIRT_SHADE} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M93 90L107 116" stroke={SPOT} strokeWidth="19.6" strokeLinecap="round" />
      <path d="M93 90L107 116" stroke={SHIRT} strokeWidth="16" strokeLinecap="round" />
      <path d="M97 104C99 107 101 109 103 110" fill="none" stroke={SHIRT_SHADE} strokeWidth="1.4" strokeLinecap="round" />

      {/* chocolate Nehru-style vest */}
      <path
        d="M34 140L35 108C35 100 33 94 30.5 88.5C37 83.5 46 80.5 58 79C70 80.5 79 83.5 85.5 88.5C83 94 81 100 81 108L82 140Z"
        fill={`url(#${ids.vest})`}
        stroke={SPOT}
        strokeWidth="1.6"
      />
      <path d="M58 86V140" stroke={VEST_DARK} strokeWidth="1.3" />
      <g fill={SPOT}>
        {buttons.map((y) => (
          <circle key={y} cx="58" cy={y} r="1.9" />
        ))}
      </g>
      <g fill="#8a6a52">
        {buttons.map((y) => (
          <circle key={y} cx="57.4" cy={y - 0.6} r="0.6" />
        ))}
      </g>

      {/* "ASPIRE / IIT & MEDICAL" chest badge and pocket welt */}
      <Lettering text="ASPIRE" x={72} y={88.8} height={3.6} weight={0.9} />
      <rect x="63.5" y="94" width="17" height="3.4" rx="0.5" fill={RED} />
      <Lettering text="IIT & MEDICAL" x={72} y={94.85} height={1.7} weight={0.36} />
      <path d="M63.5 100.6H80.5" stroke={VEST_DARK} strokeWidth="1.1" strokeLinecap="round" />

      {/* neck, shirt collar + the vest's band collar, with the chin's shadow */}
      <path d="M46.5 68H69.5L71 78H45Z" fill={FUR_SHADE} />
      <path d="M45.5 75C51 78.5 65 78.5 70.5 75L71 80C65 83.5 51 83.5 45 80Z" fill={SHIRT} stroke={SPOT} strokeWidth="1.2" />
      <path d="M44.5 79.5C51 83.5 65 83.5 71.5 79.5L72 85C65 89 51 89 44 85Z" fill={VEST_DARK} stroke={SPOT} strokeWidth="1.2" />
      <ellipse cx="58" cy="77.5" rx="13" ry="3" fill="#000" opacity="0.12" />

      {/* resting left forearm: spotted fur out of the cuff, paw towards the middle */}
      <path d="M16 138L44 129.5" stroke={SPOT} strokeWidth="19.6" />
      <path d="M16 138L44 129.5" stroke={FUR} strokeWidth="16" />
      <Rosette x={27} y={133.4} r={2.4} turn={30} />
      <Rosette x={36} y={128.6} r={2} turn={100} />
      <Rosette x={37.4} y={136.4} r={2} turn={200} />
      <ellipse cx="48" cy="128.4" rx="10" ry="8.8" transform="rotate(-17 48 128.4)" fill={FUR} stroke={SPOT} strokeWidth="1.6" />
      <circle cx="43.4" cy="131.4" r="1.2" fill={SPOT} />
      <path
        d="M52.6 121.8C54.2 123.4 54.8 125.2 54.4 126.6M55.2 127.6C56.6 129 57 130.8 56.4 132.2"
        fill="none"
        stroke={SPOT}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M12 139.4L20 137" stroke={SPOT} strokeWidth="21" />
      <path d="M12 139.4L20 137" stroke={SHIRT} strokeWidth="18" />
    </g>
  );
}

/** Raised right forearm: sleeve, spotted fur, wristwatch, open paw. Pivots at the elbow. */
function WavingArm() {
  return (
    <g transform="translate(107 116) rotate(-6)" strokeLinejoin="round">
      <g className="origin-bottom [transform-box:fill-box] motion-safe:animate-[rancho-wave_4.5s_ease-in-out_infinite]">
        <path d="M0 0V-14" stroke={SPOT} strokeWidth="19.6" strokeLinecap="round" />
        <path d="M0 0V-14" stroke={SHIRT} strokeWidth="16" strokeLinecap="round" />
        <path d="M-7.8 -12C-7.6 -20 -7.2 -28 -7 -34H8C8.2 -28 8.4 -20 8.6 -12Z" fill={FUR} stroke={SPOT} strokeWidth="1.6" />
        <Rosette x={-1.4} y={-20.6} r={2.2} turn={40} />
        <Rosette x={3.8} y={-27.2} r={1.8} turn={150} />
        <rect x="-9.2" y="-15.6" width="18.6" height="5" rx="1.2" fill={SHIRT} stroke={SPOT} strokeWidth="1.4" />
        {/* wristwatch */}
        <rect x="-7.8" y="-34" width="16.2" height="4.4" rx="1" fill={WATCH_BAND} />
        <circle cx="0.2" cy="-31.8" r="3.2" fill={WATCH_FACE} stroke={WATCH_BAND} strokeWidth="1.2" />
        {/* open paw, palm to the viewer */}
        <ellipse cx="0.5" cy="-45" rx="10.8" ry="11" fill={FUR} stroke={SPOT} strokeWidth="1.8" />
        <circle cx="-8.6" cy="-41.4" r="1.2" fill={SPOT} />
        <circle cx="9.6" cy="-40.4" r="1.1" fill={SPOT} />
        <g fill={PAD}>
          <path d="M-4.4 -42.6C-4.4 -47 5.4 -47 5.4 -42.6C5.4 -39.2 3 -38.2 0.5 -39.6C-2 -38.2 -4.4 -39.2 -4.4 -42.6Z" />
          <ellipse cx="-5.8" cy="-51" rx="1.9" ry="2.3" transform="rotate(-25 -5.8 -51)" />
          <ellipse cx="-1.6" cy="-53.8" rx="1.9" ry="2.4" />
          <ellipse cx="2.8" cy="-53.8" rx="1.9" ry="2.4" />
          <ellipse cx="6.8" cy="-51" rx="1.9" ry="2.3" transform="rotate(25 6.8 -51)" />
        </g>
      </g>
    </g>
  );
}
