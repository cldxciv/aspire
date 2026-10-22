import "server-only";

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import { centres } from "@/content/centres";

import { CRM_AUDIT, crmAudit } from "../access";
import {
  CAPTURE_ANSWERS_MAX,
  CSV_LEAD_SOURCE,
  IMPORT_BATCH_KINDS,
  IMPORT_CONSENT_BASES,
  IMPORT_DAMAGE_KINDS,
  META_LEAD_SOURCE,
  PLACE_INPUT_MAX,
  type ImportBatchKind,
  type ImportConsentBasis,
  type ImportRowInput,
  type ImportRowStatus,
  type RoutingOutcome,
} from "../lead-ops-types";
import { cleanText, normalizePhoneE164, parseTime } from "../pure";
import { findExternalRef, suppressionErasedAt } from "../repo/intake";
import { int, text as textOf, type Row } from "../repo/rows";
import { LEAD_CLASSES, LEAD_PROGRAMS, type CaptureLeadInput, type CaptureLeadOptions, type CaptureLeadResult } from "../types";
import { idCellDamage, isGarbledText, isScientific } from "./excel-damage";
import { utmSourceForPlatform } from "./fields";
import { IMPORT_CHUNK_BYTES, IMPORT_CHUNK_ROWS, maskImportPhone, parseMetaLeadId, statusBucket } from "./rows";

/**
 * CSV import, server side (LR-IMPORT, docs/lead-routing-plan.md §17; D-048; super admin only).
 *
 * The browser decodes, parses, maps and chunks the file (`decode.ts`, `csv.ts`, `rows.ts`); the
 * server re-validates every value here. Every row becomes a lead ONLY through CORE's
 * `captureLead` (§14.2: `origin` refs, `existing: "attach"`, suppression, `clockReason:
 * "import"`; its arrival pipeline §14.1 then routes the lead and starts the clock), reached
 * through `ImportDeps.capture`; this file never writes lead SQL. It owns the `crm_import_batches`
 * rows and reads refs and suppressions through CORE's `repo/intake.ts` for the dry run and for
 * safe resuming.
 *
 * Idempotency (A4, M5): a row with a valid Meta lead id uses `(meta, <id>)`; any other row uses
 * `(csv, keyedHash("csv-ref", phoneE164|createdTime|formId))`, with no file fingerprint, so
 * overlapping daily sheets only add their new rows. Each chunk runs in its own transaction.
 * Lookups also try the previous key's hash while `INTEGRATIONS_SECRET_PREVIOUS` is set (§19).
 * Audit rows carry counts only (`CRM_AUDIT.importStart`, `CRM_AUDIT.import`).
 *
 * Counting is idempotent per chunk: the browser sends each chunk with its `offset` (rows sent
 * before it). The batch counters always equal the rows of the chunks committed so far, so a chunk
 * whose rows are already counted (`offset + rows ≤ counted`) is a re-send after a lost answer:
 * it is answered again (rows this batch imported come back `already_imported` + `resumed`, with
 * the lost family's id) but counted only for rows that are new in this request.
 */

// ---------------------------------------------------------------------------------------------
// Limits (§17)

export const IMPORT_LIMITS = {
  /** Rows in one file / batch. */
  maxRows: 5000,
  /** Rows per preview / rows request. */
  chunkRows: IMPORT_CHUNK_ROWS,
  /** Request body bytes for preview / rows: CORE's `bodyLimit("import")` (nginx allows 1 MB). */
  bodyBytes: IMPORT_CHUNK_BYTES,
  /** Batches started per user per hour. */
  batchesPerHour: 20,
  /** Preview + rows requests per user per hour. */
  chunksPerHour: 400,
} as const;

/** The two audit actions of an import (CORE `CRM_AUDIT`; details are counts only). */
export const IMPORT_AUDIT = {
  importStart: CRM_AUDIT.importStart,
  import: CRM_AUDIT.import,
} as const;

// ---------------------------------------------------------------------------------------------
// Request bodies

const text = (max: number) => z.string().max(max).nullable().optional();

