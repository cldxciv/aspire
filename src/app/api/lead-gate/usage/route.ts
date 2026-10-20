import type { NextRequest } from "next/server";

import { leadGateHandlers } from "@/lib/lead-gate/handlers";

/**
 * POST /api/lead-gate/usage (docs/lead-gate-plan.md §5): one use of a browser-only tool
 * (predictor, planner) on a browser that shared contact details. Body ≤ 1 KB:
 * `{ tool: "predictor" | "planner", exam, band? (predictor), page? }`.
 * 200 `{ recorded, reason? }` · 403 / 415 / 413 / 400 / 422 (incl. "ask" / "mock-test") / 429 / 500.
 */
export async function POST(request: NextRequest) {
  return leadGateHandlers.usagePOST(request);
}
