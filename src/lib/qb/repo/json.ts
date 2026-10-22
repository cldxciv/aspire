import "server-only";

import { randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * Small storage helpers shared by the QB repositories (owner: QB-CORE-B). JSON columns are TEXT;
 * snapshots and the imported original are raw-deflate JSON BLOBs (§B4).
 */

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function deflateJson(value: unknown): Uint8Array {
  return deflateRawSync(Buffer.from(JSON.stringify(value), "utf8"));
}

export function inflateJson<T>(blob: unknown, fallback: T): T {
  if (!(blob instanceof Uint8Array) || blob.length === 0) return fallback;
  try {
    return JSON.parse(inflateRawSync(blob).toString("utf8")) as T;
  } catch {
    return fallback;
  }
}

export function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function bool(value: unknown): boolean {
  return Number(value) === 1;
}

export function changes(result: { changes: number | bigint }): number {
  return Number(result.changes);
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** `q_` + 10 base32 characters (50 random bits). */
export function newQuestionId(): string {
  const bytes = randomBytes(10);
  let out = "q_";
  for (let i = 0; i < 10; i += 1) out += BASE32[bytes[i] & 31];
  return out;
}

/** URL-safe random id: `bytes` random bytes as base64url (22 characters for 16 bytes). */
export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

/** `?, ?, ?` for an IN list. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}
