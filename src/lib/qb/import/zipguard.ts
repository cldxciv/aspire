import "server-only";

import { crc32, inflateRawSync } from "node:zlib";

import { ZIP_MAX_ENTRIES, ZIP_MAX_UNCOMPRESSED_BYTES } from "./config";

/**
 * Zip-bomb guard for DOCX and XLSX uploads (docs/question-bank-plan.md §B8.1). Before any parser
 * (mammoth, read-excel-file) sees a file, the central directory must list at most 2,000 entries and
 * at most 50 MB uncompressed; then every entry is inflated here with a hard output cap equal to its
 * declared size, so a directory that lies about sizes is refused too. Zip64, encrypted entries and
 * compression methods other than stored / deflate are refused.
 */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  crc: number;
  localHeaderOffset: number;
}

export type ZipCheck =
  | { ok: true; entries: ZipEntry[]; totalSize: number }
  | {
      ok: false;
      reason:
        | "zip_not_zip"
        | "zip_truncated"
        | "zip64_unsupported"
        | "zip_too_many_entries"
        | "zip_too_large"
        | "zip_encrypted"
        | "zip_method"
        | "zip_size_mismatch"
        | "zip_corrupt";
    };

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findEocd(bytes: Uint8Array): number {
  const dv = view(bytes);
  const min = Math.max(0, bytes.length - (22 + 0xffff));
  for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
    if (dv.getUint32(offset, true) === EOCD_SIG) return offset;
  }
  return -1;
}

/** Reads the central directory and checks the declared limits (no decompression). */
export function readCentralDirectory(
  bytes: Uint8Array,
  limits: { maxEntries?: number; maxTotal?: number } = {},
): ZipCheck {
  const maxEntries = limits.maxEntries ?? ZIP_MAX_ENTRIES;
  const maxTotal = limits.maxTotal ?? ZIP_MAX_UNCOMPRESSED_BYTES;
  if (!isZip(bytes)) return { ok: false, reason: "zip_not_zip" };
  const eocd = findEocd(bytes);
  if (eocd < 0) return { ok: false, reason: "zip_truncated" };
  const dv = view(bytes);
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return { ok: false, reason: "zip64_unsupported" };
  if (count > maxEntries) return { ok: false, reason: "zip_too_many_entries" };
  if (cdOffset + cdSize > bytes.length) return { ok: false, reason: "zip_truncated" };

  const entries: ZipEntry[] = [];
  let totalSize = 0;
  let pos = cdOffset;
  for (let index = 0; index < count; index += 1) {
    if (pos + 46 > bytes.length || dv.getUint32(pos, true) !== CDH_SIG) return { ok: false, reason: "zip_corrupt" };
    const flags = dv.getUint16(pos + 8, true);
    const method = dv.getUint16(pos + 10, true);
    const crc = dv.getUint32(pos + 16, true);
    const compressedSize = dv.getUint32(pos + 20, true);
    const size = dv.getUint32(pos + 24, true);
    const nameLength = dv.getUint16(pos + 28, true);
    const extraLength = dv.getUint16(pos + 30, true);
    const commentLength = dv.getUint16(pos + 32, true);
    const localHeaderOffset = dv.getUint32(pos + 42, true);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localHeaderOffset === 0xffffffff) {
      return { ok: false, reason: "zip64_unsupported" };
    }
    if ((flags & 0x1) !== 0) return { ok: false, reason: "zip_encrypted" };
    if (method !== 0 && method !== 8) return { ok: false, reason: "zip_method" };
    const name = new TextDecoder("utf-8").decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    totalSize += size;
    if (totalSize > maxTotal) return { ok: false, reason: "zip_too_large" };
    entries.push({ name, method, compressedSize, size, crc, localHeaderOffset });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return { ok: true, entries, totalSize };
}

/** Inflates one entry with a hard output cap of its declared size; throws on any mismatch. */
export function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Buffer {
  const dv = view(bytes);
  const at = entry.localHeaderOffset;
  if (at + 30 > bytes.length || dv.getUint32(at, true) !== LFH_SIG) throw new Error("zip_corrupt");
  const nameLength = dv.getUint16(at + 26, true);
  const extraLength = dv.getUint16(at + 28, true);
  const start = at + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new Error("zip_truncated");
  const data = bytes.subarray(start, end);
  let out: Buffer;
  if (entry.method === 0) {
    out = Buffer.from(data);
  } else {
    // maxOutputLength stops a lying directory: inflating past the declared size throws.
    out = inflateRawSync(data, { maxOutputLength: Math.max(1, entry.size) });
  }
  if (out.length !== entry.size) throw new Error("zip_size_mismatch");
  if (crc32(out) >>> 0 !== entry.crc >>> 0) throw new Error("zip_size_mismatch");
  return out;
}

/**
 * Full guard: directory limits, then every entry inflated under its declared size (so the real
 * total is bounded by the 50 MB directory check). Use before handing the file to any parser.
 */
export function checkZip(bytes: Uint8Array, limits: { maxEntries?: number; maxTotal?: number } = {}): ZipCheck {
  const directory = readCentralDirectory(bytes, limits);
  if (!directory.ok) return directory;
  for (const entry of directory.entries) {
    if (entry.name.endsWith("/")) continue;
    try {
      readZipEntry(bytes, entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "zip_truncated") return { ok: false, reason: "zip_truncated" };
      if (message === "zip_corrupt") return { ok: false, reason: "zip_corrupt" };
      return { ok: false, reason: "zip_size_mismatch" };
    }
  }
  return directory;
}

/** Text of one entry by name (UTF-8), or null when it is absent. Call after `checkZip`. */
export function readZipText(bytes: Uint8Array, entries: readonly ZipEntry[], name: string): string | null {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) return null;
  return readZipEntry(bytes, entry).toString("utf8");
}
