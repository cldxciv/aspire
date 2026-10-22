import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";

import { detectImageType } from "@/lib/ask/image";
import { MEMORY_DB_PATH, resolveDbPath } from "@/lib/db/connection";

import { qbCan } from "./access";
import { qbDb } from "./db";
import { placeholders } from "./repo/json";
import { conflict, forbidden, invalid, notFound, ok, type QbResult } from "./result";
import type { QbViewer } from "./types";

/**
 * Question figures (owner: QB-CORE-B; §B12). Bytes are files in `QB_FIGURE_DIR`
 * (default `<dir of AUTH_DB_PATH>/qb-figures`) named `<id>.<ext>`, where the id is the first 32 hex
 * characters of the SHA-256 of the bytes; `qb_figures` holds the metadata.
 * - Accepted: PNG, JPEG or WebP of at most 200 KB, checked by magic bytes and header dimensions.
 *   SVG and everything else are refused. The browser downscales to ≤ 700 px and encodes WebP first.
 * - `qb_figure_refs`: version 0 = the working copy (replaced on save); version n = an approved
 *   version, kept forever. A figure is public only with a ref of version ≥ 1.
 * - Pruning removes only figures with NO refs at all, after 7 days; so a figure used by any approved
 *   version (and so by any stored paper) is never pruned.
 * - Quota `QB_FIGURE_QUOTA_MB` (150).
 */

export const QB_FIGURE_MAX_BYTES = 200 * 1024;
export const QB_FIGURE_PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export type QbFigureMime = "image/png" | "image/jpeg" | "image/webp";
const EXT: Record<QbFigureMime, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const FIGURE_ID = /^[0-9a-f]{32}$/;

type Env = Readonly<Record<string, string | undefined>>;

export function figureDir(env: Env = process.env): string {
  const configured = env.QB_FIGURE_DIR?.trim();
  if (configured) return resolve(configured);
  const dbPath = resolveDbPath(env);
  const base = dbPath === MEMORY_DB_PATH ? resolve(".data") : dirname(dbPath);
  return join(base, "qb-figures");
}

export function figureQuotaBytes(env: Env = process.env): number {
  const mb = Number(env.QB_FIGURE_QUOTA_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 150) * 1024 * 1024;
}

// ---------------------------------------------------------------------------------------------
// Header dimensions

function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function u24le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}

