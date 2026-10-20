import "server-only";

import type { SQLOutputValue } from "node:sqlite";

/** Row helpers shared by the CRM repositories (the only place CRM SQL lives, D-037). */

export type Row = Record<string, SQLOutputValue>;

export function text(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function int(value: SQLOutputValue | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Parses a JSON array of strings; anything else → []. */
export function stringArray(value: SQLOutputValue | undefined): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export type MetaValue = string | number | boolean | null | string[];
export type Meta = Record<string, MetaValue>;

/** Parses a JSON object of primitives / string arrays; anything else is dropped. */
export function parseMeta(value: SQLOutputValue | undefined): Meta {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const meta: Meta = {};
    for (const [key, item] of Object.entries(parsed as Record<string, unknown>)) {
      if (item === null || typeof item === "string" || typeof item === "boolean") meta[key] = item;
      else if (typeof item === "number" && Number.isFinite(item)) meta[key] = item;
      else if (Array.isArray(item)) meta[key] = item.filter((entry): entry is string => typeof entry === "string");
    }
    return meta;
  } catch {
    return {};
  }
}

/** Escapes `%`, `_` and `\` for a `LIKE ... ESCAPE '\'` pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
