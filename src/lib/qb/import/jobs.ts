import "server-only";

import { createHash } from "node:crypto";

import type { ImportActionBody } from "@/lib/qb/schemas";
import type { QbExam, QbImportKind, QbImportMeta, QbImportStatus } from "@/lib/qb/types";

import { cancelOpenBatches, pollBatches, reservationPerRequest, submitBatch } from "./batch";
import { errorCode, isAbortError, isRetryableError } from "./client";
import { aiAvailability, MAX_ITEM_ATTEMPTS, SYNC_TIMEOUT_MS, TABULAR_MAX_ROWS } from "./config";
import { decodeUtf8, looksLikeCsv, parseCsv } from "./csv";
import { IMPORT_AUDIT, type ImportDeps } from "./deps";
import { readDocx } from "./docx";
import { estimateImport, istDayStart, pagesPerItem, questionsPerPage } from "./estimate";
import { buildRequest, extractSync, type SyncOutcome } from "./extract";
import { finalizeJob, ingestItemOutput, jobIsThirdParty, keyStageOf, keyTargetImportIds, paperKeyOf, recordWastedCall } from "./ingest";
import { keyRowsFromTable, matchKeyRows } from "./keys";
import { acquireLease, releaseLease, withHeartbeat } from "./lease";
import { inspectPdf, isPdf, planPageItems } from "./pdf";
import { inFlightKey, releaseInFlight, reserveInFlight, spentToday } from "./spend";
import {
  getImport,
  type ImportRecord,
  importsOfKind,
  importsWithSha,
  insertImport,
  insertItems,
  type ItemRecord,
  itemCounts,
  listImports,
  listItems,
  spentSince,
  updateImport,
  updateItem,
  wipeOutputs,
} from "./repo";
import { deleteImportFile, newImportId, pruneOrphanFiles, readImportFile, storeImportFile, type ImportFileExtension } from "./storage";
import { bankRowsToDrafts } from "./template";
import type { ImportChapter, ImportJobView, ImportViewer, TabularReport } from "./types";
import { IMPORT_EXAMS, isAiKind, isKeyKind, isTabularKind } from "./types";
import { checkZip, isZip, readZipText } from "./zipguard";
import { buildContextFor, isKeyJob, type JobSource, openJobSource, planForItem } from "./work";
import { readXlsxRows } from "./xlsx";

/**
 * Import jobs (docs/question-bank-plan.md §B8): upload, estimate, run (sync or batch), pause,
 * cancel, retry, close, tabular "create drafts", pattern-snapshot confirmation, retention.
 *
 * Every async entry point that is not awaited by its caller goes through `startRunner`, whose
 * top-level `.catch` records the error on the job: there is no fire-and-forget promise without one.
 * Only one runner works on a job at a time (lease.ts).
 */

export type ImportFailure = { ok: false; status: number; reason: string; report?: TabularReport };
export type ImportResult<T> = { ok: true; data: T } | ImportFailure;

function fail(status: number, reason: string, report?: TabularReport): ImportFailure {
  return report ? { ok: false, status, reason, report } : { ok: false, status, reason };
}

const MAX_PDF_PAGES = 600;
/**
 * An encrypted PDF cannot be split, so the WHOLE file goes with every request: past 100 pages it
 * exceeds what one request may carry, and the cost multiplies by the request count. Staff are asked
 * for an unencrypted copy instead.
 */
const MAX_ENCRYPTED_PDF_PAGES = 100;
const BUSY_STATES: readonly QbImportStatus[] = ["running", "waiting_batch"];

/** In-flight sync calls of this process, so "cancel" can abort them. */
const controllers = new Map<string, AbortController>();

/** Runner invocations started by this process (each gets its own lease id). */
let runnerSeq = 0;

function log(event: string, reason?: string): void {
  console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event: "qb_import", outcome: event.replace(/[^a-z_]/g, ""), ...(reason ? { reason: reason.replace(/[^A-Za-z0-9_:]/g, "").slice(0, 60) } : {}) }));
}

// ---------------------------------------------------------------------------------------------
// Views