export const importRowSchema = z.strictObject({
  row: z.number().int().min(1).max(1_000_000),
  metaLeadId: text(40),
  createdTime: text(40),
  formId: text(30),
  formName: text(100),
  adId: text(30),
  adName: text(100),
  adsetName: text(100),
  campaignId: text(30),
  campaignName: text(100),
  platform: text(20),
  isOrganic: z.boolean().nullable().optional(),
  contactName: text(80),
  studentName: text(80),
  guardianName: text(80),
  phone: text(32),
  email: text(254),
  district: text(PLACE_INPUT_MAX),
  state: text(PLACE_INPUT_MAX),
  currentClass: text(30),
  programInterest: text(30),
  centre: text(60),
  submittedBy: z.enum(["student", "parent"]).nullable().optional(),
  consentChecked: z.boolean().nullable().optional(),
  answers: text(CAPTURE_ANSWERS_MAX),
  damaged: z.array(z.enum(IMPORT_DAMAGE_KINDS)).max(IMPORT_DAMAGE_KINDS.length).optional(),
});

const rowsSchema = z.array(importRowSchema).min(1).max(IMPORT_LIMITS.chunkRows);

export const importPreviewBodySchema = z.strictObject({
  rows: rowsSchema,
  consentBasis: z.enum(IMPORT_CONSENT_BASES).nullable().optional(),
});

export const importBatchBodySchema = z.strictObject({
  consentBasis: z.enum(IMPORT_CONSENT_BASES),
  startClock: z.boolean(),
  rowsTotal: z.number().int().min(1).max(IMPORT_LIMITS.maxRows),
  fileName: z.string().max(255).nullable().optional(),
  fileSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional(),
});

/** `offset`: how many rows of this batch the browser sent before this chunk (resume detection). */
export const importRowsBodySchema = z.strictObject({ rows: rowsSchema, offset: z.number().int().min(0).max(IMPORT_LIMITS.maxRows) });

export const importFinishBodySchema = z.strictObject({});

// ---------------------------------------------------------------------------------------------
// Shapes returned to the wizard

/** The routing outcome a new family would get (CORE `RoutingOutcome`). */
export type PlaceOutcome = RoutingOutcome;

export interface ImportPreviewRow {
  row: number;
  status: ImportRowStatus;
  /** `+91 98•••••210`; null when the phone is missing or invalid. */
  phoneMasked: string | null;
  /** The area the family would land in (their current one for a known family). */
  areaId: string | null;
  /** null = the place check is not available on this server. */
  place: PlaceOutcome | null;
  /** A known family that is currently `lost` and appears again (attached, not reopened). */
  lost?: true;
}

export interface ImportRowResult {
  row: number;
  status: ImportRowStatus;
  phoneMasked: string | null;
  /** Only for a lost family that appears again: the lead to check by hand. */
  lostLeadId?: string;
  /**
   * Already imported by this same batch (a chunk re-sent after a dropped connection). Not
   * counted again; the batch counters (`ImportBatchSummary`) are the totals to show.
   */
  resumed?: true;
}

export interface ImportBatchSummary {
  id: string;
  kind: ImportBatchKind;
  fileName: string | null;
  fileSha256: string | null;
  consentBasis: ImportConsentBasis;
  startClock: boolean;
  status: "open" | "finished";
  rowsTotal: number;
  created: number;
  attached: number;
  skipped: number;
  invalid: number;
  /** Started by the viewer. */
  mine: boolean;
  createdAt: string;
  finishedAt: string | null;
}

export type ImportErrorCode = "not_configured" | "not_found" | "forbidden" | "conflict" | "rate_limited";
export type ImportResult<T> = { ok: true; data: T } | { ok: false; error: ImportErrorCode; reason: string };

// ---------------------------------------------------------------------------------------------
// What the service needs from CORE (wired in `import-backend.ts`; spied on in tests)

/** CORE `CaptureLeadInput` (§14.2), as an import fills it. */
export type ImportCaptureInput = CaptureLeadInput;

