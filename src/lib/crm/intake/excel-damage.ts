/**
 * CSV import, step 5 (LR-IMPORT, docs/lead-routing-plan.md §17): finding what Excel did to a
 * Meta Leads Center download. Pure and client-safe.
 *
 * Excel turns long digit strings into numbers: mobile numbers become `9.19877E+11`, 16–17 digit
 * Meta lead ids lose every digit after the 15th (`1.23457E+15`, or `1234567890123450`). Those
 * values cannot be repaired, so the row is blocked (`damaged`) and the wizard shows a banner.
 * Two harmless artefacts are repaired instead: one leading `'` (Excel's "keep as text" marker)
 * and a trailing `.0` on a number. A file saved as "ANSI" loses Hindi text (`????`); a UTF-8
 * file read as 1252 shows mojibake (`à¤¶`). Both are flagged per cell.
 */
import { IMPORT_DAMAGE_KINDS, type ImportDamageKind } from "../lead-ops-types";

/** The §17 damage flags (CORE `lead-ops-types.ts`). */
export const DAMAGE_KINDS = IMPORT_DAMAGE_KINDS;
export type DamageKind = ImportDamageKind;

/** Strips one leading `'` and, from a plain number, a trailing `.0` (or `.00`). Trims first. */
export function stripSpreadsheetArtifacts(value: string): string {
  let out = value.trim();
  if (out.startsWith("'")) out = out.slice(1).trimStart();
  if (isNumberWithZeroDecimals(out)) out = out.slice(0, out.indexOf("."));
  return out;
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

/** `+919876543210.0`, `9876543210.00` → true; `9.5`, `12.0a` → false. */
function isNumberWithZeroDecimals(value: string): boolean {
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return false;
  let start = 0;
  if (value[0] === "+") start = 1;
  if (dot === start) return false;
  for (let i = start; i < dot; i++) if (!isDigit(value.charCodeAt(i))) return false;
  for (let i = dot + 1; i < value.length; i++) if (value[i] !== "0") return false;
  return true;
}

/**
 * Scientific notation as Excel writes it: `9.19877E+11`, `1.23457e+15`, `9E+11`, optionally after
 * a `p:` / `l:` export prefix or a `+`. Written without regular expressions over user text.
 */
export function isScientific(raw: string): boolean {
  let value = raw.trim();
  if (value.startsWith("p:") || value.startsWith("l:")) value = value.slice(2);
  if (value.startsWith("+") || value.startsWith("-")) value = value.slice(1);
  const e = Math.max(value.indexOf("e"), value.indexOf("E"));
  if (e <= 0 || e === value.length - 1) return false;
  const mantissa = value.slice(0, e);
  let exponent = value.slice(e + 1);
  if (exponent.startsWith("+") || exponent.startsWith("-")) exponent = exponent.slice(1);
  if (exponent.length === 0 || exponent.length > 3) return false;
  for (let i = 0; i < exponent.length; i++) if (!isDigit(exponent.charCodeAt(i))) return false;
  let dots = 0;
  let digits = 0;
  for (let i = 0; i < mantissa.length; i++) {
    const c = mantissa.charCodeAt(i);
    if (c === 46) dots++;
    else if (isDigit(c)) digits++;
    else return false;
  }
  return dots <= 1 && digits > 0;
}

/**
 * The digits of an id cell that Excel could have turned into a number: bare digits only. Meta's
 * `l:` export prefix makes the cell text, which Excel never converts (so it is never cut).
 */
function bareIdDigits(raw: string): string | null {
  const value = stripSpreadsheetArtifacts(raw);
  if (value.length === 0) return null;
  for (let i = 0; i < value.length; i++) if (!isDigit(value.charCodeAt(i))) return null;
  return value;
}

function trailingZeros(digits: string): number {
  let n = 0;
  for (let i = digits.length - 1; i >= 0 && digits[i] === "0"; i--) n++;
  return n;
}

const MOJIBAKE_MARKERS = [
  "�", // replacement character: bytes that were not valid in the decoded encoding
  "à¤", // UTF-8 Devanagari (E0 A4 ..) read as windows-1252
  "à¥", // UTF-8 Devanagari (E0 A5 ..)
  "Ã", // UTF-8 Latin-1 supplement read as 1252 (Ã© …)
  "â€", // UTF-8 punctuation (’ “ … –) read as 1252
  "\u00c2\u00a0", // UTF-8 no-break space read as 1252
] as const;

/**
 * Text the file has garbled: only question marks (Hindi saved as "ANSI"), U+FFFD, or the
 * typical UTF-8-read-as-1252 sequences. A lone `?` counts too (a one-letter answer is never `?`).
 */
export function isGarbledText(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0) return false;
  let onlyQuestion = true;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch !== "?" && ch !== " ") {
      onlyQuestion = false;
      break;
    }
  }
  if (onlyQuestion) return true;
  return MOJIBAKE_MARKERS.some((marker) => value.includes(marker));
}