export function jobView(deps: Pick<ImportDeps, "db">, job: ImportRecord): ImportJobView {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    mode: job.mode,
    fileName: job.fileName,
    fileSize: job.fileSize,
    fileAvailable: job.tempPath !== null && job.fileDeletedAt === null,
    pages: job.pages,
    rows: job.rows,
    encrypted: job.encrypted,
    meta: job.meta,
    model: job.model,
    effort: job.effort,
    estimate: job.estimate,
    usage: job.usage,
    progress: { done: job.progressDone, total: job.progressTotal },
    items: itemCounts(deps.db, job.id),
    draftsCreated: job.draftsCreated,
    pageMarks: job.pageMarks,
    thirdParty: jobIsThirdParty(job),
    patternSnapshot: job.patternSnapshot,
    warnings: job.options.warnings ?? [],
    report: job.options.report ?? null,
    apply: job.options.apply ?? null,
    error: job.error,
    pauseReason: job.pauseReason,
    licence: { by: job.licenceAckBy, at: job.licenceAckAt, note: job.licenceNote },
    createdBy: job.createdBy,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export function getJobView(deps: ImportDeps, id: string): ImportJobView | null {
  const job = getImport(deps.db, id);
  return job ? jobView(deps, job) : null;
}

export function listJobViews(deps: ImportDeps, limit = 50): ImportJobView[] {
  return listImports(deps.db, limit).map((job) => jobView(deps, job));
}

export function confirmedExams(deps: Pick<ImportDeps, "hooks">): QbExam[] {
  return IMPORT_EXAMS.filter((exam) => deps.hooks.taxonomyConfirmed(exam));
}

/** Header data of the import pages: is AI import on, today's spend, limits. */
export function importSummary(deps: ImportDeps) {
  const now = deps.now();
  return {
    ai: aiAvailability(deps.config, deps.hooks.importSettingEnabled()),
    spentTodayUsd: Math.round(spentSince(deps.db, istDayStart(now)) * 100) / 100,
    dailyCapUsd: deps.config.dailyUsd,
    maxFileBytes: deps.config.maxFileBytes,
    batchMinPages: deps.config.batchMinPages,
    model: deps.config.model,
    confirmedExams: confirmedExams(deps),
    retentionDays: deps.config.retentionDays,
  };
}

// ---------------------------------------------------------------------------------------------
// Upload

const EXTENSIONS: Record<QbImportKind, ImportFileExtension> = {
  pdf_paper: "pdf",
  pdf_key: "pdf",
  pdf_bank: "pdf",
  docx_bank: "docx",
  xlsx_bank: "xlsx",
  csv_bank: "csv",
  csv_key: "csv",
};

/** Display name only: no path, no control characters, at most 120 characters. */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>"]/g, "").trim().slice(0, 120);
  return cleaned || "upload";
}

/** Magic bytes per kind: `%PDF-`, a zip header (DOCX / XLSX), UTF-8 text (CSV). */
export function checkMagic(kind: QbImportKind, bytes: Uint8Array): boolean {
  switch (EXTENSIONS[kind]) {
    case "pdf":
      return isPdf(bytes);
    case "docx":
    case "xlsx":
      return isZip(bytes);
    case "csv":
      return looksLikeCsv(bytes);
  }
}

/** Metadata rules per kind (beyond the zod shape). Returns a reason code, or null when acceptable. */
export function metaProblem(kind: QbImportKind, meta: QbImportMeta, deps: Pick<ImportDeps, "db">): string | null {
  if (isAiKind(kind) && !meta.exam) return "exam_required";
  if (kind === "pdf_paper") {
    if (meta.sourceKind === "official") {
      if (!meta.exam || meta.exam === "BOH") return "official_exam_invalid";
      if (meta.year === undefined) return "year_required";
      if (meta.exam === "JEE_MAIN" && (!meta.shift || !meta.date)) return "shift_and_date_required";
      if (meta.exam === "NEET" && !meta.booklet) return "booklet_required";
      if (meta.exam === "JEE_ADV" && !meta.paper) return "paper_required";
    }
    if (meta.language === "hi") {
      // Paired Hindi is stored as OFFICIAL Hindi (QB-CORE-B `applyHindiPairing`): official papers
      // only. Aspire's Hindi comes in an English-and-Hindi file, where it is labelled staff Hindi.
      if (meta.sourceKind !== "official") return "hindi_pair_official_only";
      if (!meta.pairsWith) return "pairs_with_required";
      const english = getImport(deps.db, meta.pairsWith);
      if (!english || english.kind !== "pdf_paper" || english.status === "cancelled" || english.meta.language === "hi") return "pairs_with_invalid";
      if (paperKeyOf(english.meta) !== paperKeyOf(meta)) return "pairs_with_other_paper";
    } else if (meta.pairsWith) {
      return "pairs_with_only_hindi";
    }
    if (meta.keyFor || meta.keyStage) return "key_fields_on_paper";
  }
  if (kind === "pdf_bank" || kind === "docx_bank" || kind === "xlsx_bank" || kind === "csv_bank") {
    if (meta.sourceKind !== "aspire") return "bank_must_be_aspire";
    if (meta.language === "hi") return "bank_language_invalid";
    if (meta.keyFor || meta.keyStage || meta.pairsWith) return "key_fields_on_bank";
  }
  if (isKeyKind(kind)) {
    if (meta.sourceKind === "official" && !meta.keyStage) return "key_stage_required";
    // Provisional / final are NTA / IIT stages; an Aspire key always applies as Aspire's own answer.
    if (meta.sourceKind !== "official" && meta.keyStage) return "key_stage_official_only";
    if (meta.pairsWith) return "pairs_with_only_hindi";
    const ownPaper = paperKeyOf(meta);
    for (const id of meta.keyFor ?? []) {
      const paper = getImport(deps.db, id);
      if (!paper || (paper.kind !== "pdf_paper" && paper.kind !== "pdf_bank" && paper.kind !== "docx_bank" && paper.kind !== "csv_bank" && paper.kind !== "xlsx_bank")) {
        return "key_for_invalid";
      }
      // An official key only for official papers, an Aspire key only for Aspire files: otherwise an
      // Aspire answer would be stored as the official key (or an official key on Aspire questions).
      if (paper.meta.sourceKind !== meta.sourceKind) return "key_source_mismatch";
      const targetPaper = paperKeyOf(paper.meta);
      if (ownPaper && targetPaper && ownPaper !== targetPaper) return "key_for_other_paper";
    }
    if ((meta.keyFor ?? []).length === 0 && !ownPaper) return "key_for_required";
  }
  return null;
}

