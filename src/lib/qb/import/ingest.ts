import "server-only";

import type { CallUsage } from "./client";
import { IMPORT_AUDIT, type ImportDeps } from "./deps";
import { matchKeyRows } from "./keys";
import { headerMismatches, normalizeOutput, thirdPartyMarks, type NormalizeContext } from "./normalize";
import { pairHindi } from "./pairing";
import { addUsageTotals, getImport, type ImportRecord, importsOfKind, itemCounts, listItems, updateImport, updateItem } from "./repo";
import type { ImportDraft, ItemOutput, KeyMatch, PageMark, PatternSnapshot, PrintedHeader, QbImportMeta } from "./types";
import { isKeyJob, isPairingJob } from "./work";

/**
 * Storing what an item produced, and finishing a job (docs/question-bank-plan.md §B8.6–B8.8).
 * - Papers / bank files: drafts are upserted as each item finishes (QB-CORE-B `upsertImportDrafts`,
 *   idempotent on `source_key`).
 * - Keys and Hindi pairing are applied once, when every item has finished, so conflicts inside a
 *   key are seen together.
 * - Page marks and section instructions accumulate on the job (third-party check, pattern snapshot).
 */

const MAX_MARKS = 100;
const MAX_SECTIONS = 60;

function mergeMarks(existing: readonly PageMark[], incoming: readonly PageMark[]): PageMark[] {
  const merged = [...existing];
  const seen = new Set(existing.map((mark) => `${mark.kind}|${mark.text.toLowerCase()}`));
  for (const mark of incoming) {
    const key = `${mark.kind}|${mark.text.toLowerCase()}`;
    if (seen.has(key) || merged.length >= MAX_MARKS) continue;
    seen.add(key);
    merged.push(mark);
  }
  return merged;
}

function mergeSnapshot(existing: PatternSnapshot | null, output: ItemOutput): PatternSnapshot | null {
  if (output.instructions.length === 0) return existing;
  const snapshot: PatternSnapshot = existing ?? { sections: [], confirmedBy: null, confirmedAt: null, note: null };
  const seen = new Set(snapshot.sections.map((section) => section.text));
  const sections = [...snapshot.sections];
  for (const section of output.instructions) {
    if (seen.has(section.text) || sections.length >= MAX_SECTIONS) continue;
    seen.add(section.text);
    sections.push(section);
  }
  return { ...snapshot, sections };
}

/** `exam|year|date|session|shift|paper` of an official paper (booklets are compared separately). */
export function paperKeyOf(meta: ImportRecord["meta"]): string | null {
  if (meta.sourceKind !== "official" || !meta.exam || meta.year === undefined) return null;
  return [meta.exam, meta.year, meta.date ?? "", meta.session ?? "", meta.shift ?? "", meta.paper ?? ""].join("|");
}

/**
 * The stage a key import applies with: an official key's own stage (required at upload; a missing
 * one counts as provisional, never final), and `aspire` for a key from Aspire's files, so an Aspire
 * answer is never stored as an official key.
 */
export function keyStageOf(meta: ImportRecord["meta"]): KeyMatch["keyStage"] {
  if (meta.sourceKind !== "official") return "aspire";
  return meta.keyStage ?? "provisional";
}

/** The paper imports a key applies to: `meta.keyFor`, else every open paper import with the same paper key. */
export function keyTargetImportIds(deps: Pick<ImportDeps, "db">, job: ImportRecord): string[] {
  if (job.meta.keyFor && job.meta.keyFor.length > 0) return [...job.meta.keyFor];
  const key = paperKeyOf(job.meta);
  if (!key) return [];
  return importsOfKind(deps.db, ["pdf_paper"])
    .filter((paper) => paper.status !== "cancelled" && paperKeyOf(paper.meta) === key && paper.meta.language !== "hi")
    .map((paper) => paper.id);
}

export function jobIsThirdParty(job: Pick<ImportRecord, "pageMarks" | "meta">): boolean {
  return thirdPartyMarks(job.pageMarks, job.meta.sourceKind).length > 0;
}

export function normalizeContextFor(deps: Pick<ImportDeps, "hooks" | "text" | "patterns">, job: ImportRecord): NormalizeContext {
  return {
    importId: job.id,
    kind: job.kind,
    meta: job.meta,
    chapters: job.meta.exam ? deps.hooks.chapterListFor(job.meta.exam) : [],
    thirdParty: jobIsThirdParty(job),
    snapshot: job.patternSnapshot,
    text: deps.text,
    patterns: deps.patterns,
  };
}

