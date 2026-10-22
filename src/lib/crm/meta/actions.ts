import "server-only";

import { getDb } from "@/lib/db/connection";
import { secretBoxStatus } from "@/lib/server/secret-box";

import { CRM_AUDIT, crmAudit } from "../access";
import { guessTarget } from "../intake/fields";
import type { ImportTarget, MetaAction, MetaConfig, MetaFormConfig } from "../lead-ops-types";
import { retryFailedRows } from "../repo/meta";
import { getMetaConfig } from "../settings";
import type { CrmViewer } from "../types";
import { generateVerifyToken, patchMetaConfigAsSystem, readMetaSecret, releaseHeldIfReady, resealMetaSecrets, storeMetaSecret } from "./config";
import type { GraphDebugToken, GraphForm, GraphPaged } from "./graph";
import { graphClientFor, leadReadToken, processMetaInbox, type ProcessReport } from "./inbox";
import { metaLog, metaRuntime, type MetaRuntime } from "./runtime";
import { readMetaStatus, updateMetaStatus } from "./status";
import { reconcileMetaLeads } from "./sync";
import { testModeActive, testModePatch } from "./test-mode";
import { META_REQUIRED_SCOPES, type MetaActionResult, type MetaCheckLine } from "./types";

/**
 * Super-admin actions on the Meta connection (docs/lead-routing-plan.md §18.7):
 * `check`, `subscribe_page`, `process_now`, `retry_failed`, `sync_forms`, `sync_leads`,
 * `regenerate_verify_token`, `reseal`, `test_mode`. The route checks the super admin; every action
 * is audited `crm.meta_action { action, ok }` (never ids, tokens or Graph text).
 */

export type MetaActionInput = { action: Exclude<MetaAction, "test_mode"> } | { action: "test_mode"; on: boolean; phone?: string | null };

export type MetaActionOutcome =
  | { ok: true; result: MetaActionResult }
  | { ok: false; error: "validation"; fieldErrors: Record<string, string[]> }
  | { ok: false; error: "not_configured" };

const fail = (action: MetaAction, code: string): MetaActionResult => ({ action, ok: false, code });

function processedOf(report: ProcessReport): NonNullable<MetaActionResult["processed"]> {
  return { imported: report.imported, duplicates: report.duplicates, failed: report.failed + report.unavailable, retried: report.retried, paused: report.paused };
}

export async function runMetaAction(viewer: CrmViewer, input: MetaActionInput, options: { runtime?: Partial<MetaRuntime> } = {}): Promise<MetaActionOutcome> {
  const runtime = metaRuntime(options.runtime);
  const db = getDb();
  const now = runtime.now();
  const actorId = viewer.userId;

  if (input.action === "test_mode") {
    const patch = testModePatch(input, now);
    if (!patch) return { ok: false, error: "validation", fieldErrors: { phone: ["Enter your own 10-digit mobile number."] } };
    const next = patchMetaConfigAsSystem(db, () => patch, { actorId, now });
    crmAudit(db, { actorId, action: CRM_AUDIT.metaAction, target: "meta", details: { action: "test_mode", on: input.on }, now });
    return { ok: true, result: { action: "test_mode", ok: true, code: null, testMode: { active: testModeActive(next, now), until: next.acceptTestLeadsUntil } } };
  }

  const needsKey = input.action === "regenerate_verify_token" || input.action === "reseal";
  if (needsKey && !secretBoxStatus().configured) return { ok: false, error: "not_configured" };

  const result = await run(input.action, runtime, actorId);
  crmAudit(db, { actorId, action: CRM_AUDIT.metaAction, target: "meta", details: { action: input.action, ok: result.ok }, now: runtime.now() });
  if (!result.ok) metaLog(`action.${input.action}`, "warn", result.code ?? undefined);
  return { ok: true, result };
}