/**
 * Official paper identity: a second NEET booklet of the same exam sitting is refused (its key may
 * still be imported for that booklet), and the same paper cannot be imported twice while open.
 */
export function paperIdentityProblem(deps: Pick<ImportDeps, "db">, kind: QbImportKind, meta: QbImportMeta): string | null {
  if (kind !== "pdf_paper" || meta.sourceKind !== "official" || meta.language === "hi") return null;
  const key = paperKeyOf(meta);
  if (!key) return null;
  const others = importsOfKind(deps.db, ["pdf_paper"]).filter(
    (other) => other.status !== "cancelled" && other.status !== "failed" && other.meta.language !== "hi" && paperKeyOf(other.meta) === key,
  );
  if (others.length === 0) return null;
  if (meta.exam === "NEET" && others.some((other) => (other.meta.booklet ?? "") !== (meta.booklet ?? ""))) return "booklet_duplicate";
  return "paper_duplicate";
}

export interface UploadInput {
  kind: QbImportKind;
  meta: QbImportMeta;
  fileName: string;
  bytes: Uint8Array;
  licenceAck: boolean;
  licenceNote: string | null;
  options?: { mode?: "sync" | "batch" };
}

interface Inspection {
  pages: number | null;
  rows: number | null;
  encrypted: boolean;
  textChars: number | null;
  items: { seq: number; pageFrom: number | null; pageTo: number | null }[];
  warnings: string[];
  report: TabularReport | null;
}

function chaptersOfConfirmed(deps: Pick<ImportDeps, "hooks">, exams: readonly QbExam[]): ImportChapter[] {
  const byId = new Map<string, ImportChapter>();
  for (const exam of exams) for (const chapter of deps.hooks.chapterListFor(exam)) byId.set(chapter.id, chapter);
  return [...byId.values()];
}

async function tabularTable(kind: QbImportKind, bytes: Uint8Array): Promise<{ ok: true; table: string[][] } | ImportFailure> {
  if (kind === "xlsx_bank") {
    const read = await readXlsxRows(bytes);
    return read.ok ? { ok: true, table: read.rows } : fail(read.reason.startsWith("zip") ? 413 : 422, read.reason);
  }
  const text = decodeUtf8(bytes);
  if (text === null) return fail(415, "csv_encoding");
  const parsed = parseCsv(text, TABULAR_MAX_ROWS + 1);
  return parsed.ok ? { ok: true, table: parsed.rows } : fail(422, parsed.reason);
}

/** The tabular dry run (also used again by "create drafts", with the taxonomy as it is then). */
export function tabularDryRun(deps: ImportDeps, job: Pick<ImportRecord, "id" | "kind" | "meta">, table: string[][]) {
  if (job.kind === "csv_key") {
    const { rows, errors } = keyRowsFromTable(table);
    const report: TabularReport = {
      kind: "key",
      rows: Math.max(0, table.length - 1),
      valid: rows.length,
      errors: errors.slice(0, 200),
      warnings: [],
      bySubject: {},
      byExam: {},
      flags: {},
      moreErrors: Math.max(0, errors.length - 200),
    };
    return { report, keyRows: rows, drafts: [] };
  }
  const exams = confirmedExams(deps);
  const { drafts, report } = bankRowsToDrafts(table, {
    importId: job.id,
    chapters: chaptersOfConfirmed(deps, exams),
    confirmedExams: new Set(exams),
    aspireRef: job.meta.aspireRef ?? null,
    normaliseDollarMath: deps.text.normaliseDollarMath,
    mathIssues: deps.text.mathIssues,
  });
  return { report, keyRows: [], drafts };
}

