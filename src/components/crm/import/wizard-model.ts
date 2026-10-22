/**
 * The import wizard's pure logic (LR-IMPORT): reading the chosen file, totals for the preview
 * and the result, the problem list. No React, no I/O; unit-tested in import-ui.test.ts.
 */
import type { ImportBatchSummary, ImportPreviewRow, ImportRowResult } from "@/lib/crm/intake/import";
import { parseCsv, type CsvIssue, type CsvRow } from "@/lib/crm/intake/csv";
import { normalizePhoneE164 } from "@/lib/crm/pure";
import { decodeCsvBytes, MAX_IMPORT_FILE_BYTES, type CsvEncoding, type DecodeWarning } from "@/lib/crm/intake/decode";
import { damageSummary, wentThroughExcel, type DamageKind } from "@/lib/crm/intake/excel-damage";
import { guessMapping, type ImportRowInput, type ImportRowStatus, type ImportTarget } from "@/lib/crm/intake/rows";

export type FileProblem =
  | { kind: "too_big" }
  | { kind: "xlsx" }
  | { kind: "parse"; issue: CsvIssue; row?: number };

export interface ReadFile {
  encoding: CsvEncoding;
  warnings: DecodeWarning[];
  header: string[];
  rows: CsvRow[];
  mapping: ImportTarget[];
}

/** An .xlsx / .xls workbook (ZIP or OLE header), which we do not read in this release. */
export function looksLikeWorkbook(bytes: Uint8Array): boolean {
  const zip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const ole = bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return zip || ole;
}

/** File bytes → header, rows and a guessed mapping, or the reason we cannot read it. */
export function readImportFile(bytes: Uint8Array): { ok: true; file: ReadFile } | { ok: false; problem: FileProblem } {
  if (bytes.length > MAX_IMPORT_FILE_BYTES) return { ok: false, problem: { kind: "too_big" } };
  if (looksLikeWorkbook(bytes)) return { ok: false, problem: { kind: "xlsx" } };
  const decoded = decodeCsvBytes(bytes);
  const parsed = parseCsv(decoded.text);
  if (!parsed.ok) return { ok: false, problem: { kind: "parse", issue: parsed.issue, row: parsed.row } };
  return {
    ok: true,
    file: { encoding: decoded.encoding, warnings: decoded.warnings, header: parsed.header, rows: parsed.rows, mapping: guessMapping(parsed.header) },
  };
}

