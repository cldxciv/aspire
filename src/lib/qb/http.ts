import "server-only";

import { NextResponse } from "next/server";

import { defaultLocale, type Locale } from "@/i18n/config";
import { PASSWORD_CHANGE_REQUIRED_MESSAGE } from "@/lib/auth/guards";
import { authorizeRole } from "@/lib/auth/policy";
import { requirePortalAccess } from "@/lib/auth/portal-access";
import { rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, privateApiHeaders } from "@/lib/auth/responses";
import { getSession } from "@/lib/auth/session";
import type { ApiError } from "@/lib/contracts/api";

import { qbCan, resolveQbViewer } from "./access";
import { qbDb } from "./db";
import type { QbCapability, QbSubject, QbViewer } from "./types";

/**
 * Guards for QB route handlers and pages (owner: QB-CORE-B; §B6).
 *
 * `requireQbApi(request, capability, subject?)`:
 * - mutations (anything but GET / HEAD) must be same-origin (403);
 * - signed out → 401; a role other than admin / staff → 403;
 * - a pending temporary password → 409 `password_change_required`;
 * - a staff account without an active QB membership → 403;
 * - the viewer's role (and subject scope, when `subject` is given) must allow `capability` → 403.
 *
 * `requireQbPage(path, locale)` is for `/admin/questions/**` pages (render under `<Suspense>`): it
 * calls `requirePortalAccess(["admin", "staff"])` (signed out → login; temporary password → the
 * change-password page; staff in the list means there is never a data-free preview).
 */

export type QbApiGuard = { ok: true; viewer: QbViewer } | { ok: false; response: NextResponse<ApiError> | NextResponse };

export const QB_HTTP_MESSAGES = {
  noMembership: "Your account is not set up for the question bank yet. Ask an Aspire administrator.",
  forbidden: "Your question-bank role does not allow this.",
} as const;

function passwordChangeResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "bad_request", message: PASSWORD_CHANGE_REQUIRED_MESSAGE, code: "password_change_required" },
    { status: 409, headers: privateApiHeaders() },
  );
}

export async function requireQbApi(request: Request, capability: QbCapability, subject?: QbSubject): Promise<QbApiGuard> {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const rejection = rejectCrossOrigin(request);
    if (rejection) return { ok: false, response: rejection.response };
  }
  const decision = authorizeRole(await getSession(), ["admin", "staff"]);
  if (!decision.ok) {
    if (decision.error === "password_change_required") return { ok: false, response: passwordChangeResponse() };
    return { ok: false, response: portalApiError(decision.error) };
  }
  const viewer = resolveQbViewer(decision.session, qbDb());
  if (!viewer) return { ok: false, response: portalApiError("forbidden", QB_HTTP_MESSAGES.noMembership) };
  if (!qbCan(viewer, capability, subject)) return { ok: false, response: portalApiError("forbidden", QB_HTTP_MESSAGES.forbidden) };
  return { ok: true, viewer };
}

export type QbPageAccess = { kind: "viewer"; viewer: QbViewer } | { kind: "no_membership"; displayName: string | null };

export async function requireQbPage(path: string, locale: Locale = defaultLocale): Promise<QbPageAccess> {
  const access = await requirePortalAccess(["admin", "staff"], path, locale);
  if (access.kind !== "session") return { kind: "no_membership", displayName: null };
  const viewer = resolveQbViewer(access.session, qbDb());
  if (!viewer) return { kind: "no_membership", displayName: access.session.displayName ?? null };
  return { kind: "viewer", viewer };
}
