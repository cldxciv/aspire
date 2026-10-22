/**
 * Pure text helpers for the hero kit (client-safe, no React). Unit-tested in `hero-data.test.ts`.
 */

/** An owner-to-fill slot such as "[N]", "[YEAR]" or "[Start date]": never rendered on the site. */
const BRACKET_SLOT = /\[[^\]]*\]/;

/**
 * Whether a fact value may be shown: a finite number, or a non-empty string without an
 * owner-to-fill "[…]" slot. Everything in the kit filters with this, so a missing fact is omitted
 * (never estimated, never shown as "[N]").
 */
export function isFilled(value: string | number | null | undefined): value is string | number {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  const text = value.trim();
  return text !== "" && !BRACKET_SLOT.test(text);
}

/**
 * Splits `title` around the first occurrence of `highlight` (the gold phrase):
 * `["Find your nearest ", "Aspire centre", ""]`. `null` when there is no phrase or it is not in
 * the title (the headline then renders plain, so a translation that rewords it never breaks).
 */
export function splitHighlight(title: string, highlight?: string): [string, string, string] | null {
  const phrase = highlight?.trim();
  if (!phrase) return null;
  const at = title.indexOf(phrase);
  if (at < 0) return null;
  return [title.slice(0, at), phrase, title.slice(at + phrase.length)];
}
