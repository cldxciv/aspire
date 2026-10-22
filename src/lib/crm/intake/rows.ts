/**
 * CSV import, steps 3, 4 and 6 (LR-IMPORT, docs/lead-routing-plan.md §17): header → field
 * mapping, value normalisation, Excel-damage flags, in-file duplicates and the ≤ 250-row /
 * ≤ 256 KB chunks the wizard posts. Pure and client-safe (runs in the browser and in tests).
 *
 * Contracts come from LR-CORE: the §17 shapes (`ImportRowInput`, `ImportRowStatus`, consent
 * bases, field targets) live in `lead-ops-types.ts`; the header synonyms and value normalisers
 * shared with Meta Lead Ads live in `intake/fields.ts`. This file only adds what is specific to a
 * spreadsheet: one leading `'` and a trailing `.0` are stripped from every cell before a
 * normaliser sees it (`excel-damage.ts`), and damage is flagged, never repaired.
 */

import { cleanText, normalizePhoneE164 } from "@/lib/crm/pure";

import {
  CAPTURE_ANSWERS_MAX,
  IMPORT_CONSENT_BASES,
  IMPORT_FIELD_TARGETS,
  IMPORT_ROW_STATUSES,
  IMPORT_TARGETS,
  PLACE_INPUT_MAX,
  type ImportConsentBasis,
  type ImportFieldTarget,
  type ImportRowInput,
  type ImportRowStatus,
  type ImportTarget,
} from "../lead-ops-types";
import type { CsvRow } from "./csv";
import type { CsvEncoding } from "./decode";
import {
  hasSpreadsheetArtifacts,
  idCellDamage,
  isGarbledText,
  isScientific,
  phoneCellDamage,
  stripSpreadsheetArtifacts,
  truncatedIdColumn,
  type DamageKind,
} from "./excel-damage";
import {
  cleanPhoneInput,
  guessTarget,
  guessTargets,
  isImportTarget,
  matchCentre,
  normaliseClass,
  normaliseHeader,
  normaliseProgram,
  normaliseSubmittedBy as normaliseSubmitter,
  parseBooleanAnswer,
  parseMetaLeadId as parseLeadIdAnswer,
  parseMetaObjectId as parseObjectIdAnswer,
  parseMetaTime,
  platformCode,
  type CentreOption,
} from "./fields";

// ---------------------------------------------------------------------------------------------
// §17 shapes (CORE)

export {
  IMPORT_CONSENT_BASES,
  IMPORT_FIELD_TARGETS,
  IMPORT_ROW_STATUSES,
  IMPORT_TARGETS,
  isImportTarget,
  normaliseHeader,
  type ImportConsentBasis,
  type ImportFieldTarget,
  type ImportRowInput,
  type ImportRowStatus,
  type ImportTarget,
};

/** Which batch counter a row status adds to (`crm_import_batches`). */
export function statusBucket(status: ImportRowStatus): "created" | "attached" | "skipped" | "invalid" {
  switch (status) {
    case "created":
      return "created";
    case "attached":
      return "attached";
    case "already_imported":
    case "erased_family":
    case "duplicate_in_file":
      return "skipped";
    default:
      return "invalid";
  }
}