async function inspectUpload(deps: ImportDeps, id: string, input: UploadInput): Promise<{ ok: true; data: Inspection } | ImportFailure> {
  const { kind, bytes } = input;
  if (EXTENSIONS[kind] === "pdf") {
    const pdf = await inspectPdf(bytes);
    if (!pdf.ok) return fail(422, pdf.reason);
    if (pdf.pages > MAX_PDF_PAGES) return fail(413, "pdf_too_many_pages");
    if (pdf.encrypted && pdf.pages > MAX_ENCRYPTED_PDF_PAGES) return fail(413, "pdf_encrypted_too_many_pages");
    const perItem = kind === "pdf_key" ? 6 : pagesPerItem(deps.config.maxTokens, questionsPerPage(input.meta.exam));
    const plans = planPageItems(pdf.pages, perItem);
    return {
      ok: true,
      data: {
        pages: pdf.pages,
        rows: null,
        encrypted: pdf.encrypted,
        textChars: null,
        items: plans.map((plan, seq) => ({ seq, pageFrom: plan.pageFrom, pageTo: plan.pageTo })),
        warnings: pdf.encrypted ? ["pdf_encrypted"] : [],
        report: null,
      },
    };
  }
  if (kind === "docx_bank") {
    const zip = checkZip(bytes);
    if (!zip.ok) return fail(413, zip.reason);
    if (readZipText(bytes, zip.entries, "word/document.xml") === null) return fail(415, "docx_not_word");
    const docx = await readDocx(bytes);
    if (!docx.ok) return fail(422, docx.reason);
    return {
      ok: true,
      data: {
        pages: null,
        rows: null,
        encrypted: false,
        textChars: docx.text.length,
        items: docx.chunks.map((_, index) => ({ seq: index, pageFrom: index + 1, pageTo: index + 1 })),
        warnings: [...(docx.equationWarning ? ["docx_equations"] : []), ...(docx.images > 0 ? ["docx_images"] : [])],
        report: null,
      },
    };
  }
  const table = await tabularTable(kind, bytes);
  if (!table.ok) return table;
  const { report } = tabularDryRun(deps, { id, kind, meta: input.meta }, table.table);
  return { ok: true, data: { pages: null, rows: report.rows, encrypted: false, textChars: null, items: [], warnings: [], report } };
}

/**
 * Validates and stores an upload. Order: licence → metadata → taxonomy gate (409) → size (413) →
 * magic bytes (415) → duplicate file / paper / booklet (409) → file checks → storage quota → row.
 */
export async function createImport(deps: ImportDeps, viewer: ImportViewer, input: UploadInput): Promise<ImportResult<ImportJobView>> {
  if (!input.licenceAck) return fail(422, "licence_required");
  const problem = metaProblem(input.kind, input.meta, deps);
  if (problem) return fail(422, problem);
  if (input.meta.exam && !deps.hooks.taxonomyConfirmed(input.meta.exam)) return fail(409, "taxonomy_unconfirmed");
  if (input.bytes.byteLength === 0) return fail(422, "file_empty");
  if (input.bytes.byteLength > deps.config.maxFileBytes) return fail(413, "file_too_large");
  if (!checkMagic(input.kind, input.bytes)) return fail(415, "file_type_mismatch");

  const sha = createHash("sha256").update(input.bytes).digest("hex");
  if (importsWithSha(deps.db, sha).some((other) => other.status !== "closed" && other.status !== "cancelled")) return fail(409, "duplicate_file");
  const identity = paperIdentityProblem(deps, input.kind, input.meta);
  if (identity) return fail(409, identity);

  const id = newImportId();
  const inspected = await inspectUpload(deps, id, input);
  if (!inspected.ok) return inspected;
  const info = inspected.data;

  pruneImports(deps, { force: false });
  const stored = storeImportFile({ dir: deps.config.dir, quotaBytes: deps.config.storageBytes }, id, EXTENSIONS[input.kind], input.bytes);
  if (!stored.ok) return fail(409, stored.reason);

  const now = deps.now();
  const ai = isAiKind(input.kind);
  const defaultMode = input.kind === "docx_bank" || (info.pages ?? 0) > deps.config.batchMinPages ? "batch" : "sync";
  // An encrypted PDF is read in sync mode only: consecutive requests reuse the cached whole file,
  // and a batch would hold one full copy of the file per request in memory.
  const mode = !ai ? "none" : info.encrypted ? "sync" : input.options?.mode ?? defaultMode;
  const estimate = estimateImport({
    kind: input.kind,
    exam: input.meta.exam,
    pages: info.pages,
    rows: info.rows,
    textChars: info.textChars,
    encrypted: info.encrypted,
    mode: mode === "none" ? "sync" : mode,
    model: deps.config.model,
    price: deps.config.price,
    maxTokens: deps.config.maxTokens,
    dailyCapUsd: deps.config.dailyUsd,
    spentTodayUsd: spentSince(deps.db, istDayStart(now)),
  });
  insertImport(deps.db, {
    id,
    kind: input.kind,
    status: "ready",
    mode,
    fileName: cleanFileName(input.fileName),
    fileSize: input.bytes.byteLength,
    fileSha256: sha,
    tempPath: stored.fileName,
    pages: info.pages,
    rows: info.rows,
    encrypted: info.encrypted,
    meta: input.meta,
    options: { ...(info.warnings.length ? { warnings: info.warnings } : {}), ...(info.report ? { report: info.report } : {}) },
    model: ai ? deps.config.model : null,
    effort: ai ? deps.config.effort : null,
    estimate,
    progressTotal: ai ? info.items.length : info.rows ?? 0,
    licenceAckBy: viewer.userId,
    licenceAckAt: now,
    licenceNote: input.licenceNote,
    createdBy: viewer.userId,
    createdAt: now,
    updatedAt: now,
  });
  if (ai) insertItems(deps.db, id, info.items);
  deps.audit({
    actorId: viewer.userId,
    action: IMPORT_AUDIT.upload,
    target: id,
    details: {
      kind: input.kind,
      exam: input.meta.exam ?? null,
      sourceKind: input.meta.sourceKind,
      sizeKb: Math.round(input.bytes.byteLength / 1024),
      pages: info.pages,
      rows: info.rows,
      licenceAck: true,
    },
  });
  const job = getImport(deps.db, id);
  return job ? { ok: true, data: jobView(deps, job) } : fail(500, "insert_failed");
}

