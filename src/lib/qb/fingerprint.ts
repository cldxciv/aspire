import { createHash } from "node:crypto";

import { normaliseDollarMath, parseRichText, type RichInline } from "./rich-text";
import type { Bilingual, QbQuestionContent } from "./types";

/**
 * Duplicate detection (owner: QB-CORE-A; §B7). Server-side (node:crypto).
 *
 * - `fingerprintOf`: SHA-256 of the normalised English stem plus the normalised options in sorted order,
 *   so whitespace, LaTeX spacing, `$…$` versus `\(…\)` and option order do not matter. Equal
 *   fingerprints are EXACT duplicates (blocking flag `exact_duplicate`; `also_in` only from these).
 * - `minhashOf`: a 64 × uint32 MinHash signature of the normalised stem's word 3-shingles. Signatures
 *   are compared in memory within a subject; an estimated Jaccard ≥ 0.8 is a NEAR duplicate.
 */

export const MINHASH_SIZE = 64;
export const NEAR_DUPLICATE_THRESHOLD = 0.8;
/** Unresolved near pairs at or above this are one cluster for the generator until a reviewer decides. */
export const NEAR_CLUSTER_THRESHOLD = 0.9;

export function sha256Hex(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

const SPACING_COMMANDS = /\\(?:,|;|:|!|\s|quad\b|qquad\b|left\b|right\b|displaystyle\b|textstyle\b)/g;

function normaliseTex(tex: string): string {
  return tex.normalize("NFKC").replace(SPACING_COMMANDS, "").replace(/\s+/g, "");
}

function normaliseInline(pieces: RichInline[]): string {
  return pieces
    .map((piece) => {
      if (piece.kind === "text") return piece.text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
      if (piece.kind === "math") return ` \\(${normaliseTex(piece.tex)}\\) `;
      return ` [fig${piece.index}] `;
    })
    .join("");
}

function normaliseField(text: string, inline: (pieces: RichInline[]) => string): string {
  const parts: string[] = [];
  for (const segment of parseRichText(normaliseDollarMath(text ?? ""))) {
    if (segment.kind === "table") {
      const rows = [...(segment.header ? [segment.header] : []), ...segment.rows];
      parts.push(rows.map((row) => row.map((cell) => inline(cell).trim()).join("|")).join("\n"));
    } else parts.push(inline([segment]));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** The comparable form of one field: case, whitespace, LaTeX spacing and `$` delimiters normalised. */
export function normaliseForFingerprint(text: string): string {
  return normaliseField(text, normaliseInline);
}

// Fidelity (§B2): an official question is "verbatim" only when it reads exactly as the paper did. Only
// whitespace, LaTeX spacing commands and `$…$` versus `\(…\)` are normalised; letter case, NFKC
// compatibility forms (x² versus x2, ligatures, full-width digits) and every other character count.

function fidelityTex(tex: string): string {
  // Whitespace in math mode is not rendered, except between a control word and a following letter.
  return tex
    .normalize("NFC")
    .replace(SPACING_COMMANDS, "")
    .replace(/(\\[A-Za-z]+)\s+(?=[A-Za-z])/g, "$1\u0000")
    .replace(/\s+/g, "")
    .replace(/\u0000/g, " ");
}

function fidelityInline(pieces: RichInline[]): string {
  return pieces
    .map((piece) => {
      if (piece.kind === "text") return piece.text.normalize("NFC").replace(/\s+/g, " ");
      if (piece.kind === "math") return ` \\(${fidelityTex(piece.tex)}\\) `;
      return ` [fig${piece.index}] `;
    })
    .join("");
}

/** The comparable form of one field for the fidelity diff: case-preserving, no NFKC. */
export function normaliseForFidelity(text: string): string {
  return normaliseField(text, fidelityInline);
}

function primary(text: Bilingual): string {
  return text.en.trim() !== "" ? text.en : text.hi;
}

/** Exact-duplicate fingerprint (32 hex characters). */
export function fingerprintOf(content: Pick<QbQuestionContent, "stem" | "options">): string {
  const stem = normaliseForFingerprint(primary(content.stem));
  const options = content.options.map((o) => normaliseForFingerprint(primary(o))).sort();
  return sha256Hex(`${stem}\u0001${options.join("\u0002")}`).slice(0, 32);
}

// ---------------------------------------------------------------------------------------------
// MinHash

function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const SEEDS: number[] = Array.from({ length: MINHASH_SIZE }, (_, i) => fmix32((Math.imul(i + 1, 0x9e3779b9) ^ 0x5bd1e995) >>> 0));

/** Word 3-shingles of the normalised stem (one shingle for stems under three words). */
export function shinglesOf(text: string): Set<string> {
  const words = normaliseForFingerprint(text).split(" ").filter(Boolean);
  const shingles = new Set<string>();
  if (words.length === 0) return shingles;
  if (words.length < 3) {
    shingles.add(words.join(" "));
    return shingles;
  }
  for (let i = 0; i + 3 <= words.length; i += 1) shingles.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return shingles;
}

/** A second, independent string hash (djb2-xor over the reversed string, mixed). */
function djb2Reverse(text: string): number {
  let h = 5381;
  for (let i = text.length - 1; i >= 0; i -= 1) h = (Math.imul(h, 33) ^ text.charCodeAt(i)) >>> 0;
  return fmix32(h);
}

/**
 * 64 hash functions by double hashing (h1 + i·h2, Kirsch–Mitzenmacher), each finished with a seeded
 * murmur3 mix, so the per-function orders are close to independent.
 */
export function minhashOfShingles(shingles: ReadonlySet<string>): Uint32Array {
  const signature = new Uint32Array(MINHASH_SIZE).fill(0xffffffff);
  for (const shingle of shingles) {
    const h1 = fmix32(fnv1a(shingle));
    const h2 = djb2Reverse(shingle) | 1;
    for (let i = 0; i < MINHASH_SIZE; i += 1) {
      const h = fmix32(((h1 + Math.imul(i + 1, h2)) ^ SEEDS[i]) >>> 0);
      if (h < signature[i]) signature[i] = h;
    }
  }
  return signature;
}

/** MinHash signature of a stem (uses the English text, else the Hindi). */
export function minhashOf(stem: Bilingual | string): Uint32Array {
  return minhashOfShingles(shinglesOf(typeof stem === "string" ? stem : primary(stem)));
}

/** Estimated Jaccard similarity of two signatures (share of equal components). */
export function jaccardEstimate(a: Uint32Array, b: Uint32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let equal = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] === b[i]) equal += 1;
  return equal / a.length;
}

/** Exact Jaccard similarity of two shingle sets (tests and staff diagnostics). */
export function exactJaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function minhashToBlob(signature: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(signature.length * 4);
  const view = new DataView(bytes.buffer);
  signature.forEach((value, i) => view.setUint32(i * 4, value, true));
  return bytes;
}

export function minhashFromBlob(blob: Uint8Array | null | undefined): Uint32Array | null {
  if (!blob || blob.length !== MINHASH_SIZE * 4) return null;
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const signature = new Uint32Array(MINHASH_SIZE);
  for (let i = 0; i < MINHASH_SIZE; i += 1) signature[i] = view.getUint32(i * 4, true);
  return signature;
}