async function run(action: Exclude<MetaAction, "test_mode">, runtime: MetaRuntime, actorId: string): Promise<MetaActionResult> {
  const db = getDb();
  const now = runtime.now();
  switch (action) {
    case "regenerate_verify_token": {
      const token = generateVerifyToken();
      storeMetaSecret(db, "verify_token", token, { actorId, now });
      return { action, ok: true, code: null, verifyToken: token };
    }
    case "reseal":
      return { action, ok: true, code: null, resealed: resealMetaSecrets(db, { actorId, now }) };
    case "process_now": {
      releaseHeldIfReady(db, now);
      const report = await processMetaInbox({ runtime, force: true });
      return report.skipped && report.skipped !== "paused" ? fail(action, report.skipped) : { action, ok: true, code: null, processed: processedOf(report) };
    }
    case "retry_failed": {
      const retried = retryFailedRows(db, now);
      const report = await processMetaInbox({ runtime, force: true });
      return { action, ok: true, code: report.skipped, retried, processed: processedOf(report) };
    }
    case "sync_leads": {
      const sync = await reconcileMetaLeads({ runtime });
      if (!sync.ok) return { ...fail(action, sync.code ?? "failed"), enqueued: sync.enqueued };
      const report = await processMetaInbox({ runtime });
      return { action, ok: true, code: null, enqueued: sync.enqueued, processed: processedOf(report) };
    }
    case "sync_forms":
      return syncForms(runtime, actorId);
    case "subscribe_page":
      return subscribePage(runtime);
    case "check":
      return checkConnection(runtime, actorId);
  }
}

/** The Page token when one is stored, else the stored token (a Page token works directly). */
function pageToken(): string | null {
  return leadReadToken(getDb());
}

async function subscribePage(runtime: MetaRuntime): Promise<MetaActionResult> {
  const db = getDb();
  const config = getMetaConfig(db).value;
  const client = graphClientFor(db, config, runtime);
  const token = pageToken();
  if (!client || !token) return fail("subscribe_page", "not_configured");
  if (!config.pageId) return fail("subscribe_page", "no_page_id");
  const result = await client.request<{ success?: boolean }>("POST", `${config.pageId}/subscribed_apps`, { subscribed_fields: "leadgen" }, token);
  if (!result.ok) return fail("subscribe_page", result.error.reason);
  const subscribed = result.data.success === true;
  updateMetaStatus(db, { pageSubscribed: subscribed }, runtime.now());
  return subscribed ? { action: "subscribe_page", ok: true, code: null } : fail("subscribe_page", "not_subscribed");
}

/** Adds newly seen question keys to the field map with CORE's guess (a super admin's choice is kept). */
export function mergeFieldMap(current: Readonly<Record<string, ImportTarget>>, forms: readonly GraphForm[]): Record<string, ImportTarget> {
  const next: Record<string, ImportTarget> = { ...current };
  for (const form of forms) {
    for (const question of Array.isArray(form.questions) ? form.questions.slice(0, 100) : []) {
      const key = typeof question?.key === "string" ? question.key.slice(0, 120) : "";
      if (!key || Object.hasOwn(next, key) || Object.keys(next).length >= 200) continue;
      next[key] = guessTarget(key);
    }
  }
  return next;
}

/** Synced forms keep their defaults and consent checkbox key; new forms start empty. */
export function mergeForms(current: readonly MetaFormConfig[], forms: readonly GraphForm[]): MetaFormConfig[] {
  const out: MetaFormConfig[] = [];
  for (const form of forms.slice(0, 100)) {
    const id = typeof form.id === "string" && /^\d{5,20}$/.test(form.id) ? form.id : null;
    if (!id || out.some((existing) => existing.id === id)) continue;
    const known = current.find((existing) => existing.id === id);
    out.push({
      id,
      name: typeof form.name === "string" ? form.name.slice(0, 200) : (known?.name ?? ""),
      status: typeof form.status === "string" ? form.status.slice(0, 40) : (known?.status ?? ""),
      defaults: known?.defaults ?? {},
      consentCheckboxKey: known?.consentCheckboxKey ?? null,
    });
  }
  return out;
}

async function syncForms(runtime: MetaRuntime, actorId: string): Promise<MetaActionResult> {
  const db = getDb();
  const config = getMetaConfig(db).value;
  const client = graphClientFor(db, config, runtime);
  const token = pageToken();
  if (!client || !token) return fail("sync_forms", "not_configured");
  if (!config.pageId) return fail("sync_forms", "no_page_id");
  const forms: GraphForm[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const params: Record<string, string> = { fields: "id,name,status,questions", limit: "50" };
    if (after) params.after = after;
    const result = await client.request<GraphPaged<GraphForm>>("GET", `${config.pageId}/leadgen_forms`, params, token);
    if (!result.ok) return fail("sync_forms", result.error.reason);
    forms.push(...(Array.isArray(result.data.data) ? result.data.data : []));
    after = result.data.paging?.next ? (result.data.paging.cursors?.after ?? null) : null;
    if (!after) break;
  }
  const next = patchMetaConfigAsSystem(db, (current: MetaConfig) => ({ forms: mergeForms(current.forms, forms), fieldMap: mergeFieldMap(current.fieldMap, forms) }), {
    actorId,
    now: runtime.now(),
  });
  return { action: "sync_forms", ok: true, code: null, forms: next.forms.length };
}

