import { ImageResponse } from "next/og";
import { connection, type NextRequest } from "next/server";

import { RANCHO_ICON_SIZES, ranchoIconSvg, type RanchoIconVariant } from "@/components/pwa/rancho-icon";

/**
 * GET /api/rancho/icon?size=180|192|512[&maskable=1] — the Rancho app icon (PNG) for the web app
 * manifest (src/app/manifest.ts) and the apple-touch-icon (the (site) layout's metadata). Drawn
 * from one SVG (src/components/pwa/rancho-icon.ts), so no binary asset or new package is needed:
 * Rancho's head on a navy disc with a thin gold ring; no text.
 *
 * - `size=192|512`: transparent corners around the disc (`purpose: "any"`).
 * - `maskable=1`: full navy square with the disc inside the 80 % safe zone (`purpose: "maskable"`).
 * - `size=180`: apple-touch-icon, full navy square (iOS rounds the corners itself).
 * Unknown sizes fall back to 192.
 */

const SIZES = new Set<number>(RANCHO_ICON_SIZES);

export async function GET(request: NextRequest): Promise<Response> {
  await connection();
  const query = request.nextUrl.searchParams;
  const requested = Number(query.get("size"));
  const size = SIZES.has(requested) ? requested : 192;
  const variant: RanchoIconVariant = query.get("maskable") === "1" ? "maskable" : size === 180 ? "apple" : "any";
  const src = `data:image/svg+xml;base64,${Buffer.from(ranchoIconSvg(variant, size)).toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img>, next/image doesn't apply */}
        <img src={src} width={size} height={size} alt="" />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400", "X-Robots-Tag": "noindex" },
    },
  );
}
