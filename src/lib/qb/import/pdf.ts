import "server-only";

import { PDFDocument } from "pdf-lib";

/**
 * PDF handling for imports (docs/question-bank-plan.md §B8.1, §B8.3), with `pdf-lib` (pinned):
 * - `inspectPdf`: page count and the encryption flag (loaded with `ignoreEncryption`).
 * - `planPageItems`: own pages per request plus one lookahead page. The model outputs only the
 *   questions that START on its own pages and uses the lookahead page only to finish one, so no
 *   overlap merging is needed.
 * - `PdfSlicer`: builds each request's PDF with `copyPages` (source loaded once per run).
 * Encrypted PDFs cannot be split: the whole file is sent as one cached document block and each
 * request names its page range (extract.ts).
 */

export function isPdf(bytes: Uint8Array): boolean {
  // The header must be at the very start (a UTF-8 BOM before it is tolerated).
  const head = Buffer.from(bytes.subarray(0, 8)).toString("latin1");
  return head.startsWith("%PDF-") || head.startsWith("\xEF\xBB\xBF%PDF-");
}

export type PdfInspection = { ok: true; pages: number; encrypted: boolean } | { ok: false; reason: "pdf_unreadable" | "pdf_empty" };

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = doc.getPageCount();
    if (pages < 1) return { ok: false, reason: "pdf_empty" };
    return { ok: true, pages, encrypted: doc.isEncrypted };
  } catch {
    return { ok: false, reason: "pdf_unreadable" };
  }
}

export interface PageItemPlan {
  pageFrom: number;
  pageTo: number;
  /** The page after `pageTo`, sent only so the model can finish a question; null on the last item. */
  lookahead: number | null;
}

/** Consecutive page ranges of `perItem` pages (1-based, inclusive), each with its lookahead page. */
export function planPageItems(pages: number, perItem: number): PageItemPlan[] {
  const size = Math.max(1, Math.floor(perItem));
  const plans: PageItemPlan[] = [];
  for (let from = 1; from <= pages; from += size) {
    const to = Math.min(pages, from + size - 1);
    plans.push({ pageFrom: from, pageTo: to, lookahead: to < pages ? to + 1 : null });
  }
  return plans;
}

/** Splits a page range in two halves (for a `max_tokens` retry); null when it has one page. */
export function halvePages(pageFrom: number, pageTo: number, totalPages: number): [PageItemPlan, PageItemPlan] | null {
  if (pageTo <= pageFrom) return null;
  const mid = Math.floor((pageFrom + pageTo) / 2);
  return [
    { pageFrom, pageTo: mid, lookahead: mid + 1 },
    { pageFrom: mid + 1, pageTo, lookahead: pageTo < totalPages ? pageTo + 1 : null },
  ];
}

/** Builds request PDFs from one loaded source document. */
export class PdfSlicer {
  private constructor(private readonly source: PDFDocument) {}

  static async open(bytes: Uint8Array): Promise<PdfSlicer> {
    return new PdfSlicer(await PDFDocument.load(bytes, { updateMetadata: false }));
  }

  get pageCount(): number {
    return this.source.getPageCount();
  }

  /** A new PDF with the given 1-based pages, in order. */
  async slice(pages: readonly number[]): Promise<Uint8Array> {
    const out = await PDFDocument.create({ updateMetadata: false });
    const copied = await out.copyPages(
      this.source,
      pages.map((page) => page - 1),
    );
    for (const page of copied) out.addPage(page);
    return out.save({ useObjectStreams: true });
  }
}

/** The pages a request carries: its own pages, then the lookahead page. */
export function requestPages(plan: PageItemPlan): number[] {
  const pages: number[] = [];
  for (let page = plan.pageFrom; page <= plan.pageTo; page += 1) pages.push(page);
  if (plan.lookahead !== null) pages.push(plan.lookahead);
  return pages;
}
