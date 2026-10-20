/**
 * Rancho's app icon as a standalone SVG document (pure, client-safe, no hooks): his head (cream fur,
 * a few dark rosettes, blue-grey eyes behind round black glasses, the brown Aspire vest at the
 * shoulders) on a navy disc with a thin gold ring.
 *
 * One drawing, three uses:
 * - `GET /api/rancho/icon` renders it to PNG for the web app manifest and the apple-touch-icon;
 * - the "Get the Rancho app" bar and the /rancho and /tools cards show it as an `<img>` data URI,
 *   so visitors see the same picture that lands on their home screen (no extra request).
 *
 * The face follows the stand-in mascot (src/components/rancho/RanchoMascot.tsx, 100×100 face
 * frame) with fewer spots so it still reads at 48 px. It is a separate copy because the mascot
 * component uses `useId()` and Satori (ImageResponse) can't run hooks. Ids below are fixed: each
 * use is its own SVG document (PNG or data URI), never inlined twice into one page.
 */

export type RanchoIconVariant = "any" | "maskable" | "apple";

const NAVY = "#0b2d5b";
const NAVY_LIGHT = "#1d4f8f";
const GOLD = "#f4c44e";
const FUR = "#ecdfc6";
const FUR_LIGHT = "#f7efe0";
const FUR_SHADE = "#d6c1a0";
const MUZZLE = "#fcf8f0";
const SPOT = "#3b2a1e";
const ROSETTE = "#c9ad88";
const EAR_BACK = "#4d3a2b";
const EAR_INNER = "#f4e9d6";
const IRIS = "#7f9bad";
const PUPIL = "#1e1a17";
const FRAME = "#1a1411";
const NOSE = "#b5786a";
const NOSE_DARK = "#5c3429";
const MOUTH = "#5a2a24";
const TONGUE = "#d9877d";
const VEST_LIGHT = "#6a4632";
const VEST_DARK = "#36211a";
const SHIRT = "#d9c6a5";
const RED = "#c4262e";

/** Head outline in the 100×100 face frame (same as the mascot). */
const FACE =
  "M50 12C67 12 80 20 84.5 33C87 39 88.5 45 89.5 51C92 53 95 55 96 58C93.5 59 91.5 59.5 90 60C92.5 62.5 94 65 94.5 68" +
  "C92 68 89.5 68.5 88 69C85 80 71 89 50 89C29 89 15 80 12 69C10.5 68.5 8 68 5.5 68C6 65 7.5 62.5 10 60" +
  "C8.5 59.5 6.5 59 4 58C5 55 8 53 10.5 51C11.5 45 13 39 15.5 33C20 20 33 12 50 12Z";

const MOUTH_PATH = "M38.6 66.8C42.8 69.6 47 69 50 67.4C53 69 57.2 69.6 61.4 66.8C60 72.8 55.4 75.8 50 75.8C44.6 75.8 40 72.8 38.6 66.8Z";