/** SHA-256 of the file (hex), to warn when the same file was imported before. */
export async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  try {
    // A copy backed by a plain ArrayBuffer (what `BufferSource` accepts in every browser and TS lib).
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** First non-empty value of a column, for the mapping table (phones masked, long text cut). */
export function columnExample(rows: readonly CsvRow[], column: number, target: ImportTarget): string {
  for (const row of rows.slice(0, 50)) {
    const value = (row.cells[column] ?? "").trim();
    if (!value) continue;
    if (target === "phone" || /\d{6,}/.test(value)) return maskDigits(value);
    return value.length > 40 ? `${value.slice(0, 39)}…` : value;
  }
  return "";
}

/** Keeps the first 2 and last 3 digits of a long digit run: `+91 98•••••210`. */
export function maskDigits(value: string): string {
  return value.replace(/\d{6,}/g, (run) => `${run.slice(0, 2)}${"•".repeat(run.length - 5)}${run.slice(-3)}`);
}

export type PreviewCountKey =
  | "created"
  | "attached"
  | "lost"
  | "already_imported"
  | "erased_family"
  | "duplicate_in_file"
  | "invalid"
  | "consent_mismatch"
  | "damaged"
  | "unknownPlace";

export interface PreviewTotals {
  counts: Record<PreviewCountKey, number>;
  /** New families per area id (`""` = no area). Only when the server could check places. */
  byArea: { areaId: string; count: number }[];
  placeChecked: boolean;
  /** Rows the import would send to capture (new + known families). */
  importable: number;
}

const ZERO: Record<PreviewCountKey, number> = {
  created: 0,
  attached: 0,
  lost: 0,
  already_imported: 0,
  erased_family: 0,
  duplicate_in_file: 0,
  invalid: 0,
  consent_mismatch: 0,
  damaged: 0,
  unknownPlace: 0,
};

function countKey(status: ImportRowStatus): PreviewCountKey {
  return status === "invalid_phone" || status === "missing_phone" ? "invalid" : status;
}

/** Row number → E.164 phone of the rows sent, so the preview can spot one family on several rows. */
export function phonesByRow(rows: readonly ImportRowInput[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const row of rows) {
    const phone = normalizePhoneE164(row.phone ?? null);
    if (phone) out.set(row.row, phone);
  }
  return out;
}

/**
 * Totals of the dry run. Each chunk is checked on its own, so a phone that already counted as a
 * new family in an earlier chunk is counted as `attached` here (the import creates it once).
 */
export function previewTotals(
  rows: readonly ImportPreviewRow[],
  local: readonly { row: number; status: ImportRowStatus }[],
  phones: ReadonlyMap<number, string> = new Map(),
): PreviewTotals {
  const counts = { ...ZERO };
  const areas = new Map<string, number>();
  const newPhones = new Set<string>();
  let placeChecked = false;
  for (const preview of rows) {
    const phone = phones.get(preview.row);
    const repeat = preview.status === "created" && phone !== undefined && newPhones.has(phone);
    const row: ImportPreviewRow = repeat ? { ...preview, status: "attached" } : preview;
    if (row.status === "created" && phone !== undefined) newPhones.add(phone);
    counts[countKey(row.status)]++;
    if (row.lost) counts.lost++;
    if (row.status === "created") {
      if (row.place !== null) placeChecked = true;
      if (row.place !== null && row.place !== "area") counts.unknownPlace++;
      const key = row.areaId ?? "";
      areas.set(key, (areas.get(key) ?? 0) + 1);
    }
  }
  for (const row of local) counts[countKey(row.status)]++;
  const byArea = placeChecked
    ? [...areas.entries()].map(([areaId, count]) => ({ areaId, count })).sort((a, b) => b.count - a.count || a.areaId.localeCompare(b.areaId))
    : [];
  return { counts, byArea, placeChecked, importable: counts.created + counts.attached };
}

export interface ProblemRow {
  row: number;
  status: ImportRowStatus;
  phoneMasked: string | null;
}

/** Rows that will not become (or join) a lead, in file order. */
export function problemRows(rows: readonly { row: number; status: ImportRowStatus; phoneMasked?: string | null }[], local: readonly { row: number; status: ImportRowStatus }[]): ProblemRow[] {
  return [
    ...rows.filter((r) => r.status !== "created" && r.status !== "attached").map((r) => ({ row: r.row, status: r.status, phoneMasked: r.phoneMasked ?? null })),
    ...local.map((r) => ({ row: r.row, status: r.status, phoneMasked: null })),
  ].sort((a, b) => a.row - b.row);
}

export interface ResultTotals {
  created: number;
  attached: number;
  skipped: number;
  invalid: number;
  /** One entry per lost family that appeared again, with every file row it appeared on. */
  lost: { leadId: string; rows: number[] }[];
}

/**
 * What the import did. The counts are the server's batch counters (exact even when a chunk was
 * re-sent after a lost answer), plus the in-file repeats the browser never sent. The lost families
 * come from the row answers, re-sent chunks included, one entry per family.
 */
export function resultTotals(
  batch: Pick<ImportBatchSummary, "created" | "attached" | "skipped" | "invalid">,
  results: readonly ImportRowResult[],
  local: readonly { row: number; status: ImportRowStatus }[],
): ResultTotals {
  const lost = new Map<string, Set<number>>();
  for (const result of results) {
    if (!result.lostLeadId) continue;
    const rows = lost.get(result.lostLeadId) ?? new Set<number>();
    rows.add(result.row);
    lost.set(result.lostLeadId, rows);
  }
  return {
    created: batch.created,
    attached: batch.attached,
    skipped: batch.skipped + local.filter((r) => r.status === "duplicate_in_file").length,
    invalid: batch.invalid,
    lost: [...lost.entries()]
      .map(([leadId, rows]) => ({ leadId, rows: [...rows].sort((a, b) => a - b) }))
      .sort((a, b) => a.rows[0] - b.rows[0] || a.leadId.localeCompare(b.leadId)),
  };
}

/** What the damage banner says: blocked number rows, garbled-text rows. */
export function damageNotice(rows: readonly ImportRowInput[]): { excel: boolean; numberRows: number; textRows: number } {
  const counts = damageSummary(rows);
  const numberKinds: DamageKind[] = ["phone_sci", "id_sci", "id_truncated"];
  return {
    excel: wentThroughExcel(counts),
    numberRows: rows.filter((r) => r.damaged?.some((kind) => numberKinds.includes(kind))).length,
    textRows: rows.filter((r) => r.damaged?.includes("text_mojibake") && !r.damaged.some((kind) => numberKinds.includes(kind))).length,
  };
}

/** "lahaul-spiti" → "Lahaul Spiti" when no area name was given to the page. */
export function areaLabel(areaId: string, names: Readonly<Record<string, string>>, noArea: string): string {
  if (!areaId) return noArea;
  return names[areaId] ?? areaId.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
