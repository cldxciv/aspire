import { z } from "zod";
import { DISTRICT_IDS } from "@/content/mocktest/districts";
import { MAX_NUMERIC_LENGTH } from "./scoring";

/**
 * Request schemas for the mock-test APIs (client-safe). Unknown keys are dropped (zod's default),
 * so a `score` sent by a browser never reaches the server logic. Field errors carry short CODES
 * (e.g. "characters"); the UI maps them to localised messages.
 */

export const MAX_QUESTIONS = 200;
/** Longest accepted request body for attempts / scoring (bytes). */
export const MOCKTEST_MAX_BODY_BYTES = 16 * 1024;

const TEST_ID = /^[a-z0-9-]{1,64}$/;
const ATTEMPT_ID = /^[A-Za-z0-9_-]{8,64}$/;

const answerSchema = z.union([z.number(), z.string().max(MAX_NUMERIC_LENGTH + 8), z.null()]);

export const scoreBodySchema = z.object({
  testId: z.string().regex(TEST_ID),
  answers: z.array(answerSchema).max(MAX_QUESTIONS),
  timeSpentSec: z.array(z.number().int().min(0).max(24 * 3600)).max(MAX_QUESTIONS).optional(),
});
export type ScoreBody = z.infer<typeof scoreBodySchema>;

/**
 * POST /api/mocktest/score (lead gate, docs/lead-gate-plan.md §5.7). On top of the answers:
 * - `startedAt`: when this browser started the attempt (epoch ms). An attempt started before
 *   LEAD_GATE_SINCE is never gated. A malformed value is ignored, never an error.
 * - `record`: sent only with the FIRST scoring of an attempt (the result page has no score for it
 *   yet), so re-opening a result or printing it never adds a tool-use note.
 * - `seen`: this browser already showed the attempt's result (it keeps a local score). Such a
 *   result is never gated again (data the family already has). A malformed value is ignored.
 * Both `startedAt` and `seen` are the browser's word: the gate on /score is lead capture.
 */
export const scoreRequestSchema = scoreBodySchema.extend({
  startedAt: z.number().int().positive().optional().catch(undefined),
  record: z.literal(true).optional().catch(undefined),
  seen: z.literal(true).optional().catch(undefined),
});
export type ScoreRequest = z.infer<typeof scoreRequestSchema>;

/** Opaque start token from POST /api/mocktest/start (base64url). */
export const START_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * `startedAt` / `submittedAt` are the browser's clock: kept for the student's own record only. The
 * leaderboard uses the server's start (via `startToken`) and save times (QA-SEC-M6 M1).
 */
export const attemptBodySchema = scoreBodySchema.extend({
  attemptId: z.string().regex(ATTEMPT_ID),
  timeSpentSec: z.array(z.number().int().min(0).max(24 * 3600)).max(MAX_QUESTIONS),
  startedAt: z.number().int().positive(),
  submittedAt: z.number().int().positive(),
  startToken: z.string().regex(START_TOKEN).nullable().optional(),
});
export type AttemptBody = z.infer<typeof attemptBodySchema>;

export const startBodySchema = z.object({ testId: z.string().regex(TEST_ID) });

// ---------------------------------------------------------------------------------------------
// Leaderboard profile (D-034): pseudonymous nickname, optional district and school.

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 24;
export const SCHOOL_MAX = 80;

/** Letters (any script, incl. Devanagari marks), digits, space, dot, underscore, hyphen. */
const NICKNAME_CHARS = /^[\p{L}\p{M}\p{N} ._-]+$/u;
/** School names may also use , ' & ( ) /. */
const SCHOOL_CHARS = /^[\p{L}\p{M}\p{N} .,'&()/-]+$/u;
/** Six or more digits in a row look like a phone number or roll number: never shown publicly. */
const LONG_DIGITS = /\d{6,}/;
/** Impersonation and obvious abuse (lower-case substrings). Kept short; the office can moderate further. */
const BLOCKED = [
  "aspire",
  "admin",
  "official",
  "moderator",
  "fuck",
  "shit",
  "bitch",
  "bastard",
  "asshole",
  "chutiya",
  "madarchod",
  "behenchod",
  "bhenchod",
  "gandu",
  "randi",
  "http",
  "www",
];

export type NameIssue = "length" | "characters" | "letter" | "digits" | "blocked";

/** Collapses runs of whitespace and trims (NFKC first). */
export function tidyText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function blocked(value: string): boolean {
  const flat = value.toLowerCase().replace(/[\s._-]+/g, "");
  return BLOCKED.some((word) => flat.includes(word));
}

export function nicknameIssue(raw: string): NameIssue | null {
  const value = tidyText(raw);
  const length = [...value].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return "length";
  if (!NICKNAME_CHARS.test(value)) return "characters";
  if (!/\p{L}/u.test(value)) return "letter";
  if (LONG_DIGITS.test(value)) return "digits";
  if (blocked(value)) return "blocked";
  return null;
}

export function schoolIssue(raw: string): NameIssue | null {
  const value = tidyText(raw);
  const length = [...value].length;
  if (length < 3 || length > SCHOOL_MAX) return "length";
  if (!SCHOOL_CHARS.test(value)) return "characters";
  if (!/\p{L}/u.test(value)) return "letter";
  if (LONG_DIGITS.test(value)) return "digits";
  if (blocked(value.replace(/aspire/gi, ""))) return "blocked";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Nicknames must not reveal who the student is (D-034, QA-SEC-M6 L6).

/** Letters, marks and digits only, lower case: "Riya.Sharma", "riya sharma" and "RiyaSharma" match. */
function squashIdentity(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

export type IdentityIssue = "login_id" | "real_name";

/**
 * `"login_id"` when the nickname contains the account's login id; `"real_name"` when it contains
 * the first name AND another part (middle or last name, 2+ letters) of the account's display name,
 * in any order, ignoring case, spaces and punctuation. "First name + initial" ("Riya S.") stays
 * allowed — it is the pseudonymous form D-034 suggests.
 */
export function nicknameIdentityIssue(
  nickname: string,
  account: { displayName?: string | null; loginId?: string | null },
): IdentityIssue | null {
  const nick = squashIdentity(nickname);
  const login = squashIdentity(account.loginId ?? "");
  if (login.length > 0 && nick.includes(login)) return "login_id";
  const parts = (account.displayName ?? "")
    .normalize("NFKC")
    .split(/\s+/)
    .map(squashIdentity)
    .filter((part) => [...part].length >= 2);
  if (parts.length >= 2 && nick.includes(parts[0]) && parts.slice(1).some((part) => nick.includes(part))) return "real_name";
  return null;
}

export const profileBodySchema = z
  .object({
    nickname: z.string().max(200),
    district: z.enum(DISTRICT_IDS).nullable(),
    school: z.string().max(400).nullable(),
    showSchool: z.boolean(),
    leaderboardOptIn: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const nickname = nicknameIssue(value.nickname);
    if (nickname) ctx.addIssue({ code: "custom", path: ["nickname"], message: nickname });
    if (value.school !== null && tidyText(value.school) !== "") {
      const school = schoolIssue(value.school);
      if (school) ctx.addIssue({ code: "custom", path: ["school"], message: school });
    }
  })
  .transform((value) => {
    const school = value.school === null ? null : tidyText(value.school) || null;
    return {
      nickname: tidyText(value.nickname),
      district: value.district,
      school,
      showSchool: school !== null && value.showSchool,
      leaderboardOptIn: value.leaderboardOptIn,
    };
  });
export type ProfileInput = z.output<typeof profileBodySchema>;