// ---------------------------------------------------------------------------------------------
// Runner

/** Records an unexpected runner error on the job (the top-level `.catch` of every runner). */
export function recordJobError(deps: ImportDeps, jobId: string, error: unknown, runnerId: string = deps.runnerId): void {
  try {
    const code = errorCode(error);
    log("runner_error", code);
    for (const item of listItems(deps.db, jobId)) if (item.status === "running") updateItem(deps.db, jobId, item.seq, { status: "pending" });
    updateImport(deps.db, jobId, { status: "failed", error: code }, deps.now(), BUSY_STATES);
    releaseLease(deps.db, jobId, runnerId);
  } catch {
    // Never throw from the last-resort handler.
  }
}

/**
 * Starts (or resumes) the job's runner. The returned promise never rejects. Each invocation has
 * its own lease id, so a second start while a runner still holds the lease (a "Resume" clicked
 * while the paused runner's call is in flight) does nothing: that runner sees the job running again
 * after its call and carries on, and a later tick picks the job up if it had already stopped.
 */
export function startRunner(deps: ImportDeps, jobId: string, actorId: string | null): Promise<void> {
  runnerSeq += 1;
  const runnerId = `${deps.runnerId}:${runnerSeq}`;
  return runJob(deps, jobId, actorId, runnerId).catch((error: unknown) => recordJobError(deps, jobId, error, runnerId));
}

/** Lazy tick (import API calls, the job page's poll): resumes batch polling or an orphaned sync run. */
export function tickImport(deps: ImportDeps, jobId: string): Promise<void> | null {
  const job = getImport(deps.db, jobId);
  if (!job) return null;
  const now = deps.now();
  const leaseFree = job.runnerId === null || (job.leaseUntil ?? 0) < now;
  if (job.status === "waiting_batch" && leaseFree) return startRunner(deps, jobId, null);
  if (job.status === "running" && leaseFree) return startRunner(deps, jobId, null);
  return null;
}

async function runJob(deps: ImportDeps, jobId: string, actorId: string | null, runnerId: string): Promise<void> {
  if (!acquireLease(deps.db, jobId, runnerId, deps.now())) return;
  const controller = new AbortController();
  controllers.set(jobId, controller);
  let lost = false;
  try {
    // Items left `running` by a runner that died (its lease expired) are pending again.
    for (const item of listItems(deps.db, jobId)) if (item.status === "running") updateItem(deps.db, jobId, item.seq, { status: "pending" });
    await withHeartbeat(
      { db: deps.db, importId: jobId, runnerId, now: deps.now, timers: deps.timers, onLost: () => {
          lost = true;
        } },
      async () => {
        let source: JobSource | null = null;
        for (let guard = 0; guard < 10_000; guard += 1) {
          if (lost || controller.signal.aborted) return;
          const job = getImport(deps.db, jobId);
          if (!job) return;
          if (job.status === "waiting_batch") {
            if ((await pollBatches(deps, jobId)) === "waiting") return;
            continue;
          }
          if (job.status !== "running") return;
          const pending = listItems(deps.db, jobId).filter((item) => item.status === "pending");
          if (pending.length === 0) {
            finalizeJob(deps, jobId, actorId);
            return;
          }
          source ??= await openJobSource(deps, job);
          if (job.mode === "batch" && !job.encrypted) {
            const fresh = pending.filter((item) => item.attempts === 0);
            if (fresh.length > 0) {
              await submitBatch(deps, jobId, fresh, source);
              return; // waiting_batch (or paused by the cap): polled lazily from here on
            }
          }
          if ((await runSyncItem(deps, job, pending[0], source, controller.signal)) === "stop") return;
        }
      },
    );
  } finally {
    if (controllers.get(jobId) === controller) controllers.delete(jobId);
    releaseLease(deps.db, jobId, runnerId);
  }
}

