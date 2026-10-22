import "server-only";

import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { NextResponse } from "next/server";

import type { ApiError } from "@/lib/contracts/api";
import { rejectCrossOrigin } from "@/lib/auth/request";
import { recordAudit } from "@/lib/db/audit";
import { roleCan } from "@/lib/qb/access";
import { qbDb } from "@/lib/qb/db";
import { requireQbApi } from "@/lib/qb/http";
import { applyAnswerKey, applyHindiPairing, upsertImportDrafts } from "@/lib/qb/import-hooks";
import { mathProblemsIn } from "@/lib/qb/math-check";
import { originalMarkingFor, patternTagFor } from "@/lib/qb/patterns";
import { normaliseDollarMath } from "@/lib/qb/rich-text";
import { ensureQbSeeded } from "@/lib/qb/seed";
import { importSettingEnabled, isTaxonomyConfirmed } from "@/lib/qb/settings";
import { chapterListFor } from "@/lib/qb/taxonomy";
import type { QbAnswer, QbCapability, QbSubject, QbViewer } from "@/lib/qb/types";

import { createAnthropicImportClient, type QbImportClient } from "./client";
import { getImportConfig } from "./config";
import type { ImportDeps, ImportHooks } from "./deps";
import type { ImportQuestionRef, ImportViewer, KeyMatch } from "./types";

/**
 * Production wiring of QB-IMPORT: the ONLY file of this package that imports QB-CORE-A / QB-CORE-B
 * / QB-SEED runtime code. Everything else takes `ImportDeps`, so tests inject fakes and the
 * integrator adjusts names here only.
 *
 * Used (docs/question-bank-plan.md §B6, §B14):
 * - `requireQbApi(request, capability)` (src/lib/qb/http.ts) → `{ ok, viewer | response }`;
 *   `roleCan(role, capability)` (access.ts) for the per-action check after it.
 * - `qbDb()` (db.ts) and `ensureQbSeeded(db)` (seed): route handlers call them before services.
 * - `isTaxonomyConfirmed(db, exam)`, `importSettingEnabled(db)` (settings.ts),
 *   `chapterListFor(exam, db)` (taxonomy.ts).
 * - ASSUMED (src/lib/qb/import-hooks.ts, not written yet when this was built):
 *   `upsertImportDrafts(importId, drafts, db) → { created, updated }`,
 *   `applyAnswerKey(matches, db) → { applied }`, `applyHindiPairing(pairs, db) → { applied }`, with
 *   the `KeyMatch` / `HindiPair` / `ImportDraft` shapes of ./types.ts.
 * - Bank questions of an import are READ directly from `qb_questions` (columns of §B4) for key
 *   matching and Hindi pairing; every WRITE to the bank goes through the hooks.
 */

const RUNNER_ID = `run_${process.pid}_${randomBytes(6).toString("hex")}`;

export function toImportViewer(viewer: Pick<QbViewer, "userId" | "displayName" | "role">): ImportViewer {
  return { userId: viewer.userId, displayName: viewer.displayName, role: viewer.role, can: (capability) => roleCan(viewer.role, capability) };
}

export type ImportGuard = { ok: true; viewer: ImportViewer } | { ok: false; response: NextResponse<ApiError> | NextResponse };

/** Route guard: same-origin for writes, then QB-CORE-B's `requireQbApi` for `capability`. */
export async function requireImportApi(request: Request, capability: QbCapability, options: { write: boolean }): Promise<ImportGuard> {
  if (options.write) {
    const rejection = rejectCrossOrigin(request);
    if (rejection) return { ok: false, response: rejection.response };
  }
  const guard = await requireQbApi(request, capability);
  if (!guard.ok) return { ok: false, response: guard.response };
  return { ok: true, viewer: toImportViewer(guard.viewer) };
}

function json<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Bank questions created by the given imports (read-only; drafts included, rejected ones left out). */
export function readImportQuestions(db: DatabaseSync, importIds: readonly string[]): ImportQuestionRef[] {
  if (importIds.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT id, import_id, source_key, subject, type, content, source, key_stage, status
         FROM qb_questions WHERE import_id IN (${importIds.map(() => "?").join(", ")}) AND status <> 'rejected'`,
    )
    .all(...importIds) as Record<string, unknown>[];
  return rows.map((row) => {
    const content = json<{ options?: unknown[]; answer?: QbAnswer | null }>(row.content, {});
    const source = json<{ qno?: string; questionRef?: string; optionRefs?: string[]; booklet?: string }>(row.source, {});
    return {
      id: String(row.id),
      importId: (row.import_id as string | null) ?? null,
      sourceKey: (row.source_key as string | null) ?? null,
      subject: row.subject as QbSubject,
      type: row.type as ImportQuestionRef["type"],
      qno: source.qno ?? null,
      questionRef: source.questionRef ?? null,
      optionRefs: source.optionRefs ?? [],
      booklet: source.booklet ?? null,
      optionCount: Array.isArray(content.options) ? content.options.length : 0,
      answer: content.answer ?? null,
      keyStage: (row.key_stage as ImportQuestionRef["keyStage"]) ?? null,
      status: String(row.status),
    };
  });
}

let cachedClient: { key: string; client: QbImportClient | null } | null = null;

function clientFor(apiKey: string | null, workspaceId: string | null): QbImportClient | null {
  const key = `${apiKey ?? ""}|${workspaceId ?? ""}`;
  if (!cachedClient || cachedClient.key !== key) cachedClient = { key, client: createAnthropicImportClient({ apiKey, workspaceId }) };
  return cachedClient.client;
}

type HookKeyMatch = Parameters<typeof applyAnswerKey>[0][number];

/**
 * QB-CORE-B's `KeyMatchInput.keyStage` is still typed `provisional | final`. A key from Aspire's own
 * files passes `aspire`, which the hook stores as `key_stage: aspire` (its `officialKeyStage` is
 * only ever read when it is `final`). Integrator / QB-CORE-B: widen `KeyMatchInput.keyStage` with
 * "aspire" (and skip `imported.officialAnswer` for it), then drop this cast.
 */
function toHookKeyMatch(match: KeyMatch): HookKeyMatch {
  return { ...match, keyStage: match.keyStage as HookKeyMatch["keyStage"] };
}

export function hooksFor(db: DatabaseSync): ImportHooks {
  return {
    upsertImportDrafts: (importId, drafts) => upsertImportDrafts(importId, [...drafts], db),
    applyAnswerKey: (matches) => applyAnswerKey(matches.map(toHookKeyMatch), db),
    applyHindiPairing: (pairs) => applyHindiPairing([...pairs], db),
    chapterListFor: (exam) => chapterListFor(exam, db).map(({ id, subject, label }) => ({ id, subject, label })),
    taxonomyConfirmed: (exam) => isTaxonomyConfirmed(db, exam),
    importSettingEnabled: () => importSettingEnabled(db),
    listImportQuestions: (importIds) => readImportQuestions(db, importIds),
  };
}

/** Production dependencies (route handlers only: they write to the database). */
export function importDeps(): ImportDeps {
  const db = qbDb();
  ensureQbSeeded(db);
  const config = getImportConfig();
  return {
    db,
    now: Date.now,
    config,
    client: () => clientFor(config.apiKey, config.workspaceId),
    hooks: hooksFor(db),
    text: {
      normaliseDollarMath,
      mathIssues: (text) => mathProblemsIn(text).map((problem) => problem.message),
    },
    patterns: { patternTag: patternTagFor, originalMarking: originalMarkingFor },
    runnerId: RUNNER_ID,
    audit: (entry) => recordAudit(db, { ...entry, now: Date.now() }),
  };
}
