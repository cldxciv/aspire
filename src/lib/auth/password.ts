import "server-only";

import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing and policy (D-029). Node's built-in `crypto.scrypt` with a per-user
 * random 16-byte salt; stored as `scrypt$N$r$p$<salt>$<hash>` (base64url). Comparison
 * is constant-time. Nothing in this module logs, and callers must never log or return
 * a password or a hash.
 *
 * Loaded by `scripts/*.mjs` through Node type stripping: no runtime imports of other
 * project files here.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export interface ScryptParams {
  /** CPU/memory cost (power of two). */
  N: number;
  r: number;
  p: number;
}

/** ~32 MiB and tens of milliseconds per hash on a typical server core. */
export const SCRYPT_PARAMS: Readonly<ScryptParams> = { N: 2 ** 15, r: 8, p: 1 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";

// Bounds for parameters read back from storage, so a corrupted row cannot make
// verification allocate unbounded memory or CPU.
const MIN_N = 2 ** 14;
const MAX_N = 2 ** 17;
const MAX_R = 16;
const MAX_P = 4;

function scryptAsync(password: Buffer, salt: Buffer, keyLength: number, params: ScryptParams): Promise<Buffer> {
  // Twice the theoretical requirement (128 * N * r) as head-room for OpenSSL's bookkeeping.
  const maxmem = 256 * params.N * params.r + 128 * params.r * params.p;
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: params.N, r: params.r, p: params.p, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** NFKC so the same visible password always hashes the same (e.g. composed vs decomposed accents). */
function passwordBytes(password: string): Buffer {
  return Buffer.from(password.normalize("NFKC"), "utf8");
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

interface DecodedHash {
  params: ScryptParams;
  salt: Buffer;
  hash: Buffer;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

function decodeHash(stored: string): DecodedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return null;
  const [N, r, p] = parts.slice(1, 4).map((part) => (/^\d{1,7}$/.test(part) ? Number(part) : NaN));
  if (!isPowerOfTwo(N) || N < MIN_N || N > MAX_N) return null;
  if (!Number.isInteger(r) || r < 1 || r > MAX_R) return null;
  if (!Number.isInteger(p) || p < 1 || p > MAX_P) return null;
  if (!B64URL.test(parts[4]) || !B64URL.test(parts[5])) return null;
  const salt = Buffer.from(parts[4], "base64url");
  const hash = Buffer.from(parts[5], "base64url");
  if (salt.length < 16 || hash.length < 16 || hash.length > 64) return null;
  return { params: { N, r, p }, salt, hash };
}

/** Hashes a password with a fresh random salt. */
export async function hashPassword(password: string, params: ScryptParams = SCRYPT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(passwordBytes(password), salt, KEY_LENGTH, params);
  return [PREFIX, params.N, params.r, params.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

/** Constant-time check of `password` against a stored hash. Malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const decoded = decodeHash(stored);
  if (!decoded) return false;
  const candidate = await scryptAsync(passwordBytes(password), decoded.salt, decoded.hash.length, decoded.params);
  return candidate.length === decoded.hash.length && timingSafeEqual(candidate, decoded.hash);
}

/** True when the stored hash uses other parameters than the current ones (re-hash on next sign-in). */
export function needsRehash(stored: string, params: ScryptParams = SCRYPT_PARAMS): boolean {
  const decoded = decodeHash(stored);
  if (!decoded) return true;
  return (
    decoded.params.N !== params.N ||
    decoded.params.r !== params.r ||
    decoded.params.p !== params.p ||
    decoded.hash.length !== KEY_LENGTH
  );
}

let dummyHash: Promise<string> | null = null;

/**
 * Burns the same work as a real verification and always returns false. Used for unknown
 * login ids so response time does not reveal whether an account exists.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(18).toString("base64url"));
  await verifyPassword(password, await dummyHash);
  return false;
}

export type PasswordPolicyIssue = "too_short" | "too_long" | "same_as_login_id";

export const PASSWORD_POLICY_MESSAGES: Readonly<Record<PasswordPolicyIssue, string>> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  same_as_login_id: "Your password must not be the same as your login ID.",
};

/** Length in user-perceived code points (so emoji / Devanagari are not over-counted). */
export function passwordLength(password: string): number {
  return Array.from(password).length;
}

/** Policy: 10–128 characters and not the login id (case-insensitive). */
export function checkPasswordPolicy(password: string, loginId?: string): PasswordPolicyIssue | null {
  const length = passwordLength(password);
  if (length < PASSWORD_MIN_LENGTH) return "too_short";
  if (length > PASSWORD_MAX_LENGTH) return "too_long";
  if (loginId && password.trim().toLowerCase() === loginId.trim().toLowerCase()) return "same_as_login_id";
  return null;
}

// No 0/O, 1/l/I: temporary passwords are read out or copied by hand.
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Random temporary password such as `Kq7m-x2Pa-9TbW-fh4R` (16 symbols from a 55-character
 * alphabet, about 92 bits). Shown once to the admin; the user must change it at first sign-in.
 */
export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g += 1) {
    let group = "";
    for (let i = 0; i < 4; i += 1) group += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    groups.push(group);
  }
  return groups.join("-");
}