async function runSyncItem(deps: ImportDeps, job: ImportRecord, item: ItemRecord, source: JobSource, signal: AbortSignal): Promise<"next" | "stop"> {
  const now = deps.now();
  const availability = aiAvailability(deps.config, deps.hooks.importSettingEnabled());
  if (!availability.enabled) {
    updateImport(deps.db, job.id, { status: "paused", pauseReason: availability.reason }, now, ["running"]);
    return "stop";
  }
  const client = deps.client();
  if (!client) throw new Error("no_api_key");
  // Each call reserves its upper-bound cost while in flight (spend.ts), and every extra call that
  // `max_tokens` halving makes is checked again with what the item has cost so far.
  const key = inFlightKey(job.id, item.seq);
  const reserve = reservationPerRequest(job, "sync");
  const capAllows = (spentSoFar: number) => spentToday(deps.db, deps.now(), key) + spentSoFar + reserve <= deps.config.dailyUsd;
  const pauseAtCap = () => {
    const spent = spentToday(deps.db, deps.now(), key);
    updateImport(deps.db, job.id, { status: "paused", pauseReason: "daily_cap" }, deps.now(), ["running"]);
    deps.audit({ actorId: null, action: IMPORT_AUDIT.dailyCap, target: job.id, details: { spentUsd: Math.round(spent * 100) / 100, capUsd: deps.config.dailyUsd } });
  };
  if (!capAllows(0)) {
    pauseAtCap();
    return "stop";
  }
  const attempts = item.attempts + 1;
  updateItem(deps.db, job.id, item.seq, { status: "running", attempts, error: null });
  const ctx = buildContextFor(deps, job, source);
  let outcome: SyncOutcome;
  reserveInFlight(key, reserve);
  try {
    outcome = await extractSync(
      {
        client,
        build: (plan) => buildRequest(ctx, plan),
        price: deps.config.price,
        totalPages: job.pages,
        beforeSplit: (spentSoFar) => {
          if (!capAllows(spentSoFar)) return false;
          reserveInFlight(key, spentSoFar + reserve);
          return true;
        },
      },
      planForItem(job, item, source),
      { signal, timeoutMs: SYNC_TIMEOUT_MS },
    );
  } catch (error) {
    if (isAbortError(error)) {
      // Aborted by "cancel": the item stays failed; anything else (shutdown) retries it later.
      const cancelled = getImport(deps.db, job.id)?.status === "cancelled";
      updateItem(deps.db, job.id, item.seq, cancelled ? { status: "failed", error: "cancelled" } : { status: "pending", attempts: item.attempts });
      return "stop";
    }
    const code = errorCode(error);
    const retry = isRetryableError(error) && attempts < MAX_ITEM_ATTEMPTS;
    updateItem(deps.db, job.id, item.seq, { status: retry ? "pending" : "failed", error: code });
    log("item_error", code);
    return "next";
  } finally {
    // The item's row gets its real cost below (in this same synchronous run), so the in-flight
    // reservation can go now.
    releaseInFlight(key);
  }
  const finished = deps.now();
  const itemUsd = item.usd + outcome.usd;
  switch (outcome.kind) {
    case "capped":
      // Halving needed another call and the cap does not allow it: the item waits for "Resume".
      recordWastedCall(deps, job.id, outcome);
      updateItem(deps.db, job.id, item.seq, { status: "pending", attempts: item.attempts, usage: outcome.usage, usd: itemUsd, finishedAt: finished, model: outcome.model, error: "daily_cap" });
      pauseAtCap();
      return "stop";
    case "done":
      ingestItemOutput(deps, job.id, item.seq, outcome.output, {
        usage: outcome.usage,
        usd: outcome.usd,
        itemUsd,
        calls: outcome.calls,
        model: outcome.model,
        stopReason: outcome.stopReason,
      });
      break;
    case "refused":
      recordWastedCall(deps, job.id, outcome);
      updateItem(deps.db, job.id, item.seq, { status: "refused", usage: outcome.usage, usd: itemUsd, finishedAt: finished, stopReason: "refusal", model: outcome.model, error: "refusal" });
      break;
    case "too_long":
      recordWastedCall(deps, job.id, outcome);
      updateItem(deps.db, job.id, item.seq, { status: "failed", usage: outcome.usage, usd: itemUsd, finishedAt: finished, stopReason: "max_tokens", model: outcome.model, error: "max_tokens" });
      break;
    case "unparseable":
      recordWastedCall(deps, job.id, outcome);
      updateItem(deps.db, job.id, item.seq, {
        status: attempts < MAX_ITEM_ATTEMPTS ? "pending" : "failed",
        usage: outcome.usage,
        usd: itemUsd,
        finishedAt: finished,
        model: outcome.model,
        error: outcome.reason,
      });
      break;
  }
  return "next";
}

// ---------------------------------------------------------------------------------------------
// Actions

function audit(deps: ImportDeps, viewer: ImportViewer, action: string, job: ImportRecord, details: Record<string, string | number | boolean | null> = {}): void {
  deps.audit({ actorId: viewer.userId, action, target: job.id, details: { kind: job.kind, ...details } });
}

