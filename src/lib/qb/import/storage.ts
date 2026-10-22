import "server-only";

import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Uploaded import files on disk (`QB_IMPORT_DIR`, docs/question-bank-plan.md §B8.1, §B8.9). Files
 * are written atomically (temp name, then rename), named `<importId>.<ext>` only, and kept until the
 * import is closed or 14 days at most. A total quota (`QB_IMPORT_STORAGE_MB`) refuses new uploads.
 * The database stores the bare file name, never a path from the request.
 */

export const IMPORT_FILE_EXTENSIONS = ["pdf", "docx", "xlsx", "csv"] as const;
export type ImportFileExtension = (typeof IMPORT_FILE_EXTENSIONS)[number];

const IMPORT_ID = /^imp_[a-z0-9]{16}$/;
const FILE_NAME = /^imp_[a-z0-9]{16}\.(pdf|docx|xlsx|csv)$/;
const TEMP_SUFFIX = ".part";

/** `imp_` + 16 lower-case base-36 characters (≈ 82 bits). */
export function newImportId(): string {
  const bytes = randomBytes(16);
  let id = "";
  for (const byte of bytes) id += (byte % 36).toString(36);
  return `imp_${id}`;
}

export function isImportId(value: unknown): value is string {
  return typeof value === "string" && IMPORT_ID.test(value);
}

export function isImportFileName(value: unknown): value is string {
  return typeof value === "string" && FILE_NAME.test(value);
}

export function importFileName(importId: string, ext: ImportFileExtension): string {
  if (!isImportId(importId)) throw new Error("invalid import id");
  return `${importId}.${ext}`;
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Bytes currently used by import files (temp files included). */
export function storageUsage(dir: string): number {
  let total = 0;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    try {
      const stat = statSync(join(dir, name));
      if (stat.isFile()) total += stat.size;
    } catch {
      // Removed meanwhile.
    }
  }
  return total;
}

export type StoreResult = { ok: true; fileName: string } | { ok: false; reason: "storage_quota" };

/** Writes the upload atomically; refuses when it would take the folder over its quota. */
export function storeImportFile(
  options: { dir: string; quotaBytes: number },
  importId: string,
  ext: ImportFileExtension,
  bytes: Uint8Array,
): StoreResult {
  ensureDir(options.dir);
  if (storageUsage(options.dir) + bytes.byteLength > options.quotaBytes) return { ok: false, reason: "storage_quota" };
  const fileName = importFileName(importId, ext);
  const temp = join(options.dir, `${fileName}.${randomBytes(6).toString("hex")}${TEMP_SUFFIX}`);
  writeFileSync(temp, bytes, { mode: 0o600 });
  renameSync(temp, join(options.dir, fileName));
  return { ok: true, fileName };
}

/** The stored file, or null when it is gone (or the name is not one of ours). */
export function readImportFile(dir: string, fileName: string | null): Buffer | null {
  if (!isImportFileName(fileName)) return null;
  try {
    return readFileSync(join(dir, fileName));
  } catch {
    return null;
  }
}

/** Deletes a stored file; true when it existed. */
export function deleteImportFile(dir: string, fileName: string | null): boolean {
  if (!isImportFileName(fileName)) return false;
  try {
    rmSync(join(dir, fileName));
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes files no job references (and stale temp files). Files younger than `graceMs` are kept so
 * an upload that is being written is never removed under it.
 */
export function pruneOrphanFiles(dir: string, referenced: ReadonlySet<string>, now: number, graceMs = 60 * 60_000): number {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const isOurs = FILE_NAME.test(name) || (name.endsWith(TEMP_SUFFIX) && name.startsWith("imp_"));
    if (!isOurs || referenced.has(name)) continue;
    try {
      const stat = statSync(join(dir, name));
      if (!stat.isFile() || now - stat.mtimeMs < graceMs) continue;
      rmSync(join(dir, name));
      removed += 1;
    } catch {
      // Removed meanwhile.
    }
  }
  return removed;
}
