import { connection } from "next/server";
import { portalApiError } from "@/lib/auth/responses";
import { qbPaperPort } from "@/lib/mocktest/generated";
import { MOCKTEST_MESSAGES, mocktestServerError, rateLimited } from "@/lib/mocktest/http";
import { mocktestLimiters } from "@/lib/mocktest/service";
import { getClientIp } from "@/lib/server/request-guards";

type Context = { params: Promise<{ id: string }> };

/** Figure ids are the first 32 hex characters of the bytes' SHA-256 (content-addressed, so immutable). */
const FIGURE_ID = /^[0-9a-f]{32}$/;

/**
 * GET /api/qb/figures/:id — a question figure for students (docs/question-bank-plan.md §B12). Serves
 * ONLY figures referenced by an approved question version (ref version ≥ 1): figures of drafts,
 * rejected items or unreferenced uploads answer 404 like unknown ids (staff use
 * /api/admin/qb/figures/:id). Raster only (PNG / JPEG / WebP, checked at upload); the id is a
 * content hash, so the response is cached for a year (`immutable`), with `nosniff`, a
 * `default-src 'none'` CSP and a same-origin resource policy. 1,200 per IP per 10 minutes.
 */
export async function GET(request: Request, ctx: Context) {
  try {
    await connection();
    const limit = mocktestLimiters.figure.check(getClientIp(request.headers));
    if (!limit.allowed) return rateLimited(limit);
    const { id } = await ctx.params;
    if (!FIGURE_ID.test(id ?? "")) return portalApiError("not_found", MOCKTEST_MESSAGES.figureNotFound);
    const port = await qbPaperPort();
    const figure = await port.figure(id);
    if (!figure) return portalApiError("not_found", MOCKTEST_MESSAGES.figureNotFound);
    return new Response(new Uint8Array(figure.bytes), {
      status: 200,
      headers: {
        "Content-Type": figure.mime,
        "Content-Length": String(figure.bytes.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (error) {
    return mocktestServerError("figure", error);
  }
}