/** CORE `CaptureLeadOptions` (§14.2): the keys every import row sets. */
export type ImportCaptureOptions = Required<
  Pick<CaptureLeadOptions, "origin" | "existing" | "suppression" | "submissionMeta" | "answers" | "slaClock" | "clockReason" | "arrivedAt">
>;

export interface ImportDeps {
  db: DatabaseSync;
  /** One write transaction (`withTransaction`, BEGIN IMMEDIATE); joins an open one. */
  transaction<T>(fn: () => T): T;
  /** CORE `captureLead`: the only way an import writes a lead. */
  capture(input: ImportCaptureInput, now: number, options: ImportCaptureOptions): CaptureLeadResult;
  /** `INTEGRATIONS_SECRET` is set (keyed refs and suppressions need it). */
  keyConfigured(): boolean;
  /** CORE `keyedHash(purpose, value)`; throws when the key is missing. */
  keyedHash(purpose: "csv-ref" | "phone", value: string): string;
  /** The same hash under `INTEGRATIONS_SECRET_PREVIOUS` (lookups during a key rotation); null when none is set. */
  keyedHashPrevious(purpose: "csv-ref" | "phone", value: string): string | null;
  /** The family already in the CRM with this phone (read only). */
  family(phoneE164: string): { leadId: string; lost: boolean; areaId: string | null } | null;
  /** Where a new family would be routed (read only; the routing seam's `previewPlace`); null = the check is not available. */
  resolvePlace(input: { district: string | null; state: string | null; centreSlug: string | null }): { areaId: string | null; outcome: PlaceOutcome } | null;
}

// ---------------------------------------------------------------------------------------------
// SQL: batches (owned here; refs and suppressions are read through CORE's `repo/intake.ts`)

interface BatchRow {
  id: string;
  kind: ImportBatchKind;
  fileName: string | null;
  fileSha256: string | null;
  consentBasis: ImportConsentBasis;
  startClock: boolean;
  status: "open" | "finished";
  rowsTotal: number;
  created: number;
  attached: number;
  skipped: number;
  invalid: number;
  actorId: string | null;
  createdAt: number;
  finishedAt: number | null;
}

const BATCH_COLUMNS =
  "id, kind, file_name, file_sha256, consent_basis, start_clock, status, rows_total, created, attached, skipped, invalid, actor_id, created_at, finished_at";

const isBatchKind = (value: unknown): value is ImportBatchKind => (IMPORT_BATCH_KINDS as readonly unknown[]).includes(value);
const isConsentBasis = (value: unknown): value is ImportConsentBasis => (IMPORT_CONSENT_BASES as readonly unknown[]).includes(value);

function mapBatch(raw: Row): BatchRow {
  const kind = raw.kind;
  const basis = raw.consent_basis;
  return {
    id: String(raw.id),
    kind: isBatchKind(kind) ? kind : "csv",
    fileName: textOf(raw.file_name),
    fileSha256: textOf(raw.file_sha256),
    consentBasis: isConsentBasis(basis) ? basis : "message",
    startClock: Number(raw.start_clock) === 1,
    status: raw.status === "finished" ? "finished" : "open",
    rowsTotal: Number(raw.rows_total),
    created: Number(raw.created),
    attached: Number(raw.attached),
    skipped: Number(raw.skipped),
    invalid: Number(raw.invalid),
    actorId: textOf(raw.actor_id),
    createdAt: Number(raw.created_at),
    finishedAt: int(raw.finished_at),
  };
}

function findBatch(db: DatabaseSync, id: string): BatchRow | null {
  const raw = db.prepare(`SELECT ${BATCH_COLUMNS} FROM crm_import_batches WHERE id = ?`).get(id);
  return raw ? mapBatch(raw) : null;
}

