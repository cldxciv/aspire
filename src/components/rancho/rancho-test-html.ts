/**
 * Test helpers for server-rendered Rancho markup (used by the *.test.ts files here and in
 * src/components/ask; not imported by app code).
 */

/** Escapes text the way React's server renderer does in attributes and text. */
export const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

/**
 * The markup of the first element whose opening tag matches `open`, up to its matching closing tag
 * (counts nested elements of the same tag; enough for React's well-formed output).
 */
export function elementHtml(html: string, open: RegExp, tag: string): string {
  const start = html.search(open);
  if (start < 0) return "";
  let depth = 0;
  const pattern = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  pattern.lastIndex = start;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  return "";
}

/** Visible / accessible text: tags and the mascot SVG's <style> removed, whitespace collapsed. */
export const textOf = (html: string) =>
  html
    .replace(/<style>[^<]*<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
