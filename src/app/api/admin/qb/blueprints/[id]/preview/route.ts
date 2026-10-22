import { randomBytes } from "node:crypto";

import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";

import { invalidId, isQbId, qbResponse, qbServerError, requireQbAdmin } from "../../../_lib/http";
import { blueprintPreview } from "../../../_lib/services";

const ROUTE = "blueprint_preview";
const SEED = /^[A-Za-z0-9_-]{1,64}$/;

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/qb/blueprints/:id/preview?seed=…&language=en|hi — one sample paper generated from
 * this blueprint for staff (`view`): items with chapter, difficulty and source, plus the honest
 * composition, or the readiness when the bank is thin. Nothing is stored and no exposure is
 * counted. Without `seed` a random one is used and returned, so a preview can be reproduced.
 */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE, limit: "heavy" });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!isQbId(id)) return invalidId();
    const params = request.nextUrl.searchParams;
    const requested = params.get("seed");
    if (requested !== null && !SEED.test(requested)) return portalApiError("bad_request", "seed: 1–64 of A–Z a–z 0–9 _ -.");
    const seed = requested ?? randomBytes(9).toString("base64url");
    const language = params.get("language") === "hi" ? "hi" : "en";
    return qbResponse(await blueprintPreview(auth.viewer, id, { seed, language }));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
