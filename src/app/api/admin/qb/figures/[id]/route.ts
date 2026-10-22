import type { NextRequest } from "next/server";

import { ROBOTS_NOINDEX } from "@/lib/auth/config";

import { invalidId, qbResponse, qbServerError, requireQbAdmin } from "../../_lib/http";
import { readFigure } from "../../_lib/services";

const ROUTE = "figure";
const FIGURE_ID = /^[0-9a-f]{32}$/;

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/qb/figures/:id — the figure bytes for staff (`view`), drafts included (the
 * public `/api/qb/figures/:id` serves only figures of approved versions). Raster only, with
 * `nosniff`, a `default-src 'none'` CSP and same-origin resource policy; never cached by shared caches.
 */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!FIGURE_ID.test(id)) return invalidId();
    const result = await readFigure(auth.viewer, id);
    if (!result.ok) return qbResponse(result);
    const { bytes, mime } = result.data;
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Robots-Tag": ROBOTS_NOINDEX,
      },
    });
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
