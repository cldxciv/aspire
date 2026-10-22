/**
 * CSV import, step 2 (LR-IMPORT, docs/lead-routing-plan.md §17): text → header + rows, in the
 * browser. A character state machine (RFC 4180): quoted cells, `""` inside quotes, CRLF / LF / CR
 * line ends, and a delimiter sniffed from the header line (`,`, tab or `;`, counted outside
 * quotes). Cells are trimmed; rows whose cells are all empty are dropped. No regular expressions
 * run over the file (nothing can backtrack). Pure and client-safe.
 */

export type CsvDelimiter = "," | "\t" | ";";

/** File limits (§17). Checked while parsing, so an oversized file stops early. */
export const CSV_LIMITS = {
  maxRows: 5000,
  maxColumns: 60,
  maxCellLength: 2000,
} as const;

export type CsvIssue =
  | "empty" // no header line
  | "too_many_rows" // more than maxRows data rows
  | "too_many_columns" // a row wider than maxColumns
  | "cell_too_long" // a cell longer than maxCellLength
  | "unterminated_quote"; // the file ends inside a quoted cell

export interface CsvRow {
  /** Spreadsheet row number: the header is row 1, so the first data row is 2. */
  row: number;
  cells: string[];
}

export type ParsedCsv =
  | { ok: true; delimiter: CsvDelimiter; header: string[]; rows: CsvRow[] }
  | { ok: false; issue: CsvIssue; row?: number };

const QUOTE = 34; // "
const CR = 13;
const LF = 10;

/**
 * Picks the delimiter that occurs most often outside quotes on the first line (ties: tab, then
 * semicolon, then comma; none → comma). Excel's `sep=;` first line is honoured.
 */
export function sniffDelimiter(text: string): CsvDelimiter {
  const sep = explicitSeparator(text);
  if (sep) return sep.delimiter;
  let inQuotes = false;
  let comma = 0;
  let tab = 0;
  let semi = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === QUOTE) {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (c === LF || c === CR) break;
    if (c === 44) comma++;
    else if (c === 9) tab++;
    else if (c === 59) semi++;
  }
  if (tab > 0 && tab >= comma && tab >= semi) return "\t";
  if (semi > 0 && semi > comma) return ";";
  return ",";
}

/** Excel writes `sep=;` as the first line of some exports; returns it and where the data starts. */
function explicitSeparator(text: string): { delimiter: CsvDelimiter; skip: number } | null {
  if (text.length < 5 || text.slice(0, 4).toLowerCase() !== "sep=") return null;
  const ch = text[4];
  const delimiter: CsvDelimiter | null = ch === "," ? "," : ch === ";" ? ";" : ch === "\t" ? "\t" : null;
  if (!delimiter) return null;
  let skip = 5;
  if (text.charCodeAt(skip) === CR) skip++;
  if (text.charCodeAt(skip) === LF) skip++;
  return skip === 5 && skip < text.length ? null : { delimiter, skip };
}

/**
 * Parses the whole file. The first non-empty record is the header. Limits from `CSV_LIMITS`
 * (overridable for tests). Never throws.
 */
export function parseCsv(
  input: string,
  options: { delimiter?: CsvDelimiter; maxRows?: number; maxColumns?: number; maxCellLength?: number } = {},
): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const sep = explicitSeparator(text);
  const delimiter = options.delimiter ?? sep?.delimiter ?? sniffDelimiter(text);
  const maxRows = options.maxRows ?? CSV_LIMITS.maxRows;
  const maxColumns = options.maxColumns ?? CSV_LIMITS.maxColumns;
  const maxCellLength = options.maxCellLength ?? CSV_LIMITS.maxCellLength;
  const delimiterCode = delimiter.charCodeAt(0);

  const state: {
    header: string[] | null;
    rows: CsvRow[];
    record: string[];
    cell: string;
    quoted: boolean; // the current cell started with a quote
    records: number; // records seen so far (= spreadsheet row of the last one)
    issue: { issue: CsvIssue; row?: number } | null;
  } = { header: null, rows: [], record: [], cell: "", quoted: false, records: 0, issue: null };

  const pushCell = (): boolean => {
    const value = state.cell.trim();
    if (value.length > maxCellLength) {
      state.issue = { issue: "cell_too_long", row: state.records + 1 };
      return false;
    }
    state.record.push(value);
    if (state.record.length > maxColumns) {
      state.issue = { issue: "too_many_columns", row: state.records + 1 };
      return false;
    }
    state.cell = "";
    state.quoted = false;
    return true;
  };

  const pushRecord = (): boolean => {
    const record = state.record;
    state.record = [];
    const empty = record.every((value) => value === "");
    if (empty) {
      // Blank lines before the header do not count; after it they keep the spreadsheet numbering.
      if (state.header !== null) state.records++;
      return true;
    }
    state.records++;
    if (state.header === null) {
      state.header = record;
      return true;
    }
    if (state.rows.length >= maxRows) {
      state.issue = { issue: "too_many_rows" };
      return false;
    }
    state.rows.push({ row: state.records, cells: record });
    return true;
  };

  let inQuotes = false;
  let i = sep ? sep.skip : 0;
  const length = text.length;
  while (i < length) {
    const c = text.charCodeAt(i);
    if (inQuotes) {
      if (c === QUOTE) {
        if (text.charCodeAt(i + 1) === QUOTE) {
          state.cell += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
        continue;
      }
      // Copy a run of quoted characters (newlines included) at once.
      let j = i + 1;
      while (j < length && text.charCodeAt(j) !== QUOTE) j++;
      state.cell += text.slice(i, j);
      if (state.cell.length > maxCellLength) {
        state.issue = { issue: "cell_too_long", row: state.records + 1 };
        break;
      }
      i = j;
      continue;
    }
    if (c === QUOTE) {
      if (!state.quoted && state.cell.trim() === "") {
        // A quote opens a quoted cell only at its start (leading spaces allowed).
        inQuotes = true;
        state.quoted = true;
        state.cell = "";
      } else {
        // A stray quote inside an unquoted cell, or after a closing quote, is literal text.
        state.cell += '"';
      }
      i++;
      continue;
    }
    if (c === delimiterCode) {
      if (!pushCell()) break;
      i++;
      continue;
    }
    if (c === LF || c === CR) {
      if (!pushCell() || !pushRecord()) break;
      i += c === CR && text.charCodeAt(i + 1) === LF ? 2 : 1;
      continue;
    }
    // A run of plain characters.
    let j = i + 1;
    while (j < length) {
      const d = text.charCodeAt(j);
      if (d === delimiterCode || d === LF || d === CR || d === QUOTE) break;
      j++;
    }
    state.cell += text.slice(i, j);
    if (state.cell.length > maxCellLength + 64) {
      state.issue = { issue: "cell_too_long", row: state.records + 1 };
      break;
    }
    i = j;
  }

  if (!state.issue && inQuotes) return { ok: false, issue: "unterminated_quote", row: state.records + 1 };
  if (!state.issue && (state.cell !== "" || state.quoted || state.record.length > 0)) {
    if (pushCell()) pushRecord();
  }
  if (state.issue) return { ok: false, ...state.issue };
  if (state.header === null) return { ok: false, issue: "empty" };
  return { ok: true, delimiter, header: state.header, rows: state.rows };
}
