import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "@/lib/db/connection";

import type { MetaConfig, MetaStatus } from "../lead-ops-types";
import { getMetaStatus, writeSetting } from "../settings";

/**
 * `crm_settings.meta_status` — written by the system, never audited (§12): timestamps of the
 * handshake, deliveries, imports and syncs, the pause, the token facts and the fields mode.
 * Updates are read-modify-write inside one write transaction (joins the caller's), so two
 * workers never lose each other's fields.
 */

export type MetaStatusPatch = Partial<MetaStatus>;

export function readMetaStatus(db: DatabaseSync): MetaStatus {
  return getMetaStatus(db).value;
}

/** Merges `patch` (or `patch(current)`) into the status document. Returns the new status. */
export function updateMetaStatus(db: DatabaseSync, patch: MetaStatusPatch | ((current: MetaStatus) => MetaStatusPatch), now: number): MetaStatus {
  return withTransaction(db, () => {
    const current = readMetaStatus(db);
    const next: MetaStatus = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
    writeSetting(db, "meta_status", next, { expectedVersion: null, actorId: null, now, audit: false });
    return next;
  });
}

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * The "No Meta leads for N hours" alert (§18.5): hours since the last import, or null. When no
 * lead was ever imported it counts from `since` (the time the Meta settings were last saved, so at
 * the latest from when the integration was switched on): a connection broken from day one alerts too.
 */
export function silentHoursOf(
  config: Pick<MetaConfig, "enabled" | "silenceAlertHours">,
  status: Pick<MetaStatus, "lastImportAt">,
  now: number,
  since: string | null = null,
): number | null {
  if (!config.enabled || config.silenceAlertHours <= 0) return null;
  const from = status.lastImportAt ?? since;
  if (!from) return null;
  const last = Date.parse(from);
  if (!Number.isFinite(last)) return null;
  const hours = Math.floor((now - last) / 3_600_000);
  return hours >= config.silenceAlertHours ? hours : null;
}

const LOOPBACK_HOSTNAME = /^(127(\.\d{1,3}){3}|localhost|\[::1\])$/;

/**
 * "This site's address differs from the one Meta verified" (Part 2, step 3): compares host names
 * only. The proxy may not forward the scheme (Next then records `http`), and CORE's same-origin
 * check ignores it too; a loopback host means the proxy forwarded no host at all, which proves
 * nothing either way. Unparsable values never warn.
 */
export function siteHostChanged(verifiedSiteUrl: string | null, siteOrigin: string): boolean {
  if (!verifiedSiteUrl || !siteOrigin) return false;
  try {
    const verified = new URL(verifiedSiteUrl).hostname;
    if (LOOPBACK_HOSTNAME.test(verified)) return false;
    return verified !== new URL(siteOrigin).hostname;
  } catch {
    return false;
  }
}

/** The fields mode in force now (basic only until its `until`). */
export function fieldsModeAt(status: Pick<MetaStatus, "fieldsMode">, now: number): "full" | "basic" {
  if (status.fieldsMode.mode !== "basic" || !status.fieldsMode.until) return "full";
  const until = Date.parse(status.fieldsMode.until);
  return Number.isFinite(until) && until > now ? "basic" : "full";
}

export const statusTime = iso;
