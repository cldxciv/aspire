/**
 * A tiny, whitelist-only Markdown parser for Ask Aspire answers (client-safe, no dependencies).
 *
 * It turns model text into a small tree that `AnswerContent` renders with React elements, so
 * every character of model output ends up as escaped text: there is no HTML pass-through and no
 * `dangerouslySetInnerHTML`. Supported: `#`–`####` headings, numbered and `-`/`*`/`•` lists,
 * paragraphs (single newlines kept as line breaks), fenced code blocks, `---` rules,
 * **bold**, *italic*, `inline code` and simple superscripts (x^2, x^(n+1)). A paragraph that
 * starts with **Final answer:** (or the Hindi **अंतिम उत्तर:**) is marked for highlighting.
 * Anything else is shown as plain text.
 */

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "sup"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] };

/** One line of a paragraph or list item. */
export type InlineLine = InlineNode[];

export type BlockNode =
  | { type: "heading"; level: 3 | 4; content: InlineLine }
  | { type: "paragraph"; lines: InlineLine[]; final: boolean }
  | { type: "list"; ordered: boolean; start: number; items: InlineLine[][] }
  | { type: "code"; value: string }
  | { type: "rule" };

const FINAL_ANSWER = /^\s*\*\*\s*(final answer|answer|अंतिम उत्तर|उत्तर)\s*[:：]?/i;
// Linear: no lazy group followed by optional runs (the old `(.*?)\s*#*\s*$` backtracked
// cubically on a heading followed by thousands of spaces and froze the tab, QA-SEC-M6).
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const ORDERED = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const UNORDERED = /^\s{0,3}[-*•]\s+(.*)$/;
const FENCE = /^\s{0,3}```/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char);

/** Heading text without trailing spaces or a closing `#` run (only when it follows a space). */
export function headingText(raw: string): string {
  let end = raw.length;
  while (end > 0 && isSpace(raw[end - 1])) end -= 1;
  let hashes = end;
  while (hashes > 0 && raw[hashes - 1] === "#") hashes -= 1;
  if (hashes < end && (hashes === 0 || isSpace(raw[hashes - 1]))) {
    end = hashes;
    while (end > 0 && isSpace(raw[end - 1])) end -= 1;
  }
  return raw.slice(0, end);
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

function pushText(out: InlineNode[], value: string) {
  if (!value) return;
  const last = out[out.length - 1];
  if (last && last.type === "text") last.value += value;
  else out.push({ type: "text", value });
}

/** Superscripts in plain text: x^2, x^-1, e^(iπ) → sup. Everything else stays text. */
function parseSuperscripts(text: string, out: InlineNode[]) {
  const pattern = /\^(\([^()\n]{1,24}\)|-?[0-9A-Za-z]{1,8})/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    pushText(out, text.slice(last, at));
    const raw = match[1];
    out.push({ type: "sup", value: raw.startsWith("(") ? raw.slice(1, -1) : raw });
    last = at + match[0].length;
  }
  pushText(out, text.slice(last));
}

/** *italic* (no spaces just inside the stars, so "2 * 3 * 4" stays as it is). */
function parseEmphasis(text: string, out: InlineNode[]) {
  const pattern = /\*(?=\S)([^*\n]*?\S)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    parseSuperscripts(text.slice(last, at), out);
    const children: InlineNode[] = [];
    parseSuperscripts(match[1], children);
    out.push({ type: "em", children });
    last = at + match[0].length;
  }
  parseSuperscripts(text.slice(last), out);
}

/** **bold** spans, then italics and superscripts inside and around them. */
function parseStrong(text: string, out: InlineNode[]) {
  const pattern = /\*\*(?=\S)([^\n]*?\S)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    parseEmphasis(text.slice(last, at), out);
    const children: InlineNode[] = [];
    parseEmphasis(match[1], children);
    out.push({ type: "strong", children });
    last = at + match[0].length;
  }
  parseEmphasis(text.slice(last), out);
}

/** Inline code first (its content is literal), then bold / italic / superscript. */
export function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  const pattern = /`([^`\n]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    parseStrong(text.slice(last, at), out);
    out.push({ type: "code", value: match[1] });
    last = at + match[0].length;
  }
  parseStrong(text.slice(last), out);
  return out;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export function parseAnswer(source: string): BlockNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      type: "paragraph",
      lines: paragraph.map((line) => parseInline(line.trim())),
      final: FINAL_ANSWER.test(paragraph[0]),
    });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({
      type: "list",
      ordered: list.ordered,
      start: list.start,
      items: list.items.map((item) => item.map((line) => parseInline(line.trim()))),
    });
    list = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (FENCE.test(line)) {
      flushParagraph();
      flushList();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      const value = code.join("\n").replace(/\s+$/, "");
      if (value) blocks.push({ type: "code", value });
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      // A blank line inside a list only ends it if the next line is not another item.
      const next = lines.slice(i + 1).find((candidate) => candidate.trim() !== "");
      if (list && !(next && (ORDERED.test(next) || UNORDERED.test(next)))) flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length <= 2 ? 3 : 4, content: parseInline(headingText(heading[2])) });
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "rule" });
      continue;
    }

    const ordered = ORDERED.exec(line);
    const unordered = ordered ? null : UNORDERED.exec(line);
    if (ordered || unordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (list && list.ordered !== isOrdered) flushList();
      if (!list) list = { ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items: [] };
      list.items.push([ordered ? ordered[2] : (unordered as RegExpExecArray)[1]]);
      continue;
    }

    if (list) {
      // Indented or wrapped text continues the current list item.
      list.items[list.items.length - 1].push(line);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Plain text of the answer (for "Copy answer"): Markdown markers removed. */
export function answerPlainText(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/^\s{0,3}```.*$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