function insertBatch(db: DatabaseSync, batch: BatchRow): void {
  db.prepare(
    `INSERT INTO crm_import_batches (id, kind, file_name, file_sha256, consent_basis, start_clock, status, rows_total, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).run(batch.id, batch.kind, batch.fileName, batch.fileSha256, batch.consentBasis, batch.startClock ? 1 : 0, batch.rowsTotal, batch.actorId, batch.createdAt);
}

type Counts = { created: number; attached: number; skipped: number; invalid: number };

function addBatchCounts(db: DatabaseSync, id: string, counts: Counts): void {
  db.prepare(
    "UPDATE crm_import_batches SET created = created + ?, attached = attached + ?, skipped = skipped + ?, invalid = invalid + ? WHERE id = ?",
  ).run(counts.created, counts.attached, counts.skipped, counts.invalid, id);
}

function markFinished(db: DatabaseSync, id: string, now: number): void {
  db.prepare("UPDATE crm_import_batches SET status = 'finished', finished_at = ? WHERE id = ? AND status = 'open'").run(now, id);
}

function listBatches(db: DatabaseSync, limit: number): BatchRow[] {
  return db
    .prepare(`SELECT ${BATCH_COLUMNS} FROM crm_import_batches ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(Math.max(1, Math.min(200, Math.trunc(limit))))
    .map(mapBatch);
}

function batchesStartedSince(db: DatabaseSync, actorId: string, since: number): number {
  return int(db.prepare("SELECT COUNT(*) AS n FROM crm_import_batches WHERE actor_id = ? AND created_at >= ?").get(actorId, since)?.n) ?? 0;
}

function toSummary(batch: BatchRow, viewerId: string): ImportBatchSummary {
  return {
    id: batch.id,
    kind: batch.kind,
    fileName: batch.fileName,
    fileSha256: batch.fileSha256,
    consentBasis: batch.consentBasis,
    startClock: batch.startClock,
    status: batch.status,
    rowsTotal: batch.rowsTotal,
    created: batch.created,
    attached: batch.attached,
    skipped: batch.skipped,
    invalid: batch.invalid,
    mine: batch.actorId === viewerId,
    createdAt: new Date(batch.createdAt).toISOString(),
    finishedAt: batch.finishedAt === null ? null : new Date(batch.finishedAt).toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------
// One row

type Evaluated =
  | { kind: "done"; status: ImportRowStatus; phoneMasked: string | null }
  | {
      kind: "ready";
      phone: string;
      phoneMasked: string | null;
      provider: "meta" | "csv";
      /** The ref this row writes (current key). */
      externalId: string;
      /** Ids to look the ref up by: `externalId`, then the previous key's hash during a rotation. */
      lookupIds: string[];
      /** Meta's `created_time` when plausible (not before 2015, not in the future), else null. */
      createdAt: number | null;
      createdIso: string | null;
      metaLeadId: string | null;
    };

/** Lead dates before this are typos (Meta Lead Ads did not run here before). */
const EARLIEST_CREATED_AT = Date.UTC(2015, 0, 1);
/** Clock skew allowed for a `created_time` "in the future". */
const FUTURE_SLACK_MS = 10 * 60 * 1000;

/**
 * A `created_time` the import may trust, or null. A future or ancient date (a typo such as 2062,
 * or a sheet's own "Date" column) must not pass the erase suppression as a "new enquiry after the
 * erasure" (D-042), nor become a consent time in the future.
 */
function plausibleCreatedAt(value: string | null | undefined, now: number): number | null {
  const ms = parseTime(value ?? null);
  return ms !== null && ms >= EARLIEST_CREATED_AT && ms <= now + FUTURE_SLACK_MS ? ms : null;
}

/** Fields the browser flags as garbled text; the server checks them again. */
const TEXT_FIELDS = ["contactName", "studentName", "guardianName", "district", "state", "centre", "currentClass", "programInterest"] as const;

const CENTRE_SLUGS: ReadonlySet<string> = new Set(centres.map((centre) => centre.slug));

/** A value from a fixed list (centre slug, class, programme), else null: never stored unchecked. */
function oneOf(value: string | null | undefined, allowed: ReadonlySet<string> | readonly string[]): string | null {
  const cleaned = cleanText(value, 60);
  if (!cleaned) return null;
  const known = "has" in allowed ? allowed.has(cleaned) : allowed.includes(cleaned);
  return known ? cleaned : null;
}

const knownCentre = (value: string | null | undefined) => oneOf(value, CENTRE_SLUGS);

function digitsId(value: string | null | undefined): string | null {
  const id = (value ?? "").trim();
  return /^\d{1,20}$/.test(id) ? id : null;
}

/**
 * Excel damage, checked again on the server (the browser's `damaged` flags are trusted only to
 * block, never to allow): a scientific-notation phone or id, or a garbled name / place / class /
 * course. A cut id ("…0") is only visible across the whole id column, so it is the browser's
 * `id_truncated` flag (`truncatedIdColumn`) that blocks it: judged alone, one real id in 100
 * ends in "00" and would be refused for good.
 */
function serverSeesDamage(row: ImportRowInput): boolean {
  if ((row.damaged?.length ?? 0) > 0) return true;
  if (row.phone && isScientific(row.phone)) return true;
  if (row.metaLeadId && idCellDamage(row.metaLeadId) !== null) return true;
  return TEXT_FIELDS.some((field) => {
    const value = row[field];
    return typeof value === "string" && isGarbledText(value);
  });
}

type HashDeps = Pick<ImportDeps, "keyedHash" | "keyedHashPrevious">;

/** The current key's hash, then the previous key's (if one is set). */
function hashCandidates(deps: HashDeps, purpose: "csv-ref" | "phone", value: string): string[] {
  const current = deps.keyedHash(purpose, value);
  const previous = deps.keyedHashPrevious(purpose, value);
  return previous && previous !== current ? [current, previous] : [current];
}

/** Re-validates a row the browser built; decides everything that needs no lookup. */
function evaluateRow(row: ImportRowInput, basis: ImportConsentBasis | null, deps: HashDeps, now: number): Evaluated {
  const rawPhone = row.phone?.trim() ?? "";
  const phone = normalizePhoneE164(rawPhone.startsWith("p:") ? rawPhone.slice(2) : rawPhone);
  const phoneMasked = maskImportPhone(phone);
  if (serverSeesDamage(row)) return { kind: "done", status: "damaged", phoneMasked };
  if (rawPhone.length === 0) return { kind: "done", status: "missing_phone", phoneMasked: null };
  if (!phone) return { kind: "done", status: "invalid_phone", phoneMasked: null };
  const metaLeadId = parseMetaLeadId(row.metaLeadId ?? null);
  if (basis === "meta_lead_form" && !metaLeadId) return { kind: "done", status: "consent_mismatch", phoneMasked };
  const createdAt = plausibleCreatedAt(row.createdTime, now);
  const createdIso = createdAt === null ? null : new Date(createdAt).toISOString();
  if (metaLeadId) {
    return { kind: "ready", phone, phoneMasked, provider: "meta", externalId: metaLeadId, lookupIds: [metaLeadId], createdAt, createdIso, metaLeadId };
  }
  const formId = digitsId(row.formId);
  const lookupIds = hashCandidates(deps, "csv-ref", `${phone}|${createdIso ?? ""}|${formId ?? ""}`);
  return { kind: "ready", phone, phoneMasked, provider: "csv", externalId: lookupIds[0], lookupIds, createdAt, createdIso, metaLeadId: null };
}

/** CORE's suppression rule (M5), read-only for the dry run: the family was erased after this lead was created. */
function isErased(deps: Pick<ImportDeps, "db"> & HashDeps, phone: string, createdAt: number | null): boolean {
  const erasedAt = suppressionErasedAt(deps.db, hashCandidates(deps, "phone", phone));
  return erasedAt !== null && (createdAt === null || createdAt < erasedAt);
}

function captureCall(
  row: ImportRowInput,
  ready: Extract<Evaluated, { kind: "ready" }>,
  batch: BatchRow,
  now: number,
): { input: ImportCaptureInput; options: ImportCaptureOptions } {
  const meta = batch.consentBasis === "meta_lead_form";
  const formId = digitsId(row.formId);
  const adId = digitsId(row.adId);
  const campaignId = digitsId(row.campaignId);
  const fromMeta = meta || ready.metaLeadId !== null || Boolean(row.platform || adId || campaignId);
  const submissionMeta: Record<string, string | number | boolean> = { importBatch: batch.id };
  if (ready.createdIso) submissionMeta.metaCreatedAt = ready.createdIso;
  if (formId) submissionMeta.formId = formId;
  if (adId) submissionMeta.adId = adId;
  if (campaignId) submissionMeta.campaignId = campaignId;
  if (meta) {
    if (row.consentChecked !== true) submissionMeta.consentConfirmed = false;
  } else {
    submissionMeta.consentMethod = batch.consentBasis;
  }
  const input: ImportCaptureInput = {
    source: meta ? META_LEAD_SOURCE : CSV_LEAD_SOURCE,
    studentName: cleanText(row.studentName, 80),
    guardianName: cleanText(row.guardianName, 80),
    contactName: cleanText(row.contactName, 80),
    phone: ready.phone,
    email: cleanText(row.email, 254),
    currentClass: oneOf(row.currentClass, LEAD_CLASSES),
    programInterest: oneOf(row.programInterest, LEAD_PROGRAMS),
    centreSlug: knownCentre(row.centre),
    district: cleanText(row.district, PLACE_INPUT_MAX),
    state: cleanText(row.state, PLACE_INPUT_MAX),
    submittedBy: row.submittedBy ?? null,
    message: null,
    consent: meta
      ? {
          textVersion: `meta:${formId ?? "unknown"}${row.consentChecked === true ? ":cb" : ""}`,
          // Meta's own time, never later than now (a plausible date may still be a few minutes ahead).
          at: Math.min(ready.createdAt ?? now, now),
          method: "meta_lead_form",
        }
      : { textVersion: "staff-recorded", at: now, method: "csv_import" },
  };
  if (fromMeta) {
    input.context = {
      utmSource: utmSourceForPlatform(row.platform),
      utmMedium: "lead_ad",
      utmCampaign: cleanText(row.campaignName, 100) ?? campaignId,
      utmContent: cleanText(row.adName, 100) ?? adId,
      utmTerm: cleanText(row.adsetName, 100),
    };
  }
  return {
    input,
    options: {
      origin: { provider: ready.provider, externalId: ready.externalId, batchId: batch.id },
      existing: "attach",
      suppression: { createdAt: ready.createdAt },
      submissionMeta,
      answers: row.answers?.trim() ? row.answers.trim().slice(0, CAPTURE_ANSWERS_MAX) : null,
      slaClock: batch.startClock,
      clockReason: "import",
      arrivedAt: now,
    },
  };
}

function captureStatus(result: CaptureLeadResult): ImportRowStatus {
  if (result.ok) {
    if (result.alreadyImported) return "already_imported";
    if (result.isNew && !result.attached) return "created";
    return "attached";
  }
  switch (result.error) {
    case "erased_family":
      return "erased_family";
    case "consent_missing":
      return "consent_mismatch";
    default:
      // invalid_phone / invalid_input cannot happen after the checks above; report the row as invalid.
      return "invalid_phone";
  }
}

// ---------------------------------------------------------------------------------------------
// Services (the routes check: super admin, same origin, limits)

function notConfigured<T>(): ImportResult<T> {
  return { ok: false, error: "not_configured", reason: "integrations_secret_missing" };
}

/**
 * Dry run of one chunk (no writes): per-row status, masked phone, the area the family would
 * land in, and whether a known family is currently lost. A phone that already counted as a new
 * family earlier in the chunk is reported as `attached` (the real import creates it once; the
 * browser does the same across chunks).
 */
export function previewImportRows(
  deps: ImportDeps,
  rows: readonly ImportRowInput[],
  basis: ImportConsentBasis | null,
  now: number,
): ImportResult<ImportPreviewRow[]> {
  if (!deps.keyConfigured()) return notConfigured();
  const seen = new Set<string>();
  const newFamilies = new Map<string, { areaId: string | null; place: PlaceOutcome | null }>();
  const out = rows.map((row): ImportPreviewRow => {
    const evaluated = evaluateRow(row, basis, deps, now);
    if (evaluated.kind === "done") return { row: row.row, status: evaluated.status, phoneMasked: evaluated.phoneMasked, areaId: null, place: null };
    const key = `${evaluated.provider}:${evaluated.externalId}`;
    const base = { row: row.row, phoneMasked: evaluated.phoneMasked };
    if (seen.has(key)) return { ...base, status: "duplicate_in_file", areaId: null, place: null };
    seen.add(key);
    if (findExternalRef(deps.db, evaluated.provider, evaluated.lookupIds)) return { ...base, status: "already_imported", areaId: null, place: null };
    if (isErased(deps, evaluated.phone, evaluated.createdAt)) return { ...base, status: "erased_family", areaId: null, place: null };
    const family = deps.family(evaluated.phone);
    if (family) {
      return { ...base, status: "attached", areaId: family.areaId, place: family.areaId ? "area" : null, ...(family.lost ? { lost: true as const } : {}) };
    }
    const earlier = newFamilies.get(evaluated.phone);
    if (earlier) return { ...base, status: "attached", areaId: earlier.areaId, place: earlier.place };
    const place = deps.resolvePlace({ district: cleanText(row.district, 60), state: cleanText(row.state, 60), centreSlug: knownCentre(row.centre) });
    const landing = { areaId: place?.areaId ?? null, place: place?.outcome ?? null };
    newFamilies.set(evaluated.phone, landing);
    return { ...base, status: "created", ...landing };
  });
  return { ok: true, data: out };
}

/** Starts a batch (audited `crm.import_start`, counts only). */
export function startImportBatch(
  deps: ImportDeps,
  actorId: string,
  input: z.infer<typeof importBatchBodySchema>,
  now: number,
): ImportResult<ImportBatchSummary> {
  if (!deps.keyConfigured()) return notConfigured();
  if (batchesStartedSince(deps.db, actorId, now - 60 * 60 * 1000) >= IMPORT_LIMITS.batchesPerHour) {
    return { ok: false, error: "rate_limited", reason: "too_many_batches" };
  }
  const fileName = cleanText((input.fileName ?? "").split(/[\\/]/).pop() ?? "", 120);
  const batch: BatchRow = {
    id: randomUUID(),
    kind: input.consentBasis === "meta_lead_form" ? "meta_csv" : "csv",
    fileName,
    fileSha256: input.fileSha256 ?? null,
    consentBasis: input.consentBasis,
    startClock: input.startClock,
    status: "open",
    rowsTotal: input.rowsTotal,
    created: 0,
    attached: 0,
    skipped: 0,
    invalid: 0,
    actorId,
    createdAt: now,
    finishedAt: null,
  };
  deps.transaction(() => {
    insertBatch(deps.db, batch);
    crmAudit(deps.db, {
      actorId,
      action: IMPORT_AUDIT.importStart,
      target: batch.id,
      details: { kind: batch.kind, consentBasis: batch.consentBasis, startClock: batch.startClock, rowsTotal: batch.rowsTotal },
      now,
    });
  });
  return { ok: true, data: toSummary(batch, actorId) };
}

/**
 * Imports one chunk in ONE transaction. `offset` = rows of this batch sent before the chunk.
 * - `offset` equal to the rows counted so far: a new chunk; every row is counted once.
 * - `offset + rows` within the rows counted so far: the same chunk sent again after its answer was
 *   lost. Rows this batch imported come back `already_imported` + `resumed` (with `lostLeadId`
 *   for a lost family); only rows that capture writes in THIS request are counted.
 * - anything else: 409 `chunk_out_of_order` (nothing is written).
 */
export function importBatchRows(
  deps: ImportDeps,
  actorId: string,
  batchId: string,
  chunk: { rows: readonly ImportRowInput[]; offset: number },
  now: number,
): ImportResult<{ results: ImportRowResult[]; batch: ImportBatchSummary }> {
  if (!deps.keyConfigured()) return notConfigured();
  const batch = findBatch(deps.db, batchId);
  if (!batch) return { ok: false, error: "not_found", reason: "batch_not_found" };
  if (batch.actorId !== actorId) return { ok: false, error: "forbidden", reason: "other_users_batch" };
  if (batch.status !== "open") return { ok: false, error: "conflict", reason: "batch_finished" };
  const { rows, offset } = chunk;
  const counted = batch.created + batch.attached + batch.skipped + batch.invalid;
  const resend = offset + rows.length <= counted;
  if (!resend && offset !== counted) return { ok: false, error: "conflict", reason: "chunk_out_of_order" };
  // At most the rows declared at start (the wizard declares exactly the rows it sends), never over 5,000.
  if (!resend && counted + rows.length > Math.min(batch.rowsTotal, IMPORT_LIMITS.maxRows)) return { ok: false, error: "conflict", reason: "batch_full" };

  const results = deps.transaction(() => {
    const counts: Counts = { created: 0, attached: 0, skipped: 0, invalid: 0 };
    const seen = new Set<string>();
    const out = rows.map((row): ImportRowResult => {
      const evaluated = evaluateRow(row, batch.consentBasis, deps, now);
      let result: ImportRowResult;
      let wrote = false;
      if (evaluated.kind === "done") {
        result = { row: row.row, status: evaluated.status, phoneMasked: evaluated.phoneMasked };
      } else if (seen.has(`${evaluated.provider}:${evaluated.externalId}`)) {
        result = { row: row.row, status: "duplicate_in_file", phoneMasked: evaluated.phoneMasked };
      } else {
        seen.add(`${evaluated.provider}:${evaluated.externalId}`);
        const ref = findExternalRef(deps.db, evaluated.provider, evaluated.lookupIds);
        if (ref) {
          result = { row: row.row, status: "already_imported", phoneMasked: evaluated.phoneMasked };
          if (resend && ref.batchId === batch.id) {
            result.resumed = true;
            const family = deps.family(evaluated.phone);
            if (family?.lost) result.lostLeadId = family.leadId;
          }
        } else {
          const call = captureCall(row, evaluated, batch, now);
          const status = captureStatus(deps.capture(call.input, now, call.options));
          result = { row: row.row, status, phoneMasked: evaluated.phoneMasked };
          wrote = status === "created" || status === "attached";
          if (status === "attached") {
            const family = deps.family(evaluated.phone);
            if (family?.lost) result.lostLeadId = family.leadId;
          }
        }
      }
      // A re-sent chunk was counted when it first committed: count only what this request wrote.
      if (!resend || wrote) counts[statusBucket(result.status)]++;
      return result;
    });
    addBatchCounts(deps.db, batch.id, counts);
    return out;
  });
  const fresh = findBatch(deps.db, batch.id) ?? batch;
  return { ok: true, data: { results, batch: toSummary(fresh, actorId) } };
}

/** Closes a batch and audits `crm.import` with its counts. Finishing twice is harmless. */
export function finishImportBatch(deps: ImportDeps, actorId: string, batchId: string, now: number): ImportResult<ImportBatchSummary> {
  const batch = findBatch(deps.db, batchId);
  if (!batch) return { ok: false, error: "not_found", reason: "batch_not_found" };
  if (batch.actorId !== actorId) return { ok: false, error: "forbidden", reason: "other_users_batch" };
  if (batch.status === "finished") return { ok: true, data: toSummary(batch, actorId) };
  deps.transaction(() => {
    markFinished(deps.db, batch.id, now);
    crmAudit(deps.db, {
      actorId,
      action: IMPORT_AUDIT.import,
      target: batch.id,
      details: {
        kind: batch.kind,
        consentBasis: batch.consentBasis,
        startClock: batch.startClock,
        rowsTotal: batch.rowsTotal,
        created: batch.created,
        attached: batch.attached,
        skipped: batch.skipped,
        invalid: batch.invalid,
      },
      now,
    });
  });
  return { ok: true, data: toSummary(findBatch(deps.db, batch.id) ?? batch, actorId) };
}

/** Import history, newest first (super admins and admins). */
export function listImportBatches(deps: Pick<ImportDeps, "db">, viewerId: string, limit = 50): ImportBatchSummary[] {
  return listBatches(deps.db, limit).map((batch) => toSummary(batch, viewerId));
}
