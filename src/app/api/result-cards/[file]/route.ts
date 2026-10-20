import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";

import { canServeResultCard } from "@/lib/data";
import { notFoundResponse } from "@/lib/server/http";

/** Card files: `ranker-<demo id>.webp` (scripts/import-result-cards.mjs). Anything else is a 404. */
const CARD_FILE = /^ranker-\d{1,6}\.webp$/;

/** Outside `public/`: those files are served unconditionally and `/images/` skips the preview gate (D-027). */
const CARD_DIR = path.join(process.cwd(), "private", "result-cards");

/**
 * GET /api/result-cards/[file] — a result-card image (D-031: a student's photo, college and name).
 *
 * PERSONAL DATA, so it follows exactly the rule for student names: served only while a visible
 * record whose name may be shown carries the card (canServeResultCard() → canShowStudentName()).
 * In production that means never while the imported records are placeholders with consent
 * pending — the response is the same JSON 404 as for an unknown file, so nothing can be probed.
 * Under /api it stays behind the preview password gate (D-027); components render it with
 * `unoptimized` so the browser fetches it directly (with the preview credentials) and no
 * optimised copy is cached under /_next/image, which the gate does not cover.
 *
 * Request time only (`connection()`): visibility follows the running server's environment.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  await connection();
  const { file } = await ctx.params;
  if (!CARD_FILE.test(file) || !canServeResultCard(file)) return notFoundResponse("Result card not found.");
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(CARD_DIR, file));
  } catch {
    return notFoundResponse("Result card not found.");
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      // Per-browser only (never a shared cache): visibility can change with consent.
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow, noimageindex",
    },
  });
}
