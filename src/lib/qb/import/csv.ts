/**
 * CSV for the tabular imports and the template download (docs/question-bank-plan.md §B8.8).
 * RFC 4180 (quoted fields, doubled quotes, CRLF or LF, a leading UTF-8 BOM). Client-safe, no I/O.
 *
 * Formula injection: exported cells that start with `= + - @` (or a tab / CR) get a `'` prefix so
 * a spreadsheet never runs them; on import a `'` before one of those characters is removed again.
 */

export type CsvParse =
  | { ok: true; rows: string[][] }
  | { ok: false; reason: "csv_encoding" | "csv_unterminated_quote" | "csv_too_many_rows" | "csv_cell_too_long" | "csv_too_many_columns" };

export const CSV_MAX_CELL = 10_000;
export const CSV_MAX_COLUMNS = 80;

/** Decodes UTF-8 strictly (a BOM is dropped); null when the bytes are not valid UTF-8. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    return null;
  }
}

/** True for text that looks like CSV: valid UTF-8 and no NUL bytes in the first 8 KB. */
export function looksLikeCsv(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const head = bytes.subarray(0, 8192);
  for (const byte of head) if (byte === 0) return false;
  return decodeUtf8(bytes) !== null;
}

/** Removes the anti-formula `'` the template export adds. */
export function unescapeCell(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/** Parses CSV text. Empty trailing lines are dropped; every cell is trimmed of the `'` guard only. */
export function parseCsv(text: string, maxRows: number): CsvParse {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const pushCell = (): boolean => {
    if (cell.length > CSV_MAX_CELL) return false;
    row.push(unescapeCell(cell));
    cell = "";
    return true;
  };
  const pushRow = (): "ok" | "rows" | "columns" => {
    if (row.length > CSV_MAX_COLUMNS) return "columns";
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
    return rows.length > maxRows ? "rows" : "ok";
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell.length === 0) {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      if (!pushCell()) return { ok: false, reason: "csv_cell_too_long" };
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (!pushCell()) return { ok: false, reason: "csv_cell_too_long" };
      const pushed = pushRow();
      if (pushed === "rows") return { ok: false, reason: "csv_too_many_rows" };
      if (pushed === "columns") return { ok: false, reason: "csv_too_many_columns" };
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (quoted) return { ok: false, reason: "csv_unterminated_quote" };
  if (cell.length > 0 || row.length > 0) {
    if (!pushCell()) return { ok: false, reason: "csv_cell_too_long" };
    const pushed = pushRow();
    if (pushed === "rows") return { ok: false, reason: "csv_too_many_rows" };
    if (pushed === "columns") return { ok: false, reason: "csv_too_many_columns" };
  }
  return { ok: true, rows };
}

/** One exported cell: quoted when needed, `'`-prefixed when it could be read as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV text with CRLF line ends (what spreadsheet programs expect). */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
