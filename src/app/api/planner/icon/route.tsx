import { ImageResponse } from "next/og";
import { connection, type NextRequest } from "next/server";

/**
 * GET /api/planner/icon?size=192|512[&maskable=1] — the study planner's app icon (PNG) for the web
 * app manifest (src/app/manifest.ts) and on-device reminders. Drawn here so no binary asset or
 * new package is needed. A calendar page with a tick, in Aspire's navy and gold; no text.
 */

const NAVY = "#0B2D5B";
const GOLD = "#F4C44E";
const SIZES = new Set([192, 512]);

export async function GET(request: NextRequest): Promise<Response> {
  await connection();
  const query = request.nextUrl.searchParams;
  const requested = Number(query.get("size"));
  const size = SIZES.has(requested) ? requested : 192;
  const maskable = query.get("maskable") === "1";
  // Maskable icons keep the artwork inside the central 80 % safe zone.
  const scale = maskable ? 0.5 : 0.62;
  const card = Math.round(size * scale);
  const bar = Math.round(card * 0.24);
  const ring = Math.max(4, Math.round(card * 0.07));
  const tick = Math.round(card * 0.1);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: NAVY,
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        <div
          style={{
            width: card,
            height: card,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            background: "white",
            borderRadius: Math.round(card * 0.14),
            overflow: "hidden",
          }}
        >
          <div style={{ width: "100%", height: bar, background: GOLD, display: "flex" }} />
          <div style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* A tick drawn as two rotated bars. */}
            <div style={{ display: "flex", position: "relative", width: card * 0.5, height: card * 0.4 }}>
              <div
                style={{
                  position: "absolute",
                  left: card * 0.02,
                  top: card * 0.17,
                  width: card * 0.2,
                  height: tick,
                  background: NAVY,
                  borderRadius: tick,
                  transform: "rotate(45deg)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: card * 0.12,
                  top: card * 0.11,
                  width: card * 0.38,
                  height: tick,
                  background: NAVY,
                  borderRadius: tick,
                  transform: "rotate(-48deg)",
                }}
              />
            </div>
          </div>
          <div style={{ position: "absolute", top: bar / 2 - ring, left: card * 0.26, width: ring, height: ring * 2, background: NAVY, borderRadius: ring, display: "flex" }} />
          <div style={{ position: "absolute", top: bar / 2 - ring, right: card * 0.26, width: ring, height: ring * 2, background: NAVY, borderRadius: ring, display: "flex" }} />
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400", "X-Robots-Tag": "noindex" },
    },
  );
}
