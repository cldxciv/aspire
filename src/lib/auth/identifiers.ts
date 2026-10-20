/**
 * Login id and display-name rules shared by the APIs, the admin tools and the scripts.
 * Pure functions, no imports (scripts load this file through Node type stripping).
 */

/** 3–64 characters: lower-case letters, digits and `. _ - @`, starting with a letter or digit. */
export const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._@-]{2,63}$/;
export const LOGIN_ID_RULES = "3–64 characters: letters, digits and . _ - @ (starting with a letter or digit).";

export const DISPLAY_NAME_MAX_LENGTH = 100;

/** Trimmed, NFKC-normalised, lower case. Login ids are case-insensitive. */
export function normalizeLoginId(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export function isValidLoginId(loginId: string): boolean {
  return LOGIN_ID_PATTERN.test(loginId);
}

/**
 * C0/C1 controls and line/paragraph separators. A code-point check rather than a regex
 * literal: the bundler re-emits ` ` escapes inside regex literals as raw line
 * separators, which breaks the compiled file.
 */
function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

/** Trimmed, inner whitespace collapsed. */
export function normalizeDisplayName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function isValidDisplayName(name: string): boolean {
  return name.length >= 1 && Array.from(name).length <= DISPLAY_NAME_MAX_LENGTH && !hasControlCharacter(name);
}
