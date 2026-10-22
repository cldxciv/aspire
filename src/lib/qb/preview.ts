import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { showPlaceholderContent } from "@/lib/content-mode";

import { qbCan } from "./access";
import { getBlueprintRow } from "./blueprints";
import { qbDb } from "./db";
import { generatePaper, previewStats, readiness, type PreviewStats } from "./generator";
import { weightsFor } from "./pool";
import { getQuestionRecords } from "./repo/questions";
import { forbidden, notFound, ok, type QbResult } from "./result";
import { bankRevision } from "./settings";
import type { QbBlueprint, QbDifficulty, QbFormat, QbPaperComposition, QbQuestionType, QbReadiness, QbSourceKind, QbViewer } from "./types";
import { practicePool, reservationKey } from "./windows";

/**
 * Blueprint previews for staff (owner: QB-CORE-B; §B9, R22): readiness, one sample paper for a
 * seed, and statistics over many seeds (cached per bank revision and blueprint state). These use the
 * same practice pool as students (placeholder content as the site shows it; clusters reserved by an
 * open ranked template left out), never drafts.
 */

export interface QbPreviewItem {
  id: string;
  n: number;
  version: number;
  chapterId: string;
  difficulty: QbDifficulty;
  sourceKind: QbSourceKind;
  sourceYear: number | null;
  type: QbQuestionType;
  format: QbFormat;
  stemPreview: string;
}

export interface QbBlueprintPreview {
  seed: string;
  language: "en" | "hi";
  ok: boolean;
  short: boolean;
  composition: QbPaperComposition | null;
  readiness: QbReadiness | null;
  parts: { partId: string; durationMinutes: number; maxScore: number; sections: { sectionId: string; items: QbPreviewItem[] }[] }[];
}

function inputs(db: DatabaseSync, blueprint: QbBlueprint, now: number) {
  const pool = practicePool(db, blueprint.exam, now);
  const { weights, formatTargets } = weightsFor(db, blueprint, now);
  return { pool, weights, formatTargets, placeholderMode: showPlaceholderContent() };
}

export function blueprintReadiness(
  viewer: QbViewer,
  id: string,
  input: { language: "en" | "hi"; now?: number },
  db: DatabaseSync = qbDb(),
): QbResult<QbReadiness> {
  if (!qbCan(viewer, "view")) return forbidden();
  const row = getBlueprintRow(db, id);
  if (!row) return notFound("No such blueprint.");
  const base = inputs(db, row.blueprint, input.now ?? Date.now());
  return ok(readiness({ blueprint: row.blueprint, ...base, language: input.language }));
}

export function blueprintPreview(
  viewer: QbViewer,
  id: string,
  input: { seed: string; language: "en" | "hi"; now?: number },
  db: DatabaseSync = qbDb(),
): QbResult<QbBlueprintPreview> {
  if (!qbCan(viewer, "view")) return forbidden();
  const row = getBlueprintRow(db, id);
  if (!row) return notFound("No such blueprint.");
  const seed = input.seed.slice(0, 64) || "preview";
  const base = inputs(db, row.blueprint, input.now ?? Date.now());
  const result = generatePaper({ blueprint: row.blueprint, ...base, softExclude: new Set(), mode: "practice", seed, language: input.language });
  if (!result.ok) return ok({ seed, language: input.language, ok: false, short: false, composition: null, readiness: result.readiness, parts: [] });
  const records = getQuestionRecords(
    db,
    result.parts.flatMap((p) => p.sections.flatMap((s) => s.items.map((i) => i.id))),
  );
  return ok({
    seed,
    language: input.language,
    ok: true,
    short: result.short,
    composition: result.composition,
    readiness: null,
    parts: result.parts.map((part) => ({
      partId: part.partId,
      durationMinutes: part.durationMinutes,
      maxScore: part.maxScore,
      sections: part.sections.map((section) => ({
        sectionId: section.sectionId,
        items: section.items.map((item) => {
          const stem = records.get(item.id)?.content.stem;
          const text = (stem?.en || stem?.hi || "").replace(/\s+/g, " ").trim();
          return {
            id: item.id,
            n: item.n,
            version: item.version,
            chapterId: item.chapterId,
            difficulty: item.difficulty,
            sourceKind: item.sourceKind,
            sourceYear: item.sourceYear,
            type: item.type,
            format: item.format,
            stemPreview: text.length > 160 ? `${text.slice(0, 157)}…` : text,
          };
        }),
      })),
    })),
  });
}

type StatsResult = PreviewStats & { seeds: number };

const statsCache = new WeakMap<DatabaseSync, Map<string, StatsResult>>();
const statsInFlight = new WeakMap<DatabaseSync, Map<string, Promise<StatsResult>>>();
/** Statistics runs are serialised: at most one is generating papers at any moment. */
let statsQueue: Promise<unknown> = Promise.resolve();

/** Default seed counts: a two-part blueprint (JEE Advanced) generates twice the questions per seed. */
export const PREVIEW_SEEDS_SINGLE = 100;
export const PREVIEW_SEEDS_MULTI_PART = 40;

/**
 * Statistics over `seeds` generated papers (default 100, or 40 for a two-part blueprint); admin
 * preview. Cached per blueprint state, bank revision and ranked reservations; identical concurrent
 * requests share one run, runs are serialised, and each run yields to the event loop between papers
 * so a long preview never stalls students' requests.
 */
export async function blueprintPreviewStats(
  viewer: QbViewer,
  id: string,
  input: { language: "en" | "hi"; seeds?: number; now?: number },
  db: DatabaseSync = qbDb(),
): Promise<QbResult<StatsResult>> {
  if (!qbCan(viewer, "view")) return forbidden();
  const row = getBlueprintRow(db, id);
  if (!row) return notFound("No such blueprint.");
  const now = input.now ?? Date.now();
  const fallback = row.blueprint.parts.length > 1 ? PREVIEW_SEEDS_MULTI_PART : PREVIEW_SEEDS_SINGLE;
  const seeds = Math.max(1, Math.min(200, Math.floor(input.seeds ?? fallback)));
  const key = `${id}|${row.updatedAt}|${bankRevision(db)}|${reservationKey(db, row.blueprint.exam, now)}|${showPlaceholderContent()}|${input.language}|${seeds}`;
  let perDb = statsCache.get(db);
  if (!perDb) statsCache.set(db, (perDb = new Map()));
  const cached = perDb.get(key);
  if (cached) return ok(cached);
  let running = statsInFlight.get(db);
  if (!running) statsInFlight.set(db, (running = new Map()));
  const existing = running.get(key);
  if (existing) return ok(await existing);

  const blueprint = row.blueprint;
  const job = statsQueue
    .catch(() => undefined)
    .then(async (): Promise<StatsResult> => {
      const base = inputs(db, blueprint, now);
      const stats = await previewStats({ blueprint, ...base, softExclude: new Set(), mode: "practice", language: input.language }, seeds);
      return { ...stats, seeds };
    });
  statsQueue = job;
  running.set(key, job);
  try {
    const stats = await job;
    if (perDb.size > 20) perDb.clear();
    perDb.set(key, stats);
    return ok(stats);
  } finally {
    running.delete(key);
  }
}
