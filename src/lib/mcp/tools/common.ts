import "server-only";

import { z } from "zod";

import { EXAM_TRACKS } from "@/lib/server/public-content";

/** Shared input pieces and helpers for the MCP tools. */

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/** Opaque account / record ids (same rule as src/lib/auth/roles.ts `isRecordId`). */
export const recordIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "Expected an account id (1–64 letters, digits, _ or -).");

export const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE)
  .describe(`Page size, 1–${MAX_PAGE_SIZE} (default ${DEFAULT_PAGE_SIZE}).`);

export const offsetSchema = z
  .number()
  .int()
  .min(0)
  .max(100_000)
  .default(0)
  .describe("Number of items to skip (use `nextOffset` from the previous page).");

export const examSchema = z.enum(EXAM_TRACKS).describe("Exam track: JEE, NEET, Foundation or Integrated.");

export interface Page<T> {
  total: number;
  offset: number;
  limit: number;
  /** Offset of the next page, or null when this is the last page. */
  nextOffset: number | null;
  items: T[];
}

export function paginate<T>(all: readonly T[], offset: number, limit: number): Page<T> {
  const items = all.slice(offset, offset + limit);
  const next = offset + items.length;
  return { total: all.length, offset, limit, nextOffset: next < all.length ? next : null, items };
}

/** "3 of 12 (offset 0)" style summary fragment. */
export function pageSummary(page: Page<unknown>, noun: string): string {
  if (page.total === 0) return `No ${noun} found.`;
  const end = page.offset + page.items.length;
  const more = page.nextOffset !== null ? ` More available: call again with offset ${page.nextOffset}.` : "";
  return `${page.items.length === 0 ? 0 : page.offset + 1}–${end} of ${page.total} ${noun}.${more}`;
}

/** Epoch ms → ISO string (null stays null). */
export function isoOrNull(ms: number | null | undefined): string | null {
  return ms === null || ms === undefined ? null : new Date(ms).toISOString();
}

/** Drops `undefined` values so JSON stays compact. */
export function compact<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}
