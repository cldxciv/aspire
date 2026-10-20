import type { NextRequest } from "next/server";

import { leadGateHandlers } from "@/lib/lead-gate/handlers";

/**
 * /api/lead-gate (docs/lead-gate-plan.md §5): contact details once per browser before a free
 * tool's result. Every response: D-007 envelope, `Cache-Control: no-store`, `X-Robots-Tag: noindex`.
 *
 * GET    → 200 { mode, unlocked, via, recordsUse, expiresAt, sample }   (429 / 500)
 * POST   → 201 + Set-Cookie aspire_tool_pass (pass) · 200 (signed in / gate off: nothing stored)
 *          · 403 / 415 / 413 / 400 / 422 / 429 / 503 (paused) / 500 (nothing saved, no cookie)
 * DELETE → 200 { forgotten: true, withdrawn }  (`?withdraw=1` = "Stop Aspire contacting me")
 */
export async function GET(request: NextRequest) {
  return leadGateHandlers.GET(request);
}

export async function POST(request: NextRequest) {
  return leadGateHandlers.POST(request);
}

export async function DELETE(request: NextRequest) {
  return leadGateHandlers.DELETE(request);
}
