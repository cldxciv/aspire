/**
 * Question rich text (owner: QB-CORE-A; §B5, §B12). Pure and client-safe.
 *
 * Stored text is plain Unicode with exactly three kinds of markup:
 * - math in `\( … \)` (inline) and `\[ … \]` (display) — KaTeX, with mhchem's `\ce{}` for chemistry;
 * - figure placeholders `[[figure:N]]` (1-based, the N-th figure of the field's slot);
 * - pipe tables (two or more consecutive lines that start and end with `|`, e.g. List-I / List-II).
 * Nothing else is markup: `$…$` is NOT math (imports convert it with `normaliseDollarMath`), and a
 * literal dollar is written `\$`. Text is always escaped when rendered (React text nodes, or
 * `escapeHtml` in `renderRichTextToHtml`).
 */

export const RICH_TEXT_LIMITS = {
  /** Characters per stored field (stem, option, solution, per language). */
  fieldChars: 8000,
  /** Characters per math segment. */
  mathChars: 1000,
  /** Math segments per field; later ones render as plain text. */
  mathSegments: 100,
} as const;

export type RichInline =
  | { kind: "text"; text: string }
  | { kind: "math"; tex: string; display: boolean }
  | { kind: "figure"; index: number };

export interface RichTable {
  kind: "table";
  /** Header row (when a `|---|` separator line follows it), else null. */
  header: RichInline[][] | null;
  rows: RichInline[][][];
}

export type RichSegment = RichInline | RichTable;

interface ParseContext {
  math: number;
}

const FIGURE_TOKEN = /^\[\[figure:(\d{1,2})\]\]/;
const TABLE_SEPARATOR_CELL = /^\s*:?-{3,}:?\s*$/;

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 2 && trimmed.startsWith("|") && trimmed.endsWith("|");
}

function splitCells(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.slice(1, -1);
  // Split on "|" that is not escaped and not inside \( … \).
  const cells: string[] = [];
  let current = "";
  let inMath = false;
  for (let i = 0; i < inner.length; i += 1) {
    const two = inner.slice(i, i + 2);
    if (!inMath && two === "\\(") {
      inMath = true;
      current += two;
      i += 1;
      continue;
    }
    if (inMath && two === "\\)") {
      inMath = false;
      current += two;
      i += 1;
      continue;
    }
    if (two === "\\|") {
      current += "|";
      i += 1;
      continue;
    }
    if (!inMath && inner[i] === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += inner[i];
  }
  cells.push(current.trim());
  return cells;
}

function unescapeText(text: string): string {
  return text.replace(/\\\$/g, "$");
}

function pushText(out: RichInline[], text: string): void {
  if (text.length === 0) return;
  const last = out[out.length - 1];
  if (last && last.kind === "text") last.text += text;
  else out.push({ kind: "text", text });
}

function parseInline(source: string, ctx: ParseContext): RichInline[] {
  const out: RichInline[] = [];
  let i = 0;
  let textStart = 0;
  const flushText = (end: number) => pushText(out, unescapeText(source.slice(textStart, end)));
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "\\(" || two === "\\[") {
      const display = two === "\\[";
      const close = display ? "\\]" : "\\)";
      const end = source.indexOf(close, i + 2);
      if (end === -1) {
        i += 2; // unclosed: stays text
        continue;
      }
      const tex = source.slice(i + 2, end);
      flushText(i);
      if (tex.length > RICH_TEXT_LIMITS.mathChars || ctx.math >= RICH_TEXT_LIMITS.mathSegments || tex.trim() === "") {
        pushText(out, source.slice(i, end + 2));
      } else {
        ctx.math += 1;
        out.push({ kind: "math", tex, display });
      }
      i = end + 2;
      textStart = i;
      continue;
    }
    if (two === "\\$") {
      i += 2;
      continue;
    }
    if (source[i] === "[" && source[i + 1] === "[") {
      const match = FIGURE_TOKEN.exec(source.slice(i));
      if (match) {
        flushText(i);
        out.push({ kind: "figure", index: Number(match[1]) });
        i += match[0].length;
        textStart = i;
        continue;
      }
    }
    i += 1;
  }
  flushText(source.length);
  return out;
}

