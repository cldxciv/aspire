import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Secret box (owner: LR-CORE; docs/lead-routing-plan.md §19, M13): seals integration credentials
 * (Meta app secret, access / page token, verify token) for storage in SQLite, and makes keyed
 * one-way hashes (CSV refs, erase suppressions). Built on node:crypto only.
 *
 * - Key: `INTEGRATIONS_SECRET`, an OPAQUE string of at least 43 characters (no format guessing;
 *   generate with `openssl rand -base64 48`). Two keys are derived with HKDF-SHA256 (salt
 *   "aspire.integrations"): `secret-box/v1` seals, `keyed-hash/v1` hashes. `keyId` = the first 8
 *   hex characters of sha256(seal key).
 * - Cipher: AES-256-GCM, 12-byte random IV, AAD `"<provider>:<name>:v1"`. Envelope:
 *   `v1.<keyId>.<iv>.<ciphertext>.<tag>` (base64url parts).
 * - Rotation: `INTEGRATIONS_SECRET_PREVIOUS` opens envelopes (picked by the envelope's keyId) and
 *   gives `keyedHash(…, { previous: true })` for lookups until `resealSecret` re-encrypts them.
 * - Errors: `SecretBoxError` with a fixed code (never the key, never the plaintext).
 *
 * The environment is read on every call (keys are cached by value), so a key set or rotated at
 * deploy time needs no code change and tests can stub it.
 */

export type SecretBoxErrorCode = "not_configured" | "key_mismatch" | "corrupt" | "weak_key";

export class SecretBoxError extends Error {
  readonly code: SecretBoxErrorCode;
  constructor(code: SecretBoxErrorCode) {
    super(code);
    this.name = "SecretBoxError";
    this.code = code;
  }
}

/** The opaque key must be at least this long (M13). */
export const SECRET_MIN_LENGTH = 43;
const SALT = "aspire.integrations";
const VERSION = "v1";

interface DerivedKey {
  seal: Buffer;
  hash: Buffer;
  keyId: string;
}

const cache = new Map<string, DerivedKey>();

function derive(secret: string): DerivedKey {
  const cached = cache.get(secret);
  if (cached) return cached;
  const material = Buffer.from(secret, "utf8");
  const seal = Buffer.from(hkdfSync("sha256", material, SALT, "secret-box/v1", 32));
  const hash = Buffer.from(hkdfSync("sha256", material, SALT, "keyed-hash/v1", 32));
  const keyId = createHash("sha256").update(seal).digest("hex").slice(0, 8);
  const derived = { seal, hash, keyId };
  if (cache.size >= 8) cache.clear();
  cache.set(secret, derived);
  return derived;
}

type Env = Readonly<Record<string, string | undefined>>;

function rawSecret(env: Env, name: "INTEGRATIONS_SECRET" | "INTEGRATIONS_SECRET_PREVIOUS"): string | null {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** Current / previous keys; a set but too-short secret counts as weak (unusable). */
function keys(env: Env = process.env): { current: DerivedKey | null; previous: DerivedKey | null; weak: boolean } {
  const current = rawSecret(env, "INTEGRATIONS_SECRET");
  const previous = rawSecret(env, "INTEGRATIONS_SECRET_PREVIOUS");
  const weak = current !== null && current.length < SECRET_MIN_LENGTH;
  return {
    current: current && !weak ? derive(current) : null,
    previous: previous && previous.length >= SECRET_MIN_LENGTH ? derive(previous) : null,
    weak,
  };
}

export interface SecretBoxStatus {
  /** A usable INTEGRATIONS_SECRET is set. */
  configured: boolean;
  keyId: string | null;
  previousKeyId: string | null;
  /** INTEGRATIONS_SECRET is set but shorter than 43 characters (treated as not configured). */
  weak: boolean;
}

export function secretBoxStatus(env: Env = process.env): SecretBoxStatus {
  const { current, previous, weak } = keys(env);
  return { configured: current !== null, keyId: current?.keyId ?? null, previousKeyId: previous?.keyId ?? null, weak };
}

/** AAD of a stored secret: `"<provider>:<name>:v1"`. */
export function secretAad(provider: string, name: string): string {
  return `${provider}:${name}:${VERSION}`;
}

function currentKey(): DerivedKey {
  const { current, weak } = keys();
  if (weak) throw new SecretBoxError("weak_key");
  if (!current) throw new SecretBoxError("not_configured");
  return current;
}

const b64u = (buffer: Buffer) => buffer.toString("base64url");

/** Encrypts `plain` under the current key, bound to `aad`. */
export function sealSecret(plain: string, aad: string): string {
  const key = currentKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.seal, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, key.keyId, b64u(iv), b64u(ciphertext), b64u(tag)].join(".");
}

interface Envelope {
  keyId: string;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

const B64U = /^[A-Za-z0-9_-]*$/;

function parseEnvelope(sealed: string): Envelope {
  const parts = typeof sealed === "string" ? sealed.split(".") : [];
  if (parts.length !== 5 || parts[0] !== VERSION || !/^[0-9a-f]{8}$/.test(parts[1]) || !parts.slice(2).every((part) => B64U.test(part))) {
    throw new SecretBoxError("corrupt");
  }
  const [, keyId, iv, ciphertext, tag] = parts;
  const envelope = { keyId, iv: Buffer.from(iv, "base64url"), ciphertext: Buffer.from(ciphertext, "base64url"), tag: Buffer.from(tag, "base64url") };
  if (envelope.iv.length !== 12 || envelope.tag.length !== 16) throw new SecretBoxError("corrupt");
  return envelope;
}

/** Which configured key an envelope was sealed with (`false`: neither / unreadable). */
export function sealedKeyState(sealed: string): "current" | "previous" | false {
  let envelope: Envelope;
  try {
    envelope = parseEnvelope(sealed);
  } catch {
    return false;
  }
  const { current, previous } = keys();
  if (current && envelope.keyId === current.keyId) return "current";
  if (previous && envelope.keyId === previous.keyId) return "previous";
  return false;
}

/** Decrypts an envelope with the key its keyId names (current or previous). */
export function openSecret(sealed: string, aad: string): string {
  const envelope = parseEnvelope(sealed);
  const { current, previous, weak } = keys();
  const key = current?.keyId === envelope.keyId ? current : previous?.keyId === envelope.keyId ? previous : null;
  if (!key) {
    if (!current && !previous) throw new SecretBoxError(weak ? "weak_key" : "not_configured");
    throw new SecretBoxError("key_mismatch");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.seal, envelope.iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(envelope.tag);
    return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretBoxError("corrupt");
  }
}

/** Re-encrypts an envelope with the current key (the `reseal` action after a key rotation). */
export function resealSecret(sealed: string, aad: string): string {
  return sealSecret(openSecret(sealed, aad), aad);
}

/**
 * Keyed one-way hash (HMAC-SHA256, base64url) of `value` for `purpose` ("phone", "csv-ref", …).
 * `{ previous: true }` uses INTEGRATIONS_SECRET_PREVIOUS (lookups during a rotation).
 */
export function keyedHash(purpose: string, value: string, options: { previous?: boolean } = {}): string {
  let key: DerivedKey;
  if (options.previous) {
    const { previous } = keys();
    if (!previous) throw new SecretBoxError("not_configured");
    key = previous;
  } else {
    key = currentKey();
  }
  return createHmac("sha256", key.hash).update(`${purpose}\u0000${value}`).digest("base64url");
}

/** The hashes a lookup must try: current key, then previous key (when set). Empty when no key is set. */
export function keyedHashCandidates(purpose: string, value: string): string[] {
  const status = secretBoxStatus();
  if (!status.configured) return [];
  const hashes = [keyedHash(purpose, value)];
  if (status.previousKeyId) hashes.push(keyedHash(purpose, value, { previous: true }));
  return hashes;
}