/** Checks shared by "run" and "retry failed". */
function runBlocker(deps: ImportDeps, job: ImportRecord): ImportFailure | null {
  if (!isAiKind(job.kind)) return fail(409, "not_an_ai_import");
  const availability = aiAvailability(deps.config, deps.hooks.importSettingEnabled());
  if (!availability.enabled) return fail(409, `ai_disabled:${availability.reason}`);
  if (job.meta.exam && !deps.hooks.taxonomyConfirmed(job.meta.exam)) return fail(409, "taxonomy_unconfirmed");
  if (job.tempPath === null || job.fileDeletedAt !== null) return fail(409, "file_missing");
  if (spentToday(deps.db, deps.now()) >= deps.config.dailyUsd) return fail(409, "daily_cap");
  return null;
}

/**
 * Runs a job action for `viewer` (capabilities are checked by the route). Returns the job view; a
 * runner, when one is started, is in `runner` (tests await it; routes do not).
 */
export async function importAction(
  deps: ImportDeps,
  viewer: ImportViewer,
  id: string,
  body: ImportActionBody,
): Promise<ImportResult<{ job: ImportJobView; runner: Promise<void> | null }>> {
  const job = getImport(deps.db, id);
  if (!job) return fail(404, "not_found");
  const now = deps.now();
  let runner: Promise<void> | null = null;

  switch (body.action) {
    case "run": {
      if (!["ready", "paused", "failed"].includes(job.status)) return fail(409, `status_${job.status}`);
      // AI-drafted solutions and machine Hindi are not built yet (docs: phase 2 of this package).
      if (body.options?.draftSolutions || body.options?.machineHindi) return fail(422, "extras_not_available");
      const blocker = runBlocker(deps, job);
      if (blocker) return blocker;
      // Encrypted PDFs are read in sync mode only (see createImport).
      const mode = job.encrypted ? "sync" : body.options?.mode ?? (job.mode === "none" ? "sync" : job.mode);
      const openBatch = job.batchIds.some((ref) => ref.endedAt === null);
      const next: QbImportStatus = openBatch ? "waiting_batch" : "running";
      if (!updateImport(deps.db, id, { status: next, mode, pauseReason: null, error: null }, now, ["ready", "paused", "failed"])) return fail(409, "status_changed");
      audit(deps, viewer, IMPORT_AUDIT.run, job, { mode, usdLow: job.estimate?.usd[0] ?? null, usdHigh: job.estimate?.usd[1] ?? null });
      runner = startRunner(deps, id, viewer.userId);
      break;
    }
    case "pause": {
      if (!updateImport(deps.db, id, { status: "paused", pauseReason: "staff" }, now, BUSY_STATES)) return fail(409, `status_${job.status}`);
      audit(deps, viewer, IMPORT_AUDIT.pause, job);
      break;
    }
    case "cancel": {
      if (!updateImport(deps.db, id, { status: "cancelled", pauseReason: null }, now, ["uploaded", "ready", "running", "waiting_batch", "paused", "failed"])) {
        return fail(409, `status_${job.status}`);
      }
      controllers.get(id)?.abort();
      for (const item of listItems(deps.db, id)) {
        if (item.status === "pending" || item.status === "running") updateItem(deps.db, id, item.seq, { status: "failed", error: "cancelled" });
        // A cancelled batch may already have processed (and billed) some requests, and its results
        // are never fetched: each submitted item KEEPS its reservation in today's spend.
        if (item.status === "submitted") updateItem(deps.db, id, item.seq, { status: "failed", error: "cancelled" });
      }
      runner = cancelOpenBatches(deps, id).catch(() => undefined);
      audit(deps, viewer, IMPORT_AUDIT.cancel, job, { usd: Math.round(job.usage.usd * 100) / 100 });
      break;
    }
    case "retry_failed": {
      if (!["done", "failed", "paused"].includes(job.status)) return fail(409, `status_${job.status}`);
      const blocker = runBlocker(deps, job);
      if (blocker) return blocker;
      const retry = listItems(deps.db, id).filter((item) => item.status === "failed" || item.status === "refused");
      if (retry.length === 0) return fail(409, "nothing_to_retry");
      // Retries always run in sync mode (attempts ≥ 1), where refusals get the fallback.
      for (const item of retry) updateItem(deps.db, id, item.seq, { status: "pending", attempts: 1, error: null });
      if (!updateImport(deps.db, id, { status: "running", pauseReason: null, error: null }, now, ["done", "failed", "paused"])) return fail(409, "status_changed");
      audit(deps, viewer, IMPORT_AUDIT.retry, job, { items: retry.length });
      runner = startRunner(deps, id, viewer.userId);
      break;
    }
    case "close": {
      if (BUSY_STATES.includes(job.status)) return fail(409, "job_busy");
      if (job.status === "closed") return fail(409, "status_closed");
      closeJob(deps, job, now, null);
      audit(deps, viewer, IMPORT_AUDIT.close, job, { usd: Math.round(job.usage.usd * 100) / 100 });
      break;
    }
    case "create_drafts": {
      if (!isTabularKind(job.kind)) return fail(409, "not_a_tabular_import");
      if (!["ready", "done"].includes(job.status)) return fail(409, `status_${job.status}`);
      const bytes = readImportFile(deps.config.dir, job.tempPath);
      if (!bytes) return fail(409, "file_missing");
      const table = await tabularTable(job.kind, bytes);
      if (!table.ok) return table;
      const { report, keyRows, drafts } = tabularDryRun(deps, job, table.table);
      if (report.valid === 0) {
        updateImport(deps.db, id, { options: { ...job.options, report } }, now);
        return fail(422, "no_valid_rows", report);
      }
      const options = { ...job.options, report };
      let created = 0;
      if (isKeyJob(job)) {
        const { matches, summary } = matchKeyRows({
          keyImportId: id,
          keyStage: keyStageOf(job.meta),
          booklet: job.meta.booklet ?? null,
          rows: keyRows,
          questions: deps.hooks.listImportQuestions(keyTargetImportIds(deps, job)),
        });
        deps.hooks.applyAnswerKey(matches);
        options.apply = { ...summary, unmatched: summary.unmatched.slice(0, 200) };
      } else {
        created = deps.hooks.upsertImportDrafts(id, drafts).created;
      }
      updateImport(deps.db, id, { status: "done", options, draftsCreated: job.draftsCreated + created, progressDone: report.valid }, now, ["ready", "done"]);
      audit(deps, viewer, IMPORT_AUDIT.createDrafts, job, { valid: report.valid, errors: report.errors.length + report.moreErrors, created });
      break;
    }
    case "confirm_snapshot": {
      if (isKeyJob(job) || !isAiKind(job.kind)) return fail(409, "no_snapshot");
      if (!job.patternSnapshot || job.patternSnapshot.sections.length === 0) return fail(409, "no_snapshot");
      if (job.patternSnapshot.confirmedAt !== null) return fail(409, "snapshot_confirmed");
      updateImport(deps.db, id, { patternSnapshot: { ...job.patternSnapshot, confirmedBy: viewer.userId, confirmedAt: now } }, now);
      audit(deps, viewer, IMPORT_AUDIT.snapshotConfirm, job, { sections: job.patternSnapshot.sections.length });
      break;
    }
  }
  const fresh = getImport(deps.db, id);
  return fresh ? { ok: true, data: { job: jobView(deps, fresh), runner } } : fail(404, "not_found");
}