/** Parses stored rich text into segments (text, math, figures, tables). Never throws. */
export function parseRichText(text: string): RichSegment[] {
  const source = (text ?? "").slice(0, RICH_TEXT_LIMITS.fieldChars).replace(/\r\n?/g, "\n");
  const ctx: ParseContext = { math: 0 };
  const lines = source.split("\n");
  const segments: RichSegment[] = [];
  let buffer: string[] = [];
  const flushBuffer = (trailingNewline: boolean) => {
    if (buffer.length === 0) return;
    const inline = parseInline(buffer.join("\n") + (trailingNewline ? "\n" : ""), ctx);
    for (const piece of inline) {
      const last = segments[segments.length - 1];
      if (piece.kind === "text" && last && last.kind === "text") last.text += piece.text;
      else segments.push(piece);
    }
    buffer = [];
  };
  let i = 0;
  while (i < lines.length) {
    let j = i;
    while (j < lines.length && isTableLine(lines[j])) j += 1;
    if (j - i >= 2) {
      flushBuffer(false);
      const tableLines = lines.slice(i, j);
      const parsed = tableLines.map(splitCells);
      let header: RichInline[][] | null = null;
      let body = parsed;
      if (parsed.length >= 2 && parsed[1].every((cell) => TABLE_SEPARATOR_CELL.test(cell))) {
        header = parsed[0].map((cell) => parseInline(cell, ctx));
        body = parsed.slice(2);
      }
      segments.push({ kind: "table", header, rows: body.map((row) => row.map((cell) => parseInline(cell, ctx))) });
      i = j;
      continue;
    }
    buffer.push(lines[i]);
    i += 1;
  }
  flushBuffer(false);
  return segments;
}

// ---------------------------------------------------------------------------------------------
// Issues (staff editor, imports)

export type RichTextIssueCode =
  | "too_long"
  | "unclosed_math"
  | "math_too_long"
  | "too_many_math"
  | "dollar_math"
  | "figure_missing"
  | "table_ragged";

export interface RichTextIssue {
  code: RichTextIssueCode;
  detail?: string;
}

function countUnescapedDollars(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\\" && text[i + 1] === "$") {
      i += 1;
      continue;
    }
    if (text[i] === "$") count += 1;
  }
  return count;
}

/** Structural problems in a stored field (KaTeX compile errors are checked on the server: math-check.ts). */
export function richTextIssues(text: string, options: { figureCount?: number } = {}): RichTextIssue[] {
  const issues: RichTextIssue[] = [];
  const source = text ?? "";
  if (source.length > RICH_TEXT_LIMITS.fieldChars) issues.push({ code: "too_long", detail: String(source.length) });
  // Delimiter balance outside of completed math segments.
  let i = 0;
  let mathCount = 0;
  let outside = "";
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "\\(" || two === "\\[") {
      const close = two === "\\(" ? "\\)" : "\\]";
      const end = source.indexOf(close, i + 2);
      if (end === -1) {
        issues.push({ code: "unclosed_math", detail: two });
        outside += source.slice(i + 2);
        break;
      }
      const tex = source.slice(i + 2, end);
      mathCount += 1;
      if (tex.length > RICH_TEXT_LIMITS.mathChars) issues.push({ code: "math_too_long", detail: String(tex.length) });
      i = end + 2;
      continue;
    }
    if (two === "\\)" || two === "\\]") {
      issues.push({ code: "unclosed_math", detail: two });
      i += 2;
      continue;
    }
    outside += source[i];
    i += 1;
  }
  if (mathCount > RICH_TEXT_LIMITS.mathSegments) issues.push({ code: "too_many_math", detail: String(mathCount) });
  if (countUnescapedDollars(outside) >= 2) issues.push({ code: "dollar_math" });
  if (options.figureCount !== undefined) {
    for (const match of source.matchAll(/\[\[figure:(\d{1,2})\]\]/g)) {
      const index = Number(match[1]);
      if (index < 1 || index > options.figureCount) issues.push({ code: "figure_missing", detail: String(index) });
    }
  }
  for (const segment of parseRichText(source)) {
    if (segment.kind !== "table") continue;
    const widths = new Set([...(segment.header ? [segment.header.length] : []), ...segment.rows.map((row) => row.length)]);
    if (widths.size > 1) issues.push({ code: "table_ragged" });
  }
  return issues;
}

/** `[[figure:N]]` indices referenced by a field (1-based). */
export function figureIndicesIn(text: string): number[] {
  return [...(text ?? "").matchAll(/\[\[figure:(\d{1,2})\]\]/g)].map((m) => Number(m[1]));
}

// ---------------------------------------------------------------------------------------------
// `$…$` → `\(…\)` at import

