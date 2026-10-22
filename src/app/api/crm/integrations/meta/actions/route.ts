import type { NextRequest } from "next/server";
import { z } from "zod";

import { REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { crmLog, crmServerError, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";
import type { MetaAction } from "@/lib/crm/lead-ops-types";
import { runMetaAction } from "@/lib/crm/meta/actions";

import { notConfigured } from "../_lib/route-kit";

const ROUTE = "meta.actions";

/** Every action except `test_mode` (which carries `on` / `phone`). */
const PLAIN_ACTIONS = [
  "check",
  "subscribe_page",
  "process_now",
  "retry_failed",
  "sync_forms",
  "sync_leads",
  "regenerate_verify_token",
  "reseal",
] as const satisfies readonly Exclude<MetaAction, "test_mode">[];

const bodySchema = z.union([
  z.object({ action: z.enum(PLAIN_ACTIONS) }).strict(),
  z
    .object({
      action: z.literal("test_mode"),
      on: z.boolean(),
      phone: z.string().max(32).nullable().optional(),
    })
    .strict(),
]);

/**
 * POST /api/crm/integrations/meta/actions — one of `check`, `subscribe_page`, `process_now`,
 * `retry_failed`, `sync_forms`, `sync_leads`, `regenerate_verify_token`, `reseal`, or
 * `{ action: "test_mode", on, phone }` → `MetaActionResult` (fixed codes, never Graph text).
 * SUPER ADMIN only, same-origin. Audited `crm.meta_action { action }`. 422 when test mode is
 * switched on without a valid mobile number; 503 when the server key is missing for
 * `regenerate_verify_token` / `reseal`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, bodySchema, ROUTE);
    if (!body.ok) return body.response;
    const outcome = await runMetaAction(auth.viewer, body.data);
    if (!outcome.ok) {
      if (outcome.error === "not_configured") return notConfigured(ROUTE);
      crmLog(ROUTE, "bad_request", "validation");
      return portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors: outcome.fieldErrors });
    }
    crmLog(ROUTE, outcome.result.ok ? "success" : "bad_request", outcome.result.ok ? undefined : (outcome.result.code ?? undefined));
    return portalApiItem(outcome.result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
