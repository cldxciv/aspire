/**
 * Leaderboard nicknames (D-034): pseudonymous, chosen by the student, never a login id. Pure and
 * client-safe so the form and the API apply the same rules.
 */

export const NICKNAME = { min: 2, max: 20 } as const;

export type NicknameIssue = "length" | "characters" | "contact" | "reserved";

const ALLOWED = /^[\p{L}\p{M}\p{N} ._-]+$/u;
/** Five or more digits looks like a phone number, roll number or login id. */
const MANY_DIGITS = /(?:\p{N}.*){5,}/u;
const RESERVED = /aspire|admin|teacher|faculty|official|moderator/i;

/** Trims and collapses inner whitespace. */
export function normaliseNickname(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ");
}

/** Letters and digits only, lower case: "Dev.Student 1" and "dev_student1" compare equal. */
function squash(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** True when the nickname contains the account's login id (ignoring case, spaces and `._-@`). */
export function containsLoginId(nickname: string, loginId: string | null | undefined): boolean {
  const id = squash(loginId ?? "");
  return id.length > 0 && squash(nickname).includes(id);
}

/**
 * `null` when the nickname is acceptable, else the first problem found. Pass the signed-in
 * account's `loginId` (server side) so a login id is never shown on the leaderboard (D-034).
 */
export function nicknameIssue(raw: string, options: { loginId?: string | null } = {}): NicknameIssue | null {
  const name = normaliseNickname(raw);
  const length = [...name].length;
  if (length < NICKNAME.min || length > NICKNAME.max) return "length";
  if (!ALLOWED.test(name)) return "characters";
  if (MANY_DIGITS.test(name) || containsLoginId(name, options.loginId)) return "contact";
  if (RESERVED.test(name)) return "reserved";
  return null;
}

/** "First name + initial" from an account display name, or `null` if that is not a valid nickname. */
export function suggestNickname(displayName: string | null | undefined, loginId?: string | null): string | null {
  const parts = normaliseNickname(displayName ?? "")
    .split(" ")
    .filter((part) => /^\p{L}/u.test(part));
  if (parts.length === 0) return null;
  const first = [...parts[0]].slice(0, NICKNAME.max - 3).join("");
  const initial = parts.length > 1 ? ` ${[...parts[parts.length - 1]][0].toLocaleUpperCase("en-IN")}.` : "";
  const suggestion = `${first}${initial}`;
  return nicknameIssue(suggestion, { loginId }) === null ? suggestion : null;
}