function rosette(x: number, y: number, r: number, turn: number): string {
  return (
    `<g transform="translate(${x} ${y}) rotate(${turn})">` +
    `<circle r="${r}" fill="${ROSETTE}"/>` +
    `<circle r="${r}" fill="none" stroke="${SPOT}" stroke-width="${round(r * 0.66)}" stroke-dasharray="${round(r * 1.9)} ${round(r * 0.7)}" stroke-linecap="round"/>` +
    `</g>`
  );
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The face, in the 100×100 face frame. */
function face(): string {
  const ear =
    `<path d="M13 38C8.5 27 9.5 15.5 16 11.5C22 8 30 11 38 18.5Z" fill="${EAR_BACK}" stroke="${SPOT}" stroke-width="2.4"/>` +
    `<path d="M15.5 34C13 25.5 14 17 19 14C23.5 11.5 29.5 13.5 35 19.5Z" fill="${EAR_INNER}"/>`;
  return [
    `<g stroke-linejoin="round">`,
    `<g>${ear}</g>`,
    `<g transform="matrix(-1 0 0 1 100 0)">${ear}</g>`,
    `<path d="${FACE}" fill="url(#ri-fur)"/>`,
    // A few bold spots and rosettes, clipped to the head.
    `<g clip-path="url(#ri-face)">`,
    `<g fill="${SPOT}">`,
    `<ellipse cx="50" cy="19" rx="2.6" ry="2"/>`,
    `<ellipse cx="43.6" cy="23.4" rx="1.7" ry="2.2" transform="rotate(20 43.6 23.4)"/>`,
    `<ellipse cx="56.6" cy="23" rx="2.1" ry="1.6" transform="rotate(-15 56.6 23)"/>`,
    `<ellipse cx="38.6" cy="17.8" rx="2" ry="1.4" transform="rotate(-30 38.6 17.8)"/>`,
    `<circle cx="61.8" cy="17.4" r="1.6"/>`,
    `</g>`,
    rosette(28.5, 20, 2.6, -60),
    rosette(71.5, 20, 2.6, 240),
    rosette(12.8, 47, 3.4, 20),
    rosette(87.2, 47, 3.4, 160),
    rosette(21, 73, 3.4, 70),
    rosette(79, 73, 3.4, 110),
    `</g>`,
    `<path d="${FACE}" fill="none" stroke="${SPOT}" stroke-width="2.6"/>`,
    // Light nose bridge, white muzzle and chin.
    `<ellipse cx="50" cy="46" rx="5.5" ry="10" fill="${FUR_LIGHT}"/>`,
    `<path d="M50 56C42 55.5 31.5 58.5 31 66.5C30.5 75 38 84 50 85C62 84 69.5 75 69 66.5C68.5 58.5 58 55.5 50 56Z" fill="${MUZZLE}"/>`,
    // Brow markings on the frames.
    `<g fill="${SPOT}">`,
    `<path d="M24.5 36.5C27.5 28.5 39.5 25.8 47 31.4C40 31.4 31 32.6 24.5 36.5Z"/>`,
    `<path d="M75.5 36.5C72.5 28.5 60.5 25.8 53 31.4C60 31.4 69 32.6 75.5 36.5Z"/>`,
    `</g>`,
    // Blue-grey eyes.
    `<ellipse cx="36.5" cy="45" rx="4.7" ry="4.9" fill="${IRIS}"/>`,
    `<ellipse cx="63.5" cy="45" rx="4.7" ry="4.9" fill="${IRIS}"/>`,
    `<circle cx="37" cy="45.4" r="2.6" fill="${PUPIL}"/>`,
    `<circle cx="63" cy="45.4" r="2.6" fill="${PUPIL}"/>`,
    `<circle cx="35.4" cy="43.4" r="1.2" fill="#fff"/>`,
    `<circle cx="61.4" cy="43.4" r="1.2" fill="#fff"/>`,
    // Round black glasses.
    `<g fill="none" stroke="${FRAME}" stroke-linecap="round">`,
    `<rect x="25.5" y="36.6" width="22" height="17" rx="6.5" fill="#fff" fill-opacity="0.16" stroke-width="2.8"/>`,
    `<rect x="52.5" y="36.6" width="22" height="17" rx="6.5" fill="#fff" fill-opacity="0.16" stroke-width="2.8"/>`,
    `<path d="M47.5 42.2C48.8 40.6 51.2 40.6 52.5 42.2M25.5 41.4L13.5 39.8M74.5 41.4L86.5 39.8" stroke-width="2.4"/>`,
    `</g>`,
    // Nose and a wide, friendly grin.
    `<path d="M43.5 56.4C46 54.7 54 54.7 56.5 56.4C57.5 57.3 57 58.6 56.2 59.4L51.6 63.4C50.7 64.2 49.3 64.2 48.4 63.4L43.8 59.4C43 58.6 42.5 57.3 43.5 56.4Z" fill="${NOSE}" stroke="${NOSE_DARK}" stroke-width="1"/>`,
    `<path d="M50 63.8V67" stroke="${SPOT}" stroke-width="1.4" stroke-linecap="round"/>`,
    `<path d="${MOUTH_PATH}" fill="${MOUTH}"/>`,
    `<path d="M44.4 73.8C46.8 71.9 53.2 71.9 55.6 73.8C54.2 75.2 52.2 75.8 50 75.8C47.8 75.8 45.8 75.2 44.4 73.8Z" fill="${TONGUE}"/>`,
    `<path d="M40.2 68.2C44 70.2 47.4 69.6 50 68.6C52.6 69.6 56 70.2 59.8 68.2L59 70C55.4 71.6 52.4 71.2 50 70.4C47.6 71.2 44.6 71.6 41 70Z" fill="#fff"/>`,
    `<path d="${MOUTH_PATH}" fill="none" stroke="${SPOT}" stroke-width="1.4" stroke-linecap="round"/>`,
    `</g>`,
  ].join("");
}

/**
 * The disc: navy (lighter in the middle), the vest and shirt collar at the bottom, the head, and a
 * thin gold ring. Drawn in a 100×100 box (disc radius 50).
 */
function disc(): string {
  return [
    `<circle cx="50" cy="50" r="50" fill="url(#ri-disc)"/>`,
    `<g clip-path="url(#ri-inner)">`,
    // Vest shoulders, shirt collar, the vest's band collar and the red chest badge bar.
    `<path d="M4 100C6 88 16 80.5 30 77.5C37 76 43 75.5 50 75.5C57 75.5 63 76 70 77.5C84 80.5 94 88 96 100Z" fill="url(#ri-vest)" stroke="${SPOT}" stroke-width="1.4"/>`,
    `<path d="M50 80V100" stroke="${VEST_DARK}" stroke-width="1.2"/>`,
    `<path d="M36 72C42 77 58 77 64 72L65.5 78C58 83.5 42 83.5 34.5 78Z" fill="${SHIRT}" stroke="${SPOT}" stroke-width="1.2"/>`,
    `<rect x="61" y="86" width="12" height="2.6" rx="0.5" fill="${RED}"/>`,
    `</g>`,
    `<g transform="translate(13.5 6) scale(0.73)">${face()}</g>`,
    `<circle cx="50" cy="50" r="48.4" fill="none" stroke="${GOLD}" stroke-width="2.2"/>`,
  ].join("");
}

const DEFS =
  `<defs>` +
  `<radialGradient id="ri-disc" cx="0.5" cy="0.42" r="0.6"><stop offset="0" stop-color="${NAVY_LIGHT}"/><stop offset="1" stop-color="${NAVY}"/></radialGradient>` +
  `<radialGradient id="ri-fur" cx="0.5" cy="0.42" r="0.62"><stop offset="0" stop-color="${FUR_LIGHT}"/><stop offset="0.6" stop-color="${FUR}"/><stop offset="1" stop-color="${FUR_SHADE}"/></radialGradient>` +
  `<linearGradient id="ri-vest" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${VEST_LIGHT}"/><stop offset="1" stop-color="${VEST_DARK}"/></linearGradient>` +
  `<clipPath id="ri-face"><path d="${FACE}"/></clipPath>` +
  `<clipPath id="ri-inner"><circle cx="50" cy="50" r="47.3"/></clipPath>` +
  `</defs>`;

/**
 * Where the 100-unit disc sits on the 100×100 canvas:
 * - `any`: the disc fills the icon (transparent corners), 1 unit margin for anti-aliasing;
 * - `maskable`: full navy square, disc radius 39 — inside the 80 % safe zone (radius 40) that
 *   Android's masks never cut;
 * - `apple`: full navy square (iOS fills transparency with black and rounds the corners itself),
 *   disc radius 45.
 */
const PLACEMENT: Record<RanchoIconVariant, { background: boolean; scale: number }> = {
  any: { background: false, scale: 0.98 },
  maskable: { background: true, scale: 0.78 },
  apple: { background: true, scale: 0.9 },
};

/** The icon as an SVG document (viewBox 100×100; `size` sets the width/height attributes). */
export function ranchoIconSvg(variant: RanchoIconVariant = "any", size = 512): string {
  const { background, scale } = PLACEMENT[variant];
  const offset = round((100 - 100 * scale) / 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">` +
    DEFS +
    (background ? `<rect width="100" height="100" fill="${NAVY}"/>` : "") +
    `<g transform="translate(${offset} ${offset}) scale(${scale})">${disc()}</g>` +
    `</svg>`
  );
}

/** `data:` URI of the icon, for `<img>` / next/image (`unoptimized`). */
export function ranchoIconDataUri(variant: RanchoIconVariant = "any", size = 96): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ranchoIconSvg(variant, size))}`;
}

/** Small "any" icon as a data URI, for the install bar, the instruction sheet and the cards. */
export const RANCHO_ICON_SMALL = ranchoIconDataUri("any", 96);

/** Sizes the icon route draws: apple-touch-icon (180) and the manifest sizes (192, 512). */
export const RANCHO_ICON_SIZES = [180, 192, 512] as const;
