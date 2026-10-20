/**
 * Pure CRM helpers (no I/O): phone normalisation, Asia/Kolkata day bounds, CSV escaping, small
 * text cleaners. Client-safe; unit-tested in crm-pure.test.ts.
 */

/**
 * Indian mobile number → E.164 (`+91XXXXXXXXXX`), the dedupe key (D-040). Accepts what the enquiry
 * contract accepts (optional `+91` / `91` / `0` prefix, then 10 digits starting 6–9) plus spaces,
 * hyphens, dots and brackets anywhere. Anything else → null.
 */
export function normalizePhoneE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return null;
  const compact = trimmed.replace(/[\s\-.()]/g, "");
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  return match ? `+91${match[1]}` : null;
}

/** The last `n` digits of an E.164 number (for masked displays). */
export function phoneLastDigits(phoneE164: string | null, n = 4): string | null {
  return phoneE164 ? phoneE164.slice(-n) : null;
}

/** List display of a phone: only the last four digits, `+91 ••••• •1234`. */
export function maskPhone(phoneE164: string | null): string | null {
  const last4 = phoneLastDigits(phoneE164);
  return last4 ? `+91 ••••• •${last4}` : null;
}

/** Canonical tool id (the enquiry contract's spelling): the early "mocktest" → "mock-test". */
export function canonicalTool(tool: string | null): string | null {
  return tool === "mocktest" ? "mock-test" : tool;
}

/** India Standard Time has no DST: UTC+05:30 all year. */
export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Start (inclusive) and end (exclusive) of the Asia/Kolkata calendar day containing `now`. */
export function istDayBounds(now: number): { start: number; end: number } {
  const start = Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
  return { start, end: start + DAY_MS };
}

/**
 * One CSV cell: formula-injection safe (OWASP) — a value starting with `=`, `+`, `-`, `@`, tab or
 * carriage return is prefixed with `'` — then always double-quoted with `"` doubled.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvLine(values: readonly (string | number | null | undefined)[]): string {
  return values.map(csvCell).join(",");
}

/** Collapses whitespace, trims, strips control characters; empty → null; longer than `max` → cut. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, max);
}

/** Like `cleanText` but keeps line breaks (notes, messages). */
export function cleanMultiline(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, max);
}

/** Slug-shaped identifiers (centre slugs, program / class values, sources, tools). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export function cleanSlug(value: unknown, max = 60): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.length <= max && SLUG_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Site path (`/admissions`), no query / hash; %-encoded paths are decoded (once, safely). The
 * decoded path may hold letters / digits of any script plus `/ _ . ~ -`; it must start with a single
 * `/` and be at most 200 characters. Anything else → null.
 */
export function cleanPagePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 600) return null;
  const raw = value.trim().split(/[?#]/)[0];
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  let path: string;
  try {
    path = raw.includes("%") ? decodeURIComponent(raw) : raw;
  } catch {
    return null;
  }
  if (path.length > 200 || path.startsWith("//") || path.includes("\\")) return null;
  return /^\/[\p{L}\p{M}\p{N}/_.~-]*$/u.test(path) ? path : null;
}

const HOST = /^(?=.{1,100}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/;

/**
 * Referrer reduced to its host (no path / query, which may carry personal data). Accepts a bare
 * host ("www.google.com", what the enquiry contract sends) or an http(s) URL.
 */
export function cleanReferrer(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  const trimmed = value.trim().toLowerCase();
  if (HOST.test(trimmed)) return trimmed;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.host : null;
  } catch {
    return null;
  }
}

export function toIso(ms: number): string;
export function toIso(ms: number | null): string | null;
export function toIso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

/** Parses an ISO date / date-time string into epoch ms; invalid → null. */
export function parseTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.length > 40) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
