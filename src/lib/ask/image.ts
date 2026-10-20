import "server-only";

import { ASK_MAX_IMAGE_BYTES, type AskImageType } from "./constants";

/**
 * Server-side checks for the optional question photo. The photo is held in memory for the
 * duration of one request and passed to the model; it is never written to disk, the database
 * or the logs (D-034).
 */

/** Detects JPEG / PNG / WebP from the file's first bytes; `null` for anything else. */
export function detectImageType(bytes: Uint8Array): AskImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

export type ImageCheck =
  | { ok: true; mediaType: AskImageType; base64: string; bytes: number }
  | { ok: false; reason: "image_encoding" | "image_too_large" | "image_type" | "image_empty" };

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Validates a base64 image from the request: strict base64 (a `data:` URL prefix is tolerated),
 * at most `maxBytes` decoded, and its magic bytes must match the declared type.
 */
export function checkImage(declaredType: AskImageType, data: string, maxBytes: number = ASK_MAX_IMAGE_BYTES): ImageCheck {
  const base64 = data.replace(/^data:[a-z/+-]+;base64,/i, "");
  if (base64.length === 0) return { ok: false, reason: "image_empty" };
  if (base64.length % 4 !== 0 || !BASE64.test(base64)) return { ok: false, reason: "image_encoding" };
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const size = (base64.length / 4) * 3 - padding;
  if (size > maxBytes) return { ok: false, reason: "image_too_large" };
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return { ok: false, reason: "image_empty" };
  const detected = detectImageType(bytes);
  if (detected === null || detected !== declaredType) return { ok: false, reason: "image_type" };
  return { ok: true, mediaType: detected, base64, bytes: bytes.length };
}
