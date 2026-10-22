import "server-only";

import mammoth from "mammoth";

import { checkZip, readZipText, type ZipCheck } from "./zipguard";

/**
 * Word (.docx) bank files (docs/question-bank-plan.md §B8.8): `mammoth` converts the document to
 * HTML (after the zip guard), which becomes plain text with pipe tables and `[[image:N]]` markers
 * (images are figure candidates: the draft gets `figure_needed`). The text is split into chunks of
 * about 6,000 tokens for Claude to structure.
 *
 * Equations made with Word's equation editor (`<m:oMath>`) or embedded OLE objects (MathType) do not
 * survive the conversion, so the job warns: save the file as PDF and import the PDF instead.
 */

export const DOCX_CHUNK_CHARS = 24_000; // ≈ 6,000 tokens

export type DocxRead =
  | { ok: true; text: string; chunks: string[]; images: number; equationWarning: boolean }
  | { ok: false; reason: Exclude<ZipCheck, { ok: true }>["reason"] | "docx_not_word" | "docx_unreadable" | "docx_empty" };

/** `<m:oMath>` (Office Math) or OLE objects (MathType, Equation Editor 3.0) in the main document. */
export function hasWordEquations(documentXml: string): boolean {
  return /<m:oMath[\s>]|<m:oMathPara[\s>]|<o:OLEObject[\s>]|<w:object[\s>]|Equation\.(?:3|DSMT)/.test(documentXml);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Mammoth's HTML → plain text: paragraphs, list items, pipe tables, image markers. */
export function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<img[^>]*src="qbimg:(\d+)"[^>]*>/gi, (_m, n: string) => ` [[image:${n}]] `);
  text = text.replace(/<img[^>]*>/gi, " [[image:?]] ");
  // Tables: one line per row, cells separated by pipes.
  text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_m, body: string) => {
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => cell[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        .join(" | "),
    );
    return `\n\n${rows.map((row) => `| ${row} |`).join("\n")}\n\n`;
  });
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|h[1-6]|li|div)>/gi, "\n\n");
  text = text.replace(/<li[^>]*>/gi, "• ");
  text = text.replace(/<sup>([\s\S]*?)<\/sup>/gi, "^($1)");
  text = text.replace(/<sub>([\s\S]*?)<\/sub>/gi, "_($1)");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Splits at paragraph breaks into chunks of at most `maxChars` (a longer paragraph is cut hard). */
export function chunkText(text: string, maxChars: number = DOCX_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n\n+/)) {
    const piece = paragraph.trim();
    if (!piece) continue;
    if (current && current.length + piece.length + 2 > maxChars) {
      chunks.push(current);
      current = "";
    }
    if (piece.length > maxChars) {
      for (let start = 0; start < piece.length; start += maxChars) chunks.push(piece.slice(start, start + maxChars));
      continue;
    }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function readDocx(bytes: Uint8Array): Promise<DocxRead> {
  const zip = checkZip(bytes);
  if (!zip.ok) return { ok: false, reason: zip.reason };
  const documentXml = readZipText(bytes, zip.entries, "word/document.xml");
  if (documentXml === null) return { ok: false, reason: "docx_not_word" };
  const equationWarning = hasWordEquations(documentXml);
  let images = 0;
  let html: string;
  try {
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes) },
      {
        externalFileAccess: false,
        convertImage: mammoth.images.imgElement(async () => {
          images += 1;
          return { src: `qbimg:${images}` };
        }),
      },
    );
    html = result.value;
  } catch {
    return { ok: false, reason: "docx_unreadable" };
  }
  const text = htmlToText(html);
  if (!text) return { ok: false, reason: "docx_empty" };
  return { ok: true, text, chunks: chunkText(text), images, equationWarning };
}

/** Only the equation check (used at upload, before any conversion). */
export function docxEquationCheck(bytes: Uint8Array): { ok: true; equationWarning: boolean } | { ok: false; reason: string } {
  const zip = checkZip(bytes);
  if (!zip.ok) return { ok: false, reason: zip.reason };
  const documentXml = readZipText(bytes, zip.entries, "word/document.xml");
  if (documentXml === null) return { ok: false, reason: "docx_not_word" };
  return { ok: true, equationWarning: hasWordEquations(documentXml) };
}