/**
 * Turns paired `$…$` into `\(…\)` and `$$…$$` into `\[…\]`, leaving existing `\(…\)` / `\[…\]` and every
 * escaped `\$` untouched (an escaped dollar stays `\$`, a literal dollar). Inline pairs follow pandoc's
 * rule so currency like "$5 and $6" is not math: the opening `$` needs a non-space after it, the closing
 * `$` a non-space before it and no digit after it, and an inline pair never spans a line break.
 * Idempotent.
 */
export function normaliseDollarMath(text: string): string {
  const source = text ?? "";
  let out = "";
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "\\$") {
      out += two;
      i += 2;
      continue;
    }
    if (two === "\\(" || two === "\\[") {
      const close = two === "\\(" ? "\\)" : "\\]";
      const end = source.indexOf(close, i + 2);
      if (end !== -1) {
        out += source.slice(i, end + 2);
        i = end + 2;
        continue;
      }
      out += two;
      i += 2;
      continue;
    }
    if (two === "$$") {
      const end = findUnescaped(source, "$$", i + 2);
      if (end !== -1 && source.slice(i + 2, end).trim() !== "") {
        out += `\\[${source.slice(i + 2, end).trim()}\\]`;
        i = end + 2;
        continue;
      }
      out += two;
      i += 2;
      continue;
    }
    if (source[i] === "$") {
      const end = findInlineClose(source, i + 1);
      if (end !== -1) {
        out += `\\(${source.slice(i + 1, end)}\\)`;
        i = end + 1;
        continue;
      }
    }
    out += source[i];
    i += 1;
  }
  return out;
}

function findUnescaped(source: string, token: string, from: number): number {
  let i = from;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source.startsWith(token, i)) return i;
    i += 1;
  }
  return -1;
}

function findInlineClose(source: string, from: number): number {
  const first = source[from];
  if (first === undefined || /\s/.test(first) || first === "$") return -1;
  let i = from;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") return -1;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "$") {
      const before = source[i - 1];
      const after = source[i + 1];
      if (i > from && before !== undefined && !/\s/.test(before) && !(after !== undefined && /\d/.test(after))) return i;
      return -1;
    }
    i += 1;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------
// Plain text and HTML

/** Plain text for search and comparisons: math reduced to its symbols and words, figures dropped. */
export function plainTextOf(text: string): string {
  const parts: string[] = [];
  const add = (inline: RichInline[]) => {
    for (const piece of inline) {
      if (piece.kind === "text") parts.push(piece.text);
      else if (piece.kind === "math")
        parts.push(
          piece.tex
            .replace(/\\[a-zA-Z]+/g, " ")
            .replace(/[{}^_\\]/g, " ")
            .trim(),
        );
    }
  };
  for (const segment of parseRichText(text)) {
    if (segment.kind === "table") {
      if (segment.header) segment.header.forEach(add);
      segment.rows.forEach((row) => row.forEach(add));
    } else add([segment]);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

export interface RichHtmlOptions {
  /** Renders one math segment to SAFE HTML (KaTeX with trust: false); default: the escaped source. */
  renderMath?: (tex: string, display: boolean) => string;
  /** HTML for figure N (1-based); default: nothing. The caller escapes anything it interpolates. */
  renderFigure?: (index: number) => string;
}

function inlineHtml(inline: RichInline[], options: RichHtmlOptions): string {
  return inline
    .map((piece) => {
      if (piece.kind === "text") return escapeHtml(piece.text).replace(/\n/g, "<br>");
      if (piece.kind === "figure") return options.renderFigure ? options.renderFigure(piece.index) : "";
      if (options.renderMath) return options.renderMath(piece.tex, piece.display);
      const delimiters = piece.display ? ["\\[", "\\]"] : ["\\(", "\\)"];
      return `<span class="qb-math-source">${escapeHtml(delimiters[0] + piece.tex + delimiters[1])}</span>`;
    })
    .join("");
}

/** Escaped HTML for print views and server-rendered previews. Text is always escaped. */
export function renderRichTextToHtml(text: string, options: RichHtmlOptions = {}): string {
  return parseRichText(text)
    .map((segment) => {
      if (segment.kind !== "table") return inlineHtml([segment], options);
      const head = segment.header
        ? `<thead><tr>${segment.header.map((cell) => `<th>${inlineHtml(cell, options)}</th>`).join("")}</tr></thead>`
        : "";
      const body = segment.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell, options)}</td>`).join("")}</tr>`)
        .join("");
      return `<table class="qb-table">${head}<tbody>${body}</tbody></table>`;
    })
    .join("");
}