/**
 * Per-cell damage of an id cell: scientific notation (`id_sci`). A cut id cannot be told from a
 * real one on its own (one real 16–17 digit id in 100 ends in "00"), so cut ids are found per
 * column, by `truncatedIdColumn`.
 */
export function idCellDamage(raw: string): DamageKind | null {
  return isScientific(raw) ? "id_sci" : null;
}

/** Per-cell damage of a phone cell. */
export function phoneCellDamage(raw: string): DamageKind | null {
  return isScientific(raw) ? "phone_sci" : null;
}

/**
 * A spreadsheet's fingerprint on a number cell: scientific notation, the leading `'`, or a `.0`
 * on a whole number. It counts as "another Excel sign" for a short id column (`truncatedIdColumn`).
 */
export function hasSpreadsheetArtifacts(raw: string): boolean {
  const value = raw.trim();
  return isScientific(value) || value.startsWith("'") || isNumberWithZeroDecimals(value);
}

/**
 * Lead ids Excel cut, judged by COLUMN (indexes into `ids`). Excel keeps 15 significant digits, so
 * once a file went through it every bare 16–17 digit id ends in 0 ("…00" for 17 digits). One real
 * id in 10 also ends in 0, so a single cell proves nothing:
 * - 3 or more bare 16–17 digit ids: when all of them end in 0, all are cut; when one does not, the
 *   column is real and nothing is flagged (a real id that ends in "00" imports normally);
 * - fewer: an id ending in "00" counts as cut only when the file shows another Excel sign
 *   (`otherExcelSigns`: scientific notation, a stripped `'` or `.0`, an "ANSI" decode).
 * Ids with Meta's `l:` prefix are text to Excel and are never cut.
 */
export function truncatedIdColumn(ids: readonly (string | null)[], { otherExcelSigns = false }: { otherExcelSigns?: boolean } = {}): Set<number> {
  const long: { index: number; digits: string }[] = [];
  ids.forEach((raw, index) => {
    if (raw === null) return;
    const digits = bareIdDigits(raw);
    if (digits && digits.length >= 16 && digits.length <= 17) long.push({ index, digits });
  });
  if (long.length >= 3) return long.every((id) => id.digits.endsWith("0")) ? new Set(long.map((id) => id.index)) : new Set();
  if (!otherExcelSigns) return new Set();
  return new Set(long.filter((id) => trailingZeros(id.digits) >= 2).map((id) => id.index));
}

/**
 * Whether a file shows Excel's fingerprints at all (any scientific id / phone, any cut id): the
 * banner text "This file went through Excel…" is shown when this is true.
 */
export function damageSummary(rows: readonly { damaged?: readonly DamageKind[] }[]): Record<DamageKind, number> {
  const counts: Record<DamageKind, number> = { phone_sci: 0, id_sci: 0, id_truncated: 0, text_mojibake: 0 };
  for (const row of rows) for (const kind of row.damaged ?? []) counts[kind]++;
  return counts;
}

/** True when the Excel banner should show (numbers damaged; garbled text alone has its own note). */
export function wentThroughExcel(counts: Record<DamageKind, number>): boolean {
  return counts.phone_sci + counts.id_sci + counts.id_truncated > 0;
}
