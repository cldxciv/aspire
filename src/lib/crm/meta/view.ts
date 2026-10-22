import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getSiteOrigin } from "@/lib/server/env";
import { secretBoxStatus } from "@/lib/server/secret-box";

import { META_INBOX_STATUSES, type MetaInboxStatus } from "../lead-ops-types";
import { toIso } from "../pure";
import { countInboxByStatus, listInboxRows } from "../repo/meta";
import { listSecretRows } from "../repo/settings";
import { crmPermissions, type CrmViewer } from "../types";
import { getMetaConfig } from "../settings";
import { metaReadiness, metaSecretStates, readMetaSecret } from "./config";
import { readMetaStatus, silentHoursOf, siteHostChanged } from "./status";
import { testModeActive } from "./test-mode";
import { META_TOKEN_WARN_DAYS, type MetaInboxPage, type MetaIntegrationView, type MetaStatusView } from "./types";

/**
 * Read models of the Meta connection (GET /api/crm/integrations/meta, the Integrations page, the
 * inbox list). Read-only: no write transaction is ever opened here. Admins and area heads get the
 * status only; super admins also get the config, the secret STATES (never values) and the verify
 * token they paste into Meta (§6).
 */

export const WEBHOOK_PATH = "/api/integrations/meta/webhook";

/** The public site origin: NEXT_PUBLIC_SITE_URL, else the request's own origin. */
export function siteOriginFor(requestOrigin: string | null): string {
  return getSiteOrigin(process.env) ?? requestOrigin ?? "";
}

export function metaStatusView(db: DatabaseSync, input: { now: number; siteOrigin: string }): MetaStatusView {
  const envelope = getMetaConfig(db);
  const config = envelope.value;
  const status = readMetaStatus(db);
  const readiness = metaReadiness(db, config);
  const expires = status.tokenInfo?.expiresAt ? Date.parse(status.tokenInfo.expiresAt) : Number.NaN;
  return {
    readiness,
    status,
    counts: countInboxByStatus(db),
    silentHours: silentHoursOf(config, status, input.now, envelope.updatedAt),
    paused: config.enabled ? status.paused : null,
    callbackUrl: `${input.siteOrigin}${WEBHOOK_PATH}`,
    siteUrlChanged: siteHostChanged(status.verifiedSiteUrl, input.siteOrigin),
    tokenExpiresSoon: Number.isFinite(expires) && expires - input.now < META_TOKEN_WARN_DAYS * 24 * 60 * 60 * 1000,
    testMode: { active: testModeActive(config, input.now), until: testModeActive(config, input.now) ? config.acceptTestLeadsUntil : null },
  };
}

/** The whole view for a viewer allowed to see the status (callers check `canViewIntegrationStatus`). */
export function metaIntegrationView(db: DatabaseSync, viewer: CrmViewer, input: { now: number; siteOrigin: string }): MetaIntegrationView {
  const view: MetaIntegrationView = metaStatusView(db, input);
  if (!crmPermissions(viewer).canManageIntegrations) return view;
  const key = secretBoxStatus();
  const verify = readMetaSecret(db, "verify_token");
  const secrets = metaSecretStates(db);
  view.admin = {
    config: getMetaConfig(db),
    secrets,
    verifyToken: verify.ok ? verify.value : null,
    key: { keyId: key.keyId, previousKeyId: key.previousKeyId, weak: key.weak },
    needsReseal: key.configured && listSecretRows(db, "meta").some((row) => row.keyId !== key.keyId),
  };
  return view;
}

/** Statuses the super admin's list can filter by (`?status=`); the default shows what needs attention. */
export const INBOX_ATTENTION: readonly MetaInboxStatus[] = ["failed", "unavailable", "held", "pending", "processing"];

export function metaInboxPage(db: DatabaseSync, status: MetaInboxStatus | null, limit = 100): MetaInboxPage {
  const statuses = status && (META_INBOX_STATUSES as readonly string[]).includes(status) ? [status] : INBOX_ATTENTION;
  return {
    counts: countInboxByStatus(db),
    items: listInboxRows(db, { statuses, limit }).map((row) => ({
      leadgenId: row.leadgenId,
      status: row.status,
      via: row.via,
      attempts: row.attempts,
      lastError: row.lastError,
      formId: row.formId,
      leadId: row.leadId,
      receivedAt: toIso(row.receivedAt),
      processedAt: toIso(row.processedAt),
      nextAttemptAt: toIso(row.nextAttemptAt),
    })),
  };
}

/**
 * Meta health for the alert strip and the dashboard (LR-SLA; §15 `SlaSummary.sa.meta`, §16
 * `DashboardData.meta`): counts and times only. Null while the integration is switched off.
 */
export function metaHealthSummary(
  db: DatabaseSync,
  now: number,
): { pending: number; failed: number; paused: "auth" | "permission" | null; silentHours: number | null; lastWebhookAt: string | null; lastImportAt: string | null } | null {
  const envelope = getMetaConfig(db);
  const config = envelope.value;
  if (!config.enabled) return null;
  const status = readMetaStatus(db);
  const counts = countInboxByStatus(db);
  return {
    pending: counts.pending + counts.processing + counts.held,
    failed: counts.failed + counts.unavailable,
    paused: status.paused,
    silentHours: silentHoursOf(config, status, now, envelope.updatedAt),
    lastWebhookAt: status.lastWebhookAt,
    lastImportAt: status.lastImportAt,
  };
}
