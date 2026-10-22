import type { NextRequest } from "next/server";
import { z } from "zod";

import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { verifySuperAdminPassword } from "@/lib/auth/super-admin";
import { crmLog, crmServerError, parseCrmBody, requireCrmSuperAdmin, type CrmGuard } from "@/lib/crm/http";
import { META_SECRET_NAMES } from "@/lib/crm/lead-ops-types";
import { ensureVerifyToken, metaSecretStates, releaseHeldIfReady, removeMetaSecret, storeMetaSecret, validSecretValue } from "@/lib/crm/meta/config";
import { updateMetaStatus } from "@/lib/crm/meta/status";
import { META_TYPED_SECRETS, type MetaSecretsAnswer } from "@/lib/crm/meta/types";
import { getDb, withTransaction } from "@/lib/db/connection";
import { secretBoxStatus } from "@/lib/server/secret-box";

import { META_API_MESSAGES, notConfigured } from "../_lib/route-kit";

const ROUTE = "meta.secrets";
const password = z.string().min(1, { error: "Enter your current password." }).max(1024);

const putSchema = z
  .object({
    name: z.enum(META_TYPED_SECRETS),
    value: z.string().min(1).max(2048),
    currentPassword: password,
  })
  .strict();

const deleteSchema = z
  .object({
    name: z.enum(META_SECRET_NAMES),
    currentPassword: password,
  })
  .strict();

/** The SA's CURRENT password, re-checked before any secret changes (L4; 5 tries per 15 minutes). */
async function checkPassword(auth: Extract<CrmGuard, { ok: true }>, currentPassword: string) {
  const result = await verifySuperAdminPassword(auth.viewer.userId, currentPassword);
  if (result.ok) return null;
  crmLog(ROUTE, result.error === "rate_limited" ? "rate_limited" : "forbidden", result.error);
  if (result.error === "rate_limited") {
    return portalApiError("rate_limited", AUTH_MESSAGES.rateLimited(result.retryAfterSeconds), { headers: { "Retry-After": String(result.retryAfterSeconds) } });
  }
  return portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors: { currentPassword: [META_API_MESSAGES.wrongPassword] } });
}

const answer = (): MetaSecretsAnswer => ({ secrets: metaSecretStates(getDb()) });

/**
 * PUT /api/crm/integrations/meta/secrets — `{ name: "app_secret" | "access_token", value,
 * currentPassword }` → `{ secrets }` (states only: the value is NEVER returned). SUPER ADMIN only,
 * same-origin, password re-checked; 503 `not_configured` without INTEGRATIONS_SECRET. Audited
 * `crm.meta_secret_set { slot }`. A new token drops the derived Page token (the next "Check
 * connection" makes a fresh one) and lifts an `auth` pause; saving the app secret creates the
 * verify token when there is none.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, putSchema, ROUTE);
    if (!body.ok) return body.response;
    if (!secretBoxStatus().configured) return notConfigured(ROUTE);
    const refused = await checkPassword(auth, body.data.currentPassword);
    if (refused) return refused;
    const { name, value } = body.data;
    const trimmed = value.trim();
    if (!validSecretValue(name, trimmed)) {
      crmLog(ROUTE, "bad_request", "invalid_secret");
      return portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors: { value: [META_API_MESSAGES.invalidSecret] } });
    }
    const db = getDb();
    const now = Date.now();
    const actorId = auth.viewer.userId;
    withTransaction(db, () => {
      storeMetaSecret(db, name, trimmed, { actorId, now });
      if (name === "app_secret") ensureVerifyToken(db, { actorId, now });
      if (name === "access_token") {
        removeMetaSecret(db, "page_token", { actorId, now });
        updateMetaStatus(db, (current) => ({ tokenInfo: null, ...(current.paused === "auth" ? { paused: null, pausedAt: null } : {}) }), now);
      }
      releaseHeldIfReady(db, now);
    });
    crmLog(ROUTE, "success");
    return portalApiItem(answer());
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * DELETE /api/crm/integrations/meta/secrets — `{ name, currentPassword }` → `{ secrets }`. SUPER
 * ADMIN only, password re-checked. Audited `crm.meta_secret_delete { slot }`.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, deleteSchema, ROUTE);
    if (!body.ok) return body.response;
    const refused = await checkPassword(auth, body.data.currentPassword);
    if (refused) return refused;
    removeMetaSecret(getDb(), body.data.name, { actorId: auth.viewer.userId, now: Date.now() });
    crmLog(ROUTE, "success");
    return portalApiItem(answer());
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