function upsertDrafts(deps: ImportDeps, job: ImportRecord, drafts: readonly ImportDraft[]): { created: number; skipped: number } {
  if (drafts.length === 0) return { created: 0, skipped: 0 };
  const { created, updated } = deps.hooks.upsertImportDrafts(job.id, drafts);
  // QB-CORE-B leaves questions staff already edited, approved or rejected alone.
  return { created, skipped: Math.max(0, drafts.length - created - updated) };
}

/** Job warning: third-party marks were found after staff had touched some of the file's questions. */
export const THIRD_PARTY_AFTER_EDIT = "third_party_after_edit";

/**
 * Re-upserts every finished item's drafts (after the third-party status or the snapshot changed).
 * When the file turns out to be third-party, EVERY question of the import must carry the flag,
 * including ones a reviewer edited or approved meanwhile, which the upsert does not touch. The
 * flag-only hook does that when QB-CORE-B provides it; until then the job shows a warning, so staff
 * check this import's questions by hand.
 */
export function renormalizeJob(deps: ImportDeps, jobId: string): number {
  const job = getImport(deps.db, jobId);
  if (!job || isKeyJob(job) || isPairingJob(job)) return 0;
  const ctx = normalizeContextFor(deps, job);
  let created = 0;
  let skipped = 0;
  for (const item of listItems(deps.db, jobId)) {
    if (item.status !== "done" || !item.output) continue;
    const result = upsertDrafts(deps, job, normalizeOutput(item.output, ctx).drafts);
    created += result.created;
    skipped += result.skipped;
  }
  const patch: Parameters<typeof updateImport>[2] = {};
  if (created > 0) patch.draftsCreated = job.draftsCreated + created;
  if (ctx.thirdParty) {
    const flagged = deps.hooks.flagImportThirdParty ? deps.hooks.flagImportThirdParty(jobId) : null;
    const warnings = job.options.warnings ?? [];
    if (flagged === null && skipped > 0 && !warnings.includes(THIRD_PARTY_AFTER_EDIT)) {
      patch.options = { ...job.options, warnings: [...warnings, THIRD_PARTY_AFTER_EDIT] };
    }
  }
  if (Object.keys(patch).length > 0) updateImport(deps.db, jobId, patch, deps.now());
  return created;
}

/** Stores a finished item and, for papers / bank files, upserts its drafts. */
export function ingestItemOutput(
  deps: ImportDeps,
  jobId: string,
  seq: number,
  output: ItemOutput,
  /** `usd`: this call (added to the job); `itemUsd`: the item's total so far (earlier attempts included). */
  call: { usage: CallUsage; usd: number; itemUsd: number; calls?: number; model: string | null; stopReason: string | null },
): void {
  const now = deps.now();
  const before = getImport(deps.db, jobId);
  if (!before) return;
  updateItem(deps.db, jobId, seq, {
    status: "done",
    output,
    usage: call.usage,
    usd: call.itemUsd,
    model: call.model,
    stopReason: call.stopReason,
    finishedAt: now,
    error: output.invalid.length > 0 ? `invalid_questions:${output.invalid.length}` : null,
  });
  const wasThirdParty = jobIsThirdParty(before);
  const pageMarks = mergeMarks(before.pageMarks, output.pageMarks);
  const patternSnapshot = mergeSnapshot(before.patternSnapshot, output);
  const counts = itemCounts(deps.db, jobId);
  updateImport(
    deps.db,
    jobId,
    { pageMarks, patternSnapshot, usage: addUsageTotals(before.usage, call.usage, call.usd, call.calls ?? 1), progressDone: counts.done },
    now,
  );
  const job = getImport(deps.db, jobId);
  if (!job || isKeyJob(job) || isPairingJob(job)) return;

  if (!wasThirdParty && jobIsThirdParty(job)) {
    // Drafts created before the mark was seen need the flag too: re-upsert every finished item.
    renormalizeJob(deps, jobId);
    return;
  }
  const { drafts } = normalizeOutput(output, normalizeContextFor(deps, job));
  const { created } = upsertDrafts(deps, job, drafts);
  if (created > 0) updateImport(deps.db, jobId, { draftsCreated: job.draftsCreated + created }, deps.now());
}

/** Records the cost of a call that produced nothing usable (refusal, cut off, unparseable). */
export function recordWastedCall(deps: ImportDeps, jobId: string, call: { usage: CallUsage; usd: number; calls?: number }): void {
  const job = getImport(deps.db, jobId);
  if (!job) return;
  updateImport(deps.db, jobId, { usage: addUsageTotals(job.usage, call.usage, call.usd, call.calls ?? 1) }, deps.now());
}

