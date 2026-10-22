import "server-only";

import type { ImportDeps } from "./deps";
import { readDocx } from "./docx";
import type { BuildContext, RequestPlan } from "./extract";
import { PdfSlicer } from "./pdf";
import { chapterListBlock, KEY_SYSTEM_PROMPT, PAPER_SYSTEM_PROMPT } from "./prompt";
import type { ItemRecord, ImportRecord } from "./repo";
import { type ParsedOutput, parseKeyOutput, parsePaperOutput } from "./schema";
import { readImportFile } from "./storage";

/** What a running job reads from its stored file. */
export interface JobSource {
  slicer: PdfSlicer | null;
  wholePdfBase64: string | null;
  docxChunks: string[] | null;
}

export function isKeyJob(job: Pick<ImportRecord, "kind">): boolean {
  return job.kind === "pdf_key" || job.kind === "csv_key";
}

/** A Hindi paper that only supplies Hindi text for an English import (no drafts of its own). */
export function isPairingJob(job: Pick<ImportRecord, "kind" | "meta">): boolean {
  return job.kind === "pdf_paper" && job.meta.language === "hi" && !!job.meta.pairsWith;
}

/** Loads the job's stored file for extraction; throws `file_missing` when it is gone. */
export async function openJobSource(deps: Pick<ImportDeps, "config">, job: ImportRecord): Promise<JobSource> {
  const bytes = readImportFile(deps.config.dir, job.tempPath);
  if (!bytes || job.fileDeletedAt !== null) throw new Error("file_missing");
  if (job.kind === "docx_bank") {
    const docx = await readDocx(bytes);
    if (!docx.ok) throw new Error(docx.reason);
    return { slicer: null, wholePdfBase64: null, docxChunks: docx.chunks };
  }
  if (job.encrypted) return { slicer: null, wholePdfBase64: bytes.toString("base64"), docxChunks: null };
  return { slicer: await PdfSlicer.open(bytes), wholePdfBase64: null, docxChunks: null };
}

/** System prompt + the exam's confirmed chapter list (keys need no chapter list). */
export function systemTextFor(deps: Pick<ImportDeps, "hooks">, job: ImportRecord): string {
  if (isKeyJob(job)) return KEY_SYSTEM_PROMPT;
  const chapters = job.meta.exam ? deps.hooks.chapterListFor(job.meta.exam) : [];
  return PAPER_SYSTEM_PROMPT + chapterListBlock(chapters);
}

export function buildContextFor(deps: Pick<ImportDeps, "hooks" | "config">, job: ImportRecord, source: JobSource): BuildContext {
  return {
    kind: job.kind,
    meta: job.meta,
    model: job.model ?? deps.config.model,
    effort: job.effort ?? deps.config.effort,
    maxTokens: deps.config.maxTokens,
    systemText: systemTextFor(deps, job),
    totalPages: job.pages,
    slicer: source.slicer,
    wholePdfBase64: source.wholePdfBase64,
  };
}

/** The request plan of one item. PDF items carry a lookahead page (not keys); Word items carry text. */
export function planForItem(job: ImportRecord, item: Pick<ItemRecord, "pageFrom" | "pageTo">, source: Pick<JobSource, "docxChunks"> | null): RequestPlan {
  if (job.kind === "docx_bank") {
    const part = item.pageFrom ?? 1;
    const chunks = source?.docxChunks ?? [];
    return { type: "text", part, parts: Math.max(chunks.length, job.progressTotal), text: chunks[part - 1] ?? "" };
  }
  const pageFrom = item.pageFrom ?? 1;
  const pageTo = item.pageTo ?? pageFrom;
  const lookahead = isKeyJob(job) || job.pages === null || pageTo >= job.pages ? null : pageTo + 1;
  return { type: "pdf", pageFrom, pageTo, lookahead };
}

/** Parser for an item's response without rebuilding the request (batch results). */
export function parserFor(job: ImportRecord, plan: RequestPlan): (text: string | null) => ParsedOutput {
  if (plan.type === "text") return (text) => parsePaperOutput(text, 0, null);
  const offset = job.encrypted ? 0 : plan.pageFrom - 1;
  if (isKeyJob(job)) return (text) => parseKeyOutput(text, offset);
  const own = { from: plan.pageFrom, to: plan.pageTo };
  return (text) => parsePaperOutput(text, offset, own);
}

/** `custom_id` of a batch request (the Batches API allows only `[A-Za-z0-9_-]{1,64}`). */
export function customIdOf(importId: string, seq: number): string {
  return `${importId}-${seq}`;
}

export function seqFromCustomId(importId: string, customId: string): number | null {
  const prefix = `${importId}-`;
  if (!customId.startsWith(prefix)) return null;
  const seq = Number(customId.slice(prefix.length));
  return Number.isInteger(seq) && seq >= 0 ? seq : null;
}
