import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The lead-gate pass token (docs/lead-gate-plan.md §3), the value of the `aspire_tool_pass` cookie:
 *
 *   lg1.<passId>.<expiresAtSeconds>.<signature>
 *
 * - passId: 32 random bytes, base64url (43 chars). The database stores only its SHA-256
 *   (`crm_gate_passes.pass_hash`), so a database leak cannot be turned into working cookies.
 * - signature: HMAC-SHA256 with LEAD_GATE_SECRET over `lg1.<passId>.<expiresAtSeconds>`, base64url.
 *   A forged, edited or expired token is rejected before any database work; a valid signature
 *   alone grants nothing either: the pass row must still exist (revocation: "Not you?", sign-out,
 *   withdrawal, erase) and its lead must not be erased.
 * - The expiry is fixed at issue (no sliding); the row's own `expires_at` is checked too.
 */

export const PASS_TOKEN_VERSION = "lg1";
const PASS_ID_BYTES = 32;
const TOKEN_PATTERN = /^lg1\.([A-Za-z0-9_-]{43})\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/;
const MAX_TOKEN_LENGTH = 160;

export function generatePassId(): string {
  return randomBytes(PASS_ID_BYTES).toString("base64url");
}

/** What the database stores for a pass id. */
export function hashPassId(passId: string): string {
  return createHash("sha256").update(`lead-gate-pass:${passId}`, "utf8").digest("hex");
}

function signature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

/** Builds the cookie value. `expiresAt` is epoch ms (stored with second precision). */
export function signPassToken(secret: string, passId: string, expiresAt: number): string {
  const payload = `${PASS_TOKEN_VERSION}.${passId}.${Math.floor(expiresAt / 1000)}`;
  return `${payload}.${signature(secret, payload)}`;
}

export interface VerifiedPassToken {
  passId: string;
  passHash: string;
  /** Epoch ms. */
  expiresAt: number;
}

/**
 * Checks shape, expiry and signature (constant-time). Null for anything else: wrong format,
 * edited id or expiry, a signature made with another secret, or a token past its expiry.
 */
export function verifyPassToken(secret: string | null, value: unknown, now: number = Date.now()): VerifiedPassToken | null {
  if (!secret || typeof value !== "string" || value.length > MAX_TOKEN_LENGTH) return null;
  const match = TOKEN_PATTERN.exec(value);
  if (!match) return null;
  const [, passId, seconds, given] = match;
  const expiresAt = Number(seconds) * 1000;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
  const expected = Buffer.from(signature(secret, `${PASS_TOKEN_VERSION}.${passId}.${seconds}`), "utf8");
  const actual = Buffer.from(given, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { passId, passHash: hashPassId(passId), expiresAt };
}