/** Deletes the file, wipes every extracted output (usage totals stay), and closes the job. */
function closeJob(deps: ImportDeps, job: ImportRecord, now: number, reason: string | null): void {
  deleteImportFile(deps.config.dir, job.tempPath);
  wipeOutputs(deps.db, job.id);
  updateImport(deps.db, job.id, { status: "closed", tempPath: null, fileDeletedAt: now, ...(reason ? { error: reason } : {}) }, now);
}

// ---------------------------------------------------------------------------------------------
// Retention

let lastPrune = 0;

/**
 * Retention (§B8.9), run on import API calls (at most once a minute unless forced): files of
 * closed jobs are deleted; jobs untouched for `QB_IMPORT_RETENTION_DAYS` are closed (file deleted,
 * outputs wiped; a job whose runner still holds its lease is left alone); files no job references
 * are removed.
 */
export function pruneImports(deps: ImportDeps, options: { force: boolean } = { force: false }): { closed: number; filesDeleted: number; orphans: number } {
  const now = deps.now();
  if (!options.force && now - lastPrune < 60_000) return { closed: 0, filesDeleted: 0, orphans: 0 };
  lastPrune = now;
  const cutoff = now - deps.config.retentionDays * 86_400_000;
  let closed = 0;
  let filesDeleted = 0;
  const rows = deps.db
    .prepare("SELECT id FROM qb_imports WHERE (status = 'closed' AND temp_path IS NOT NULL) OR (status <> 'closed' AND updated_at < ?)")
    .all(cutoff) as { id: string }[];
  for (const { id } of rows) {
    const job = getImport(deps.db, id);
    if (!job) continue;
    if (job.status === "closed") {
      if (deleteImportFile(deps.config.dir, job.tempPath)) filesDeleted += 1;
      updateImport(deps.db, id, { tempPath: null, fileDeletedAt: job.fileDeletedAt ?? now }, now);
      continue;
    }
    if (job.runnerId !== null && (job.leaseUntil ?? 0) >= now) continue;
    closeJob(deps, job, now, "retention");
    closed += 1;
  }
  const referenced = new Set(
    (deps.db.prepare("SELECT temp_path FROM qb_imports WHERE temp_path IS NOT NULL").all() as { temp_path: string }[]).map((row) => row.temp_path),
  );
  const orphans = pruneOrphanFiles(deps.config.dir, referenced, now);
  return { closed, filesDeleted, orphans };
}