/**
 * Fields where a key's printed headers contradict the key job's details or the papers it is for.
 * Booklets: only against the job's own booklet (rows carry theirs and are matched per row), and
 * not when the header lists several booklet codes (one NEET key covers every booklet).
 */
export function keyHeaderMismatches(headers: readonly (PrintedHeader | null)[], meta: QbImportMeta, targetMetas: readonly QbImportMeta[]): string[] {
  const fields = new Set<string>();
  for (const header of headers) {
    if (!header) continue;
    const severalBooklets = /[,;/&]|\band\b/i.test(header.booklet ?? "");
    for (const field of headerMismatches(header, meta)) if (field !== "booklet" || !severalBooklets) fields.add(field);
    for (const target of targetMetas) for (const field of headerMismatches(header, target)) if (field !== "booklet") fields.add(field);
  }
  return [...fields];
}

/**
 * When no item is pending or in flight: applies the key or the Hindi pairing, then marks the job
 * `done` (some items may have failed: shown with "Retry failed") or `failed` (none finished).
 */
export function finalizeJob(deps: ImportDeps, jobId: string, actorId: string | null): void {
  const job = getImport(deps.db, jobId);
  if (!job || (job.status !== "running" && job.status !== "waiting_batch")) return;
  const counts = itemCounts(deps.db, jobId);
  if (counts.pending + counts.submitted + counts.running > 0) return;
  const now = deps.now();
  const options = { ...job.options };
  let refused: string | null = null;

  if (counts.done > 0 && isKeyJob(job)) {
    const done = listItems(deps.db, jobId).filter((item) => item.status === "done" && item.output);
    const targetIds = keyTargetImportIds(deps, job);
    const rows = done.flatMap((item) => item.output?.keyRows ?? []);
    const questions = deps.hooks.listImportQuestions(targetIds);
    const mismatched = keyHeaderMismatches(
      done.map((item) => item.output?.header ?? null),
      job.meta,
      targetIds.flatMap((id) => getImport(deps.db, id)?.meta ?? []),
    );
    // Matching by NTA question ID is safe whatever the header says (one NTA key document covers
    // every shift of a session; other shifts' IDs simply match nothing). A key matched by NUMBER
    // whose printed header names another exam, year, date, shift, paper or booklet is not applied
    // at all: a wrong-shift key would otherwise be stored as the official answer.
    const byIdOnly = rows.length > 0 && rows.every((row) => !!row.questionRef) && questions.some((question) => !!question.questionRef);
    if (mismatched.length > 0 && !byIdOnly) {
      refused = `key_header_mismatch:${mismatched.join(",")}`;
      options.apply = null;
    } else {
      const { matches, summary } = matchKeyRows({
        keyImportId: job.id,
        keyStage: keyStageOf(job.meta),
        booklet: job.meta.booklet ?? null,
        rows: rows.map((row, index) => ({ ...row, line: index + 1 })),
        questions,
      });
      deps.hooks.applyAnswerKey(matches);
      options.apply = { ...summary, unmatched: summary.unmatched.slice(0, 200) };
    }
  }
  // Paired Hindi is stored as official Hindi: official papers only (metaProblem refuses others).
  if (counts.done > 0 && isPairingJob(job) && job.meta.pairsWith && job.meta.sourceKind === "official") {
    const questions = listItems(deps.db, jobId).flatMap((item) => (item.status === "done" && item.output ? item.output.questions : []));
    const { pairs, summary } = pairHindi({
      hindiImportId: job.id,
      questions,
      targets: deps.hooks.listImportQuestions([job.meta.pairsWith]),
      normaliseDollarMath: deps.text.normaliseDollarMath,
    });
    deps.hooks.applyHindiPairing(pairs);
    options.apply = { ...summary, unmatched: summary.unmatched.slice(0, 200) };
  }
  const failed = counts.failed + counts.refused;
  const status = counts.done > 0 && !refused ? "done" : "failed";
  updateImport(
    deps.db,
    jobId,
    {
      status,
      options,
      progressDone: counts.done,
      error: refused ?? (failed > 0 ? `items_failed:${failed}` : null),
      pauseReason: null,
    },
    now,
    ["running", "waiting_batch"],
  );
  deps.audit({
    actorId,
    action: IMPORT_AUDIT.done,
    target: jobId,
    details: { kind: job.kind, status, done: counts.done, failed, usd: Math.round(job.usage.usd * 100) / 100, ...(refused ? { refused } : {}) },
  });
}
