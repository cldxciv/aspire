import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "@/lib/db/connection";

import type { AliasKind } from "../lead-ops-types";
import { getAreasSeed, writeSetting } from "../settings";
import { insertAlias, insertArea, listActiveAliasRows, putCentre } from "../repo/areas";
import { AMBIGUOUS_PLACES, DISTRICT_SEEDS, SEED_VERSION, type DistrictSeed } from "./districts";
import { buildAliasIndex, normaliseAlias, type AliasIndex } from "./resolve";

/**
 * The lazy, one-time seed of the 12 HP districts (docs/lead-routing-plan.md §13.1; owner LR-ROUTING).
 *
 * - guarded by the `areas_seed` setting: once present the seed never runs again, even if a super
 *   admin later renames, merges or deactivates the seeded areas;
 * - a per-database memo skips even that check, but is only set when the seed is seen OUTSIDE a
 *   transaction (so a capture that seeds and then rolls back never leaves a stale memo); a test
 *   that opens a fresh database gets a new object and is seeded again;
 * - runs inside the caller's transaction and writes NO audit and NO activity rows (P5);
 * - INSERT OR IGNORE everywhere, so a half-seeded database (or an area an admin created with a
 *   seed id) is completed, never duplicated.
 */
const seeded = new WeakSet<DatabaseSync>();

export function ensureAreasSeeded(db: DatabaseSync, now: number): void {
  if (seeded.has(db)) return;
  if (getAreasSeed(db) !== null) {
    if (!db.isTransaction) seeded.add(db);
    return;
  }
  DISTRICT_SEEDS.forEach((district, position) => {
    insertArea(db, {
      id: district.id,
      nameEn: district.en,
      nameHi: district.hi,
      kind: "district",
      defaultCentreSlug: district.defaultCentre,
      position,
      actorId: null,
      now,
    });
  });
  for (const district of DISTRICT_SEEDS) {
    for (const centre of district.centres) {
      // Only when the centre is not already in an area (an admin's earlier choice wins).
      const taken = db.prepare("SELECT 1 AS ok FROM crm_area_centres WHERE centre_slug = ?").get(centre);
      if (!taken) putCentre(db, centre, district.id, now);
    }
    for (const alias of seedAliases(district)) {
      insertAlias(db, { key: alias.key, areaId: district.id, label: alias.label, kind: alias.kind, actorId: null, now });
    }
  }
  writeSetting(db, "areas_seed", { seededAt: new Date(now).toISOString(), version: SEED_VERSION }, { expectedVersion: null, actorId: null, now, audit: false });
  invalidateAliasIndex(db);
}

/**
 * Seeds the areas from a READ path (GET /api/crm/areas, the areas page) without a write lock once
 * seeded: a lock-free check first, a transaction only the very first time.
 */
export function ensureAreasSeededForRead(db: DatabaseSync, now: number): void {
  if (seeded.has(db)) return;
  if (getAreasSeed(db) === null) withTransaction(db, () => ensureAreasSeeded(db, now));
  if (!db.isTransaction && getAreasSeed(db) !== null) seeded.add(db);
}

/** A district's seeded aliases with their keys: English name, Hindi name, then the listed ones (first key wins). */
export function seedAliases(district: DistrictSeed): { key: string; label: string; kind: AliasKind }[] {
  const all: { label: string; kind: AliasKind }[] = [{ label: district.en, kind: "district" }, { label: district.hi, kind: "hindi" }, ...district.aliases];
  const seen = new Set<string>();
  const out: { key: string; label: string; kind: AliasKind }[] = [];
  for (const alias of all) {
    const key = normaliseAlias(alias.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: alias.label, kind: alias.kind });
  }
  return out;
}

/**
 * Built indexes per database for READ paths (an import preview of 250 rows reads the aliases
 * once). Inside a transaction the index is always built fresh (it may see uncommitted rows), and
 * batches inside one pass it along explicitly. Every alias / area write in this package calls
 * `invalidateAliasIndex`; the short lifetime is only a safety net.
 */
const indexCache = new WeakMap<DatabaseSync, { index: AliasIndex; builtAt: number }>();
const INDEX_TTL_MS = 60_000;

/** The resolver's index from the database: aliases of active areas, plus the code's ambiguous keys. */
export function loadAliasIndex(db: DatabaseSync): AliasIndex {
  const build = () =>
    buildAliasIndex(
      listActiveAliasRows(db).map((row) => ({ key: row.key, areaId: row.areaId, kind: row.kind })),
      AMBIGUOUS_PLACES,
    );
  if (db.isTransaction) return build();
  const cached = indexCache.get(db);
  const now = Date.now();
  if (cached && now - cached.builtAt < INDEX_TTL_MS) return cached.index;
  const index = build();
  indexCache.set(db, { index, builtAt: now });
  return index;
}

/** Drops the cached index (after any change to aliases or to which areas are active). */
export function invalidateAliasIndex(db: DatabaseSync): void {
  indexCache.delete(db);
}