/**
 * "Check connection" (§7 step 7): `debug_token` (valid, type, expiry, scopes) with the app token;
 * for USER / SYSTEM_USER tokens the Page token is fetched and sealed; then the Page's subscribed
 * apps. A valid token that reaches the Page clears a pause; a token Meta calls invalid pauses
 * (`auth`); a token that cannot reach the Page pauses (`permission`).
 */
async function checkConnection(runtime: MetaRuntime, actorId: string): Promise<MetaActionResult> {
  const db = getDb();
  const now = runtime.now();
  const config = getMetaConfig(db).value;
  const client = graphClientFor(db, config, runtime);
  const appSecret = readMetaSecret(db, "app_secret");
  const access = readMetaSecret(db, "access_token");
  const checks: MetaCheckLine[] = [];
  if (!client || !appSecret.ok || !access.ok) return { ...fail("check", "not_configured"), checks };
  if (!config.appId) return { ...fail("check", "no_app_id"), checks: [{ key: "app", ok: false, code: "no_app_id" }] };
  checks.push({ key: "app", ok: true, code: null });

  const debug = await client.request<GraphDebugToken>("GET", "debug_token", { input_token: access.value }, `${config.appId}|${appSecret.value}`);
  if (!debug.ok) {
    checks.push({ key: "token", ok: false, code: debug.error.reason });
    return { action: "check", ok: false, code: debug.error.reason, checks };
  }
  const data = debug.data.data ?? {};
  const type = typeof data.type === "string" ? data.type.slice(0, 40) : null;
  const expiresAt = typeof data.expires_at === "number" && data.expires_at > 0 ? new Date(data.expires_at * 1000).toISOString() : null;
  const scopes = Array.isArray(data.scopes) ? data.scopes.filter((scope): scope is string => typeof scope === "string").slice(0, 40) : [];
  const valid = data.is_valid === true;
  updateMetaStatus(db, { tokenInfo: { type: type ?? "", expiresAt, scopes, checkedAt: new Date(now).toISOString() } }, now);
  checks.push({ key: "token", ok: valid, code: valid ? null : "token_invalid", tokenType: type });
  if (!valid) {
    updateMetaStatus(db, { paused: "auth", pausedAt: new Date(now).toISOString(), lastErrorCode: "token_invalid" }, now);
    return { action: "check", ok: false, code: "token_invalid", checks };
  }
  checks.push({ key: "expiry", ok: true, code: expiresAt ? "expires" : "never", expiresAt });
  const missing = META_REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
  checks.push({ key: "scopes", ok: missing.length === 0, code: missing.length === 0 ? null : "missing_scopes", missingScopes: missing });

  if (!config.pageId) {
    checks.push({ key: "page", ok: false, code: "no_page_id" });
    return { action: "check", ok: false, code: "no_page_id", checks };
  }
  let pageTokenValue = access.value;
  if (type === "USER" || type === "SYSTEM_USER") {
    const page = await client.request<{ access_token?: string; name?: string }>("GET", config.pageId, { fields: "access_token,name" }, access.value);
    if (!page.ok || typeof page.data.access_token !== "string" || page.data.access_token.length < 20) {
      const code = page.ok ? "no_page_token" : page.error.reason;
      checks.push({ key: "page", ok: false, code });
      updateMetaStatus(db, { paused: "permission", pausedAt: new Date(now).toISOString(), lastErrorCode: code }, now);
      return { action: "check", ok: false, code, checks };
    }
    pageTokenValue = page.data.access_token;
    storeMetaSecret(db, "page_token", pageTokenValue, { actorId, now, audit: false });
  }
  checks.push({ key: "page", ok: true, code: null });

  const apps = await client.request<GraphPaged<{ id?: string; subscribed_fields?: unknown[] }>>("GET", `${config.pageId}/subscribed_apps`, {}, pageTokenValue);
  const subscribed =
    apps.ok &&
    (apps.data.data ?? []).some((app) => app?.id === config.appId && Array.isArray(app.subscribed_fields) && app.subscribed_fields.includes("leadgen"));
  checks.push({ key: "subscribed", ok: subscribed, code: apps.ok ? (subscribed ? null : "not_subscribed") : apps.error.reason });
  const status = readMetaStatus(db);
  updateMetaStatus(db, { pageSubscribed: apps.ok ? subscribed : status.pageSubscribed, ...(status.paused ? { paused: null, pausedAt: null } : {}), consecutivePermissionFailures: 0 }, now);
  releaseHeldIfReady(db, now);
  return { action: "check", ok: checks.every((line) => line.ok), code: null, checks };
}