export function isImportConsentBasis(value: unknown): value is ImportConsentBasis {
  return typeof value === "string" && (IMPORT_CONSENT_BASES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------------------------
// Mapping (header synonyms: CORE `fields.ts`)

/** Best guess for one header (the super admin can change every guess). */
export function guessImportTarget(header: string): ImportTarget {
  return guessTarget(header);
}

/** Guesses for a header row: a field target is used once; a second column with it becomes `answer`. */
export function guessMapping(header: readonly string[]): ImportTarget[] {
  return guessTargets(header);
}

export type MappingIssue = "phone_unmapped" | "duplicate_target";

/** The phone column is required; each field target may be used once. */
export function mappingIssues(mapping: readonly ImportTarget[]): MappingIssue[] {
  const issues: MappingIssue[] = [];
  if (!mapping.includes("phone")) issues.push("phone_unmapped");
  const seen = new Set<ImportTarget>();
  for (const target of mapping) {
    if (target === "answer" || target === "ignore") continue;
    if (seen.has(target)) {
      issues.push("duplicate_target");
      break;
    }
    seen.add(target);
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Cell normalisers: spreadsheet artefacts off, then CORE's shared normaliser

/** A cell without Excel's harmless artefacts (one leading `'`, a trailing `.0`), trimmed. */
function cell(raw: unknown): string | null {
  return typeof raw === "string" ? stripSpreadsheetArtifacts(raw) : null;
}

/**
 * A Meta lead id: exactly `^(l:)?(\d{15,17})$` once the spreadsheet artefacts are removed. Never
 * strips any other character (A3): `123-456…` or a cut id is not a lead id.
 */
export function parseMetaLeadId(raw: unknown): string | null {
  return parseLeadIdAnswer(cell(raw));
}

/** Form / ad / campaign ids: digits only (export prefix allowed), else null. */
export function parseMetaObjectId(raw: unknown): string | null {
  return parseObjectIdAnswer(cell(raw));
}

/** Phone cell → the string the server normalises (`p:+91…` → `+91…`, `'…`, `….0`); empty → null. */
export function cleanImportPhone(raw: unknown): string | null {
  const phone = cleanPhoneInput(cell(raw));
  return phone === null ? null : stripSpreadsheetArtifacts(phone) || null;
}

/** `+91 98•••••210` (first two and last three digits), for previews and results. */
export function maskImportPhone(phoneE164: string | null): string | null {
  if (!phoneE164 || !/^\+91\d{10}$/.test(phoneE164)) return null;
  const national = phoneE164.slice(3);
  return `+91 ${national.slice(0, 2)}•••••${national.slice(7)}`;
}

export function parseImportBoolean(raw: unknown): boolean | null {
  return parseBooleanAnswer(cell(raw));
}

/**
 * Meta's `created_time` or a plain `2026-10-21 10:15[:30]` → ISO-8601 UTC (a time without a zone
 * is IST, Aspire's ad account zone). Anything else → null: the row is still imported, only
 * without the Meta date.
 */
export function parseImportTime(raw: unknown): string | null {
  return parseMetaTime(cell(raw));
}

/** A class answer → a `LEAD_CLASSES` value, or null when it cannot be read. */
export function normaliseImportClass(raw: unknown): string | null {
  return normaliseClass(cell(raw));
}

/** A course / exam answer → a `LEAD_PROGRAMS` value, or null. */
export function normaliseImportProgram(raw: unknown): string | null {
  return normaliseProgram(cell(raw));
}

/** "I am the parent / student" answers → `submittedBy`. */
export function normaliseSubmittedBy(raw: unknown): "student" | "parent" | null {
  return normaliseSubmitter(cell(raw));
}

/** Centre options for `matchImportCentre` (slug + display names in both languages). */
export type ImportCentreOption = CentreOption;

/** A centre answer → a centre slug, or null ("not sure", unknown text). */
export function matchImportCentre(raw: unknown, centres: readonly ImportCentreOption[]): string | null {
  return matchCentre(cell(raw), centres);
}

// ---------------------------------------------------------------------------------------------
// Rows

export interface BuiltImportRows {
  /** Rows to send (in-file duplicates are left out and reported in `local`). */
  rows: ImportRowInput[];
  /** Statuses decided in the browser: in-file duplicates (the server decides the rest). */
  local: { row: number; status: ImportRowStatus }[];
  /** Answer cells left out because the file garbled them. */
  garbledAnswers: number;
}

const TEXT_TARGETS: readonly ImportFieldTarget[] = [
  "contactName",
  "studentName",
  "guardianName",
  "district",
  "state",
  "currentClass",
  "programInterest",
  "centre",
  "submittedBy",
];

function addDamage(row: ImportRowInput, kind: DamageKind): void {
  if (!row.damaged) row.damaged = [];
  if (!row.damaged.includes(kind)) row.damaged.push(kind);
}

/** The idempotency key the server will use, for in-file duplicate detection. */
export function inFileKey(row: ImportRowInput): string | null {
  const id = parseMetaLeadId(row.metaLeadId ?? null);
  if (id) return `meta:${id}`;
  const phone = normalizePhoneE164(row.phone ?? null);
  return phone ? `csv:${phone}|${row.createdTime ?? ""}|${row.formId ?? ""}` : null;
}

/** Columns Excel turns into numbers: where its fingerprints (`E+`, `'`, `.0`) show. */
const NUMBER_TARGETS: readonly ImportTarget[] = ["metaLeadId", "phone", "formId", "adId", "campaignId"];

/**
 * Whether the file shows a sign of Excel besides cut ids: an "ANSI" (windows-1252) decode, or
 * scientific notation, a leading `'` or a `.0` in a number column.
 */
function showsOtherExcelSigns(rows: readonly CsvRow[], mapping: readonly ImportTarget[], encoding: CsvEncoding | undefined): boolean {
  if (encoding === "windows-1252") return true;
  const columns = mapping.flatMap((target, column) => (NUMBER_TARGETS.includes(target) ? [column] : []));
  return rows.some((row) => columns.some((column) => hasSpreadsheetArtifacts(row.cells[column] ?? "")));
}

/**
 * Parsed CSV + mapping → the rows to send. Values are normalised; Excel damage is flagged on the
 * row (`damaged`), never repaired; the same lead (same Meta id, or same phone + time + form) twice
 * in one file is sent once. `encoding` is how the file was decoded (`decodeCsvBytes`): an "ANSI"
 * file is one more sign that Excel saved it.
 */
export function buildImportRows(
  header: readonly string[],
  rows: readonly CsvRow[],
  mapping: readonly ImportTarget[],
  options: { centres?: readonly ImportCentreOption[]; encoding?: CsvEncoding } = {},
): BuiltImportRows {
  const centres = options.centres ?? [];
  const idColumn = mapping.indexOf("metaLeadId");
  const cutIds =
    idColumn >= 0
      ? truncatedIdColumn(
          rows.map((row) => row.cells[idColumn] ?? null),
          { otherExcelSigns: showsOtherExcelSigns(rows, mapping, options.encoding) },
        )
      : new Set<number>();
  const built: ImportRowInput[] = [];
  const local: BuiltImportRows["local"] = [];
  const seen = new Set<string>();
  let garbledAnswers = 0;

  rows.forEach((source, index) => {
    const out: ImportRowInput = { row: source.row };
    const answers: string[] = [];
    let centreText: string | null = null;
    mapping.forEach((target, column) => {
      if (target === "ignore") return;
      const raw = source.cells[column] ?? "";
      const value = stripSpreadsheetArtifacts(raw);
      if (value.length === 0) return;
      if (target === "answer") {
        if (isGarbledText(value)) {
          garbledAnswers++;
          return;
        }
        const label = cleanText(header[column] ?? "", 80) ?? `#${column + 1}`;
        answers.push(`${label}: ${cleanText(value, 300) ?? ""}`);
        return;
      }
      if ((TEXT_TARGETS as readonly string[]).includes(target) && isGarbledText(value)) {
        addDamage(out, "text_mojibake");
        return;
      }
      switch (target) {
        case "metaLeadId": {
          const damage = idCellDamage(raw);
          if (damage) addDamage(out, damage);
          else if (cutIds.has(index)) addDamage(out, "id_truncated");
          out.metaLeadId = value.slice(0, 40);
          return;
        }
        case "phone": {
          const damage = phoneCellDamage(raw);
          if (damage) addDamage(out, damage);
          out.phone = cleanImportPhone(raw);
          return;
        }
        case "createdTime":
          out.createdTime = parseImportTime(value);
          return;
        case "formId":
        case "adId":
        case "campaignId":
          out[target] = isScientific(raw) ? null : parseMetaObjectId(value);
          return;
        case "formName":
        case "adName":
        case "adsetName":
        case "campaignName":
          out[target] = cleanText(value, 100);
          return;
        case "platform":
          out.platform = platformCode(value);
          return;
        case "isOrganic":
          out.isOrganic = parseImportBoolean(value);
          return;
        case "consentChecked":
          out.consentChecked = parseImportBoolean(value);
          return;
        case "contactName":
        case "studentName":
        case "guardianName":
          out[target] = cleanText(value, 80);
          return;
        case "email":
          out.email = cleanText(value, 254);
          return;
        case "district":
        case "state":
          out[target] = cleanText(value, PLACE_INPUT_MAX);
          return;
        case "currentClass":
          out.currentClass = normaliseImportClass(value);
          if (!out.currentClass) answers.push(`${cleanText(header[column] ?? "", 80) ?? "class"}: ${cleanText(value, 100) ?? ""}`);
          return;
        case "programInterest":
          out.programInterest = normaliseImportProgram(value);
          if (!out.programInterest) answers.push(`${cleanText(header[column] ?? "", 80) ?? "course"}: ${cleanText(value, 100) ?? ""}`);
          return;
        case "centre":
          out.centre = matchImportCentre(value, centres);
          if (!out.centre) centreText = cleanText(value, PLACE_INPUT_MAX);
          return;
        case "submittedBy":
          out.submittedBy = normaliseSubmittedBy(value);
          return;
      }
    });
    // A centre answer we could not match is still a place: route by it when no district was given.
    if (!out.district && centreText) out.district = centreText;
    if (answers.length > 0) {
      const text = answers.join("\n");
      out.answers = text.length > CAPTURE_ANSWERS_MAX ? text.slice(0, CAPTURE_ANSWERS_MAX) : text;
    }
    const key = inFileKey(out);
    if (key && seen.has(key)) {
      local.push({ row: out.row, status: "duplicate_in_file" });
      return;
    }
    if (key) seen.add(key);
    built.push(out);
  });
  return { rows: built, local, garbledAnswers };
}

// ---------------------------------------------------------------------------------------------
// Chunks

export const IMPORT_CHUNK_ROWS = 250;
/** One request body (preview / rows): 256 KB, CORE's `bodyLimit("import")` (nginx allows 1 MB). */
export const IMPORT_CHUNK_BYTES = 256 * 1024;
/** Room for the rest of the request body (`{"rows":[…],"offset":…}`). */
const ENVELOPE_BYTES = 512;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Splits rows into request-sized chunks: ≤ `maxRows` rows and ≤ `maxBytes` of JSON each
 * (nginx's default body limit is 1 MB; the server allows 256 KB). A single row is always far
 * smaller than a chunk (60 cells × 2,000 characters is cut to the mapped fields + 1,000).
 */
export function chunkImportRows(
  rows: readonly ImportRowInput[],
  { maxRows = IMPORT_CHUNK_ROWS, maxBytes = IMPORT_CHUNK_BYTES }: { maxRows?: number; maxBytes?: number } = {},
): ImportRowInput[][] {
  const chunks: ImportRowInput[][] = [];
  let current: ImportRowInput[] = [];
  let bytes = ENVELOPE_BYTES;
  for (const row of rows) {
    const size = byteLength(JSON.stringify(row)) + 1;
    if (current.length > 0 && (current.length >= maxRows || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = ENVELOPE_BYTES;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
