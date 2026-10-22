import "server-only";

import { getDb } from "@/lib/db/connection";

import { parseMetaLeadId, parseMetaTime } from "../intake/fields";
import type { MetaPauseReason } from "../lead-ops-types";
import { hasExternalRef } from "../repo/intake";
import { hasInboxRow, insertInboxRow } from "../repo/meta";
import { getMetaConfig } from "../settings";
import { metaReadiness } from "./config";
import type { GraphPaged } from "./graph";
import { graphClientFor, leadReadToken } from "./inbox";
import { metaLog, metaRuntime, type MetaRuntime } from "./runtime";
import { readMetaStatus, updateMetaStatus } from "./status";

/**
 * Reconciliation (docs/lead-routing-plan.md §18.5): for each configured form, a bulk read of
 * `id,created_time` ONLY (M9: no answers are fetched for ids we already have) of the leads created
 * since `lastSyncAt − 1 h` (7 days on the first run). New ids join the inbox (`via: "sync"`) —
 * pending when the integration is ready, otherwise held.
 */

const HOUR = 60 * 60 * 1000;
const FIRST_SYNC_MS = 7 * 24 * HOUR;
const MAX_PAGES_PER_FORM = 20;

export interface SyncReport {
  ok: boolean;
  /** Fixed reason when not ok (`no_forms`, `not_configured`, `graph_190`, …). */
  code: string | null;
  enqueued: number;
  paused: MetaPauseReason | null;
}

interface LeadStub {
  id?: string;
  created_time?: string;
}

export async function reconcileMetaLeads(options: { runtime?: Partial<MetaRuntime> } = {}): Promise<SyncReport> {
  const runtime = metaRuntime(options.runtime);
  const db = getDb();
  const now = runtime.now();
  const config = getMetaConfig(db).value;
  const status = readMetaStatus(db);
  const token = leadReadToken(db);
  const client = graphClientFor(db, config, runtime);
  if (!token || !client) return { ok: false, code: "not_configured", enqueued: 0, paused: null };
  if (config.forms.length === 0) return { ok: false, code: "no_forms", enqueued: 0, paused: null };

  const last = status.lastSyncAt ? Date.parse(status.lastSyncAt) : Number.NaN;
  const since = Number.isFinite(last) ? last - HOUR : now - FIRST_SYNC_MS;
  const filtering = JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(since / 1000) }]);
  const ready = metaReadiness(db, config).ready;
  let enqueued = 0;

  for (const form of config.forms.slice(0, 100)) {
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES_PER_FORM; page += 1) {
      const params: Record<string, string> = { fields: "id,created_time", filtering, limit: "100" };
      if (after) params.after = after;
      const result = await client.request<GraphPaged<LeadStub>>("GET", `${form.id}/leads`, params, token);
      if (!result.ok) {
        const { kind, reason } = result.error;
        if (kind === "pause_auth" || kind === "token_transport") {
          updateMetaStatus(db, { paused: "auth", pausedAt: new Date(now).toISOString(), lastErrorCode: reason }, now);
          metaLog("sync", "warn", "paused_auth");
          return { ok: false, code: reason, enqueued, paused: "auth" };
        }
        updateMetaStatus(db, { lastErrorCode: reason }, now);
        metaLog("sync", "warn", reason);
        return { ok: false, code: reason, enqueued, paused: null };
      }
      for (const stub of Array.isArray(result.data.data) ? result.data.data : []) {
        const id = parseMetaLeadId(typeof stub?.id === "string" ? stub.id : "");
        if (!id || hasExternalRef(db, "meta", id) || hasInboxRow(db, id)) continue;
        const created = parseMetaTime(stub.created_time ?? "");
        const inserted = insertInboxRow(db, {
          leadgenId: id,
          formId: form.id,
          metaCreatedAt: created ? Date.parse(created) : null,
          via: "sync",
          status: ready ? "pending" : "held",
          now,
        });
        if (inserted) enqueued += 1;
      }
      after = result.data.paging?.next ? (result.data.paging.cursors?.after ?? null) : null;
      if (!after) break;
    }
  }
  updateMetaStatus(db, { lastSyncAt: new Date(now).toISOString() }, now);
  metaLog("sync", "success");
  return { ok: true, code: null, enqueued, paused: null };
}
