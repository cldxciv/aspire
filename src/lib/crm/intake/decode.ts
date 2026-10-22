/**
 * CSV import, step 1 (LR-IMPORT, docs/lead-routing-plan.md §17): file bytes → text, in the
 * browser. Pure and client-safe (no I/O, no Node APIs), so the same code runs in tests.
 *
 * - A BOM wins: UTF-8 (EF BB BF), UTF-16LE (FF FE), UTF-16BE (FE FF).
 * - No BOM: a NUL-byte pattern means UTF-16 (Meta's "CSV" downloads are UTF-16LE with tabs).
 * - Otherwise strict UTF-8 (`fatal: true`); if that fails, windows-1252 with a warning (an
 *   "ANSI" CSV saved by Excel). Hindi text does not survive 1252: those cells arrive as `?`,
 *   which `excel-damage.ts` flags per cell.
 *
 * UTF-16 and windows-1252 are decoded by hand (not `TextDecoder`), because Node without full ICU
 * and some browsers do not support every label; UTF-8 uses the standard decoder.
 */

export type CsvEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

/** `windows_1252`: the file was not valid UTF-8 (Excel "ANSI" CSV); `replacement_chars`: U+FFFD seen. */
export type DecodeWarning = "windows_1252" | "replacement_chars";

export interface DecodedCsv {
  text: string;
  encoding: CsvEncoding;
  bom: boolean;
  warnings: DecodeWarning[];
}

/** Largest file the wizard reads (bytes). 5,000 rows × 60 columns of short Meta answers fit easily. */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

const SNIFF_BYTES = 4096;

/** windows-1252 bytes 0x80–0x9F (WHATWG index); the rest of the range maps to U+0080–U+00FF. */
const CP1252_HIGH: readonly number[] = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

const CHUNK = 8192;

function fromCodes(codes: Uint16Array): string {
  let out = "";
  for (let i = 0; i < codes.length; i += CHUNK) {
    out += String.fromCharCode(...codes.subarray(i, i + CHUNK));
  }
  return out;
}

/** windows-1252 → string (hand-rolled so it works without ICU). */
export function decodeWindows1252(bytes: Uint8Array): string {
  const codes = new Uint16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    codes[i] = b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b;
  }
  return fromCodes(codes);
}

/** UTF-16 → string. An odd trailing byte is dropped (a cut file). Surrogate pairs pass through. */
export function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const units = Math.floor(bytes.length / 2);
  const codes = new Uint16Array(units);
  for (let i = 0; i < units; i++) {
    const a = bytes[2 * i];
    const b = bytes[2 * i + 1];
    codes[i] = littleEndian ? a | (b << 8) : (a << 8) | b;
  }
  return fromCodes(codes);
}

/**
 * UTF-16 without a BOM: in a mostly-ASCII file every other byte is NUL. Looks at the first
 * 4 KB: at least 30 % of the byte pairs must have a NUL in the same position, and almost none in
 * the other.
 */
export function sniffUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const length = Math.min(bytes.length, SNIFF_BYTES) & ~1;
  const pairs = length / 2;
  if (pairs < 2) return null;
  let evenNul = 0;
  let oddNul = 0;
  for (let i = 0; i < length; i += 2) {
    if (bytes[i] === 0) evenNul++;
    if (bytes[i + 1] === 0) oddNul++;
  }
  if (oddNul >= pairs * 0.3 && evenNul <= pairs * 0.05) return "utf-16le";
  if (evenNul >= pairs * 0.3 && oddNul <= pairs * 0.05) return "utf-16be";
  return null;
}

function strictUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

function finish(text: string, encoding: CsvEncoding, bom: boolean, warnings: DecodeWarning[]): DecodedCsv {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (clean.includes("�") && !warnings.includes("replacement_chars")) warnings.push("replacement_chars");
  return { text: clean, encoding, bom, warnings };
}

/** File bytes → text. Never throws. */
export function decodeCsvBytes(input: Uint8Array | ArrayBuffer): DecodedCsv {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const text = strictUtf8(bytes.subarray(3));
    if (text !== null) return finish(text, "utf-8", true, []);
    // A UTF-8 BOM on invalid UTF-8: decode leniently (U+FFFD marks the bad bytes).
    return finish(new TextDecoder("utf-8").decode(bytes.subarray(3)), "utf-8", true, []);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return finish(decodeUtf16(bytes.subarray(2), true), "utf-16le", true, []);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return finish(decodeUtf16(bytes.subarray(2), false), "utf-16be", true, []);
  const utf16 = sniffUtf16(bytes);
  if (utf16) return finish(decodeUtf16(bytes, utf16 === "utf-16le"), utf16, false, []);
  const utf8 = strictUtf8(bytes);
  if (utf8 !== null) return finish(utf8, "utf-8", false, []);
  return finish(decodeWindows1252(bytes), "windows-1252", false, ["windows_1252"]);
}