/** Width and height from the image header; null when the header is malformed. */
export function imageDimensions(bytes: Uint8Array, mime: QbFigureMime): { width: number; height: number } | null {
  if (mime === "image/png") {
    if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const length = u16be(bytes, offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { height: u16be(bytes, offset + 5), width: u16be(bytes, offset + 7) };
      if (length < 2) return null;
      offset += 2 + length;
    }
    return null;
  }
  // WebP: RIFF....WEBP then VP8 / VP8L / VP8X
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8 ") {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (chunk === "VP8X") return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Store

export interface QbFigureView {
  id: string;
  mime: QbFigureMime;
  width: number;
  height: number;
  size: number;
  /** Staff URL (drafts included). */
  url: string;
}

function viewOf(row: Record<string, unknown>): QbFigureView {
  const id = String(row.id);
  return {
    id,
    mime: row.mime as QbFigureMime,
    width: Number(row.width),
    height: Number(row.height),
    size: Number(row.size),
    url: `/api/admin/qb/figures/${id}`,
  };
}

/** Stores an uploaded figure (idempotent by content hash). */
export function saveFigure(
  viewer: QbViewer,
  file: { bytes: Uint8Array; declaredType?: string },
  now: number,
  db: DatabaseSync = qbDb(),
  options: { dir?: string } = {},
): QbResult<QbFigureView> {
  if (!qbCan(viewer, "edit_draft")) return forbidden();
  const bytes = file.bytes;
  if (bytes.length === 0) return invalid("The file is empty.", { file: ["empty"] });
  if (bytes.length > QB_FIGURE_MAX_BYTES) return invalid("Figures must be 200 KB or smaller.", { file: ["too_large"] });
  const mime = detectImageType(bytes) as QbFigureMime | null;
  if (!mime) return invalid("Use a PNG, JPEG or WebP image (SVG is not accepted).", { file: ["type"] });
  if (file.declaredType && file.declaredType !== mime) return invalid("The file type does not match its contents.", { file: ["type"] });
  const size = imageDimensions(bytes, mime);
  if (!size || size.width < 1 || size.height < 1 || size.width > 4000 || size.height > 4000) {
    return invalid("The image header could not be read.", { file: ["dimensions"] });
  }
  const id = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const existing = db.prepare("SELECT * FROM qb_figures WHERE id = ?").get(id);
  const dir = options.dir ?? figureDir();
  const path = join(dir, `${id}.${EXT[mime]}`);
  if (existing && existsSync(path)) return ok(viewOf(existing));
  const used = Number(db.prepare("SELECT COALESCE(SUM(size), 0) AS total FROM qb_figures").get()?.total ?? 0);
  if (!existing && used + bytes.length > figureQuotaBytes()) {
    return conflict("figure_quota", "The figure storage quota is full. Ask an admin to free space or raise QB_FIGURE_QUOTA_MB.");
  }
  mkdirSync(dir, { recursive: true });
  const temp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  writeFileSync(temp, bytes);
  renameSync(temp, path);
  if (!existing) {
    db.prepare("INSERT INTO qb_figures (id, mime, width, height, size, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id,
      mime,
      size.width,
      size.height,
      bytes.length,
      viewer.userId,
      now,
    );
  }
  return ok(viewOf(db.prepare("SELECT * FROM qb_figures WHERE id = ?").get(id)!));
}

function readFile(db: DatabaseSync, id: string, dir: string): { bytes: Uint8Array; mime: QbFigureMime } | null {
  if (!FIGURE_ID.test(id)) return null;
  const row = db.prepare("SELECT mime FROM qb_figures WHERE id = ?").get(id);
  if (!row) return null;
  const mime = row.mime as QbFigureMime;
  try {
    return { bytes: new Uint8Array(readFileSync(join(dir, `${id}.${EXT[mime]}`))), mime };
  } catch {
    return null;
  }
}

/** Staff: any stored figure (drafts included). */
export function readFigureForStaff(
  viewer: QbViewer,
  id: string,
  db: DatabaseSync = qbDb(),
  options: { dir?: string } = {},
): QbResult<{ bytes: Uint8Array; mime: QbFigureMime }> {
  if (!qbCan(viewer, "view")) return forbidden();
  const file = readFile(db, id, options.dir ?? figureDir());
  return file ? ok(file) : notFound("No such figure.");
}

/** Public: only figures referenced by an approved version (version ≥ 1). */
export function readPublicFigure(id: string, db: DatabaseSync = qbDb(), options: { dir?: string } = {}): { bytes: Uint8Array; mime: QbFigureMime } | null {
  if (!FIGURE_ID.test(id)) return null;
  const ref = db.prepare("SELECT 1 AS found FROM qb_figure_refs WHERE figure_id = ? AND version >= 1 LIMIT 1").get(id);
  if (!ref) return null;
  return readFile(db, id, options.dir ?? figureDir());
}

/** The working copy's refs (version 0) are replaced on every save. */
export function setWorkingFigureRefs(db: DatabaseSync, questionId: string, figureIds: readonly string[]): void {
  db.prepare("DELETE FROM qb_figure_refs WHERE question_id = ? AND version = 0").run(questionId);
  const insert = db.prepare("INSERT OR IGNORE INTO qb_figure_refs (figure_id, question_id, version) VALUES (?, ?, 0)");
  for (const id of new Set(figureIds)) if (FIGURE_ID.test(id)) insert.run(id, questionId);
}

/** Refs of an approved version (kept forever). */
export function addVersionFigureRefs(db: DatabaseSync, questionId: string, version: number, figureIds: readonly string[]): void {
  const insert = db.prepare("INSERT OR IGNORE INTO qb_figure_refs (figure_id, question_id, version) VALUES (?, ?, ?)");
  for (const id of new Set(figureIds)) if (FIGURE_ID.test(id)) insert.run(id, questionId, version);
}

/** Figures that exist in `qb_figures` (for save-time validation of content refs). */
export function existingFigureIds(db: DatabaseSync, ids: readonly string[]): Set<string> {
  const unique = [...new Set(ids)].filter((id) => FIGURE_ID.test(id));
  if (unique.length === 0) return new Set();
  return new Set(
    db
      .prepare(`SELECT id FROM qb_figures WHERE id IN (${placeholders(unique.length)})`)
      .all(...unique)
      .map((r) => String(r.id)),
  );
}

/** Removes figures with no refs at all that are older than 7 days. Returns how many were removed. */
export function pruneFigures(db: DatabaseSync, now: number, options: { dir?: string } = {}): number {
  const dir = options.dir ?? figureDir();
  const rows = db
    .prepare(
      `SELECT id, mime FROM qb_figures f WHERE created_at < ?
         AND NOT EXISTS (SELECT 1 FROM qb_figure_refs r WHERE r.figure_id = f.id) LIMIT 500`,
    )
    .all(now - QB_FIGURE_PRUNE_AFTER_MS);
  for (const row of rows) {
    const id = String(row.id);
    try {
      unlinkSync(join(dir, `${id}.${EXT[row.mime as QbFigureMime]}`));
    } catch {
      // already gone
    }
    db.prepare("DELETE FROM qb_figures WHERE id = ?").run(id);
  }
  return rows.length;
}
