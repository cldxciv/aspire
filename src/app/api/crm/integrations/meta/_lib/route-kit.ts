import "server-only";

import type { NextResponse } from "next/server";

import type { ApiError } from "@/lib/contracts/api";
import { portalApiError } from "@/lib/auth/responses";
import { crmLog, requireCrm, type CrmGuard } from "@/lib/crm/http";
import { crmPermissions } from "@/lib/crm/types";

export { afterResponse, requestOrigin } from "@/lib/crm/meta/http";

/**
 * Shared plumbing for /api/crm/integrations/meta/** (LR-META; docs/lead-routing-plan.md §21, §22):
 * GET status is for admins and area heads (`canViewIntegrationStatus`); every write, the secrets
 * and the inbox list are SUPER ADMIN only (`requireCrmSuperAdmin`, enforced on every call).
 * Answers use the D-007 envelope with `no-store` + `noindex`; logs are fixed codes.
 */

/** Server English for the envelope (the page shows its own en / hi text per code). */
export const META_API_MESSAGES = {
  statusForbidden: "Only administrators and area heads can see the Meta connection.",
  notConfigured: "Server key not set: ask the developer to set INTEGRATIONS_SECRET.",
  versionConflict: "Someone else changed these settings a moment ago. Refresh and try again.",
  wrongPassword: "That is not your current password.",
  invalidSecret: "That does not look like the value Meta shows. Copy it again.",
  phoneRequired: "Enter your own 10-digit mobile number.",
} as const;

/** Status readers: admins (incl. super admins) and area heads; executives get 403. */
export async function requireMetaStatusReader(request: Request, route: string): Promise<CrmGuard> {
  const auth = await requireCrm(request, { write: false, route });
  if (!auth.ok) return auth;
  if (!crmPermissions(auth.viewer).canViewIntegrationStatus) {
    crmLog(route, "forbidden", "not_status_reader");
    return { ok: false, response: portalApiError("forbidden", META_API_MESSAGES.statusForbidden) };
  }
  return auth;
}

export function notConfigured(route: string): NextResponse<ApiError> {
  crmLog(route, "error", "not_configured");
  return portalApiError("not_configured", META_API_MESSAGES.notConfigured);
}
