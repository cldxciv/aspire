import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en/qbImport";
import hi from "@/i18n/messages/hi/qbImport";
import type { ImportJobView } from "@/lib/qb/import/types";

import { uploadForm } from "./import-api";
import {
  availableActions,
  EMPTY_UPLOAD,
  jobErrorMessage,
  keyTargetsFor,
  metaFromDraft,
  reasonMessage,
  reportCodeMessage,
  reviewLink,
  shouldPoll,
  sourceKindsFor,
  type UploadDraft,
  uploadKinds,
  uploadProblems,
  visibleFields,
} from "./import-view";

function job(overrides: Partial<ImportJobView> = {}): ImportJobView {
  return {
    id: "imp_aaaaaaaaaaaaaaaa",
    kind: "pdf_paper",
    status: "ready",
    mode: "batch",
    fileName: "paper.pdf",
    fileSize: 1000,
    fileAvailable: true,
    pages: 30,
    rows: null,
    encrypted: false,
    meta: { sourceKind: "official", exam: "JEE_MAIN", year: 2025, language: "en" },
    model: "claude-opus-5-5",
    effort: "medium",
    estimate: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0, calls: 0 },
    progress: { done: 0, total: 5 },
    items: { pending: 5, submitted: 0, running: 0, done: 0, failed: 0, refused: 0 },
    draftsCreated: 0,
    pageMarks: [],
    thirdParty: false,
    patternSnapshot: null,
    warnings: [],
    report: null,
    apply: null,
    error: null,
    pauseReason: null,
    licence: { by: "u", at: 0, note: null },
    createdBy: "u",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const REVIEWER = { importAi: true, importTabular: true, approve: true };
const AUTHOR = { importAi: false, importTabular: true, approve: false };

describe("job actions", () => {
  it("offers reading only to AI-capable staff while AI import is on", () => {
    expect(availableActions(job(), REVIEWER, true)).toEqual(["run", "runFast", "cancel", "close"]);
    expect(availableActions(job({ mode: "sync" }), REVIEWER, true)).toEqual(["run", "cancel", "close"]);
    expect(availableActions(job(), REVIEWER, false)).toEqual(["cancel", "close"]);
    expect(availableActions(job(), AUTHOR, true)).toEqual([]);
  });

  it("pauses busy jobs, retries failed parts, and never closes a running job", () => {
    expect(availableActions(job({ status: "running" }), REVIEWER, true)).toEqual(["pause", "cancel"]);
    expect(availableActions(job({ status: "done", items: { pending: 0, submitted: 0, running: 0, done: 4, failed: 1, refused: 0 } }), REVIEWER, true)).toEqual(["retry", "close"]);
    expect(availableActions(job({ status: "closed" }), REVIEWER, true)).toEqual([]);
  });

  it("lets an author create drafts from a valid tabular file", () => {
    const report = { kind: "bank" as const, rows: 3, valid: 2, errors: [], warnings: [], bySubject: {}, byExam: {}, flags: {}, moreErrors: 0 };
    expect(availableActions(job({ kind: "csv_bank", mode: "none", report }), AUTHOR, false)).toEqual(["createDrafts", "cancel", "close"]);
    expect(availableActions(job({ kind: "csv_bank", mode: "none", report: { ...report, valid: 0 } }), AUTHOR, false)).toEqual(["cancel", "close"]);
  });

  it("asks a reviewer to confirm an unconfirmed pattern snapshot", () => {
    const snapshot = { sections: [{ page: 1, subject: null, section: null, text: "Synthetic instructions" }], confirmedBy: null, confirmedAt: null, note: null };
    expect(availableActions(job({ status: "done", patternSnapshot: snapshot }), REVIEWER, true)).toContain("confirmSnapshot");
    expect(availableActions(job({ status: "done", patternSnapshot: { ...snapshot, confirmedAt: 1 } }), REVIEWER, true)).not.toContain("confirmSnapshot");
    expect(shouldPoll("waiting_batch")).toBe(true);
    expect(shouldPoll("done")).toBe(false);
  });
});

describe("upload form", () => {
  const draft = (overrides: Partial<UploadDraft>): UploadDraft => ({ ...EMPTY_UPLOAD, fileSize: 1000, licenceAck: true, ...overrides });

  it("shows only the kinds the viewer may upload, and the fields a kind needs", () => {
    expect(uploadKinds(false)).toEqual(["xlsx_bank", "csv_bank", "csv_key"]);
    expect(uploadKinds(true)).toHaveLength(7);
    expect(visibleFields({ kind: "pdf_paper", sourceKind: "official", language: "hi" })).toMatchObject({ shift: true, booklet: true, pairsWith: true, keyFor: false });
    expect(visibleFields({ kind: "csv_bank", sourceKind: "aspire", language: "en" })).toMatchObject({ year: false, shift: false, aspireRef: true, mode: false });
  });

  it("mirrors the server's metadata rules", () => {
    expect(uploadProblems(draft({ fileSize: null, licenceAck: false }), 9_000_000)).toMatchObject({ file: "required", licenceAck: "required" });
    expect(uploadProblems(draft({ fileSize: 10_000_000 }), 9_000_000).file).toBe("too_large");
    expect(uploadProblems(draft({ exam: "JEE_MAIN", year: "2025" }), 9_000_000)).toEqual({ date: "required", shift: "required" });
    expect(uploadProblems(draft({ exam: "NEET", year: "2025" }), 9_000_000)).toEqual({ booklet: "required" });
    expect(uploadProblems(draft({ exam: "JEE_ADV", year: "25" }), 9_000_000)).toEqual({ year: "invalid", paper: "required" });
    expect(uploadProblems(draft({ kind: "csv_key", exam: "NEET", year: "2025" }), 9_000_000)).toEqual({ keyStage: "required" });
    expect(uploadProblems(draft({ kind: "csv_bank", sourceKind: "aspire" }), 9_000_000)).toEqual({});
  });

  it("offers official keys only to import_ai staff, and only matching papers as key targets", () => {
    expect(sourceKindsFor("csv_key", false)).toEqual(["aspire"]);
    expect(sourceKindsFor("csv_key", true)).toEqual(["official", "aspire"]);
    expect(sourceKindsFor("csv_bank", true)).toEqual(["aspire"]);
    const official = job({ id: "imp_official00000000" });
    const aspire = job({ id: "imp_aspire0000000000", kind: "csv_bank", meta: { sourceKind: "aspire", language: "en" } });
    const key = job({ id: "imp_key0000000000000", kind: "csv_key" });
    const papers = [official, aspire, key, job({ id: "imp_gone000000000000", status: "cancelled" })];
    expect(keyTargetsFor(papers, "official").map((paper) => paper.id)).toEqual([official.id]);
    expect(keyTargetsFor(papers, "aspire").map((paper) => paper.id)).toEqual([aspire.id]);
    const report = { kind: "key" as const, rows: 1, valid: 1, errors: [], warnings: [], bySubject: {}, byExam: {}, flags: {}, moreErrors: 0 };
    const officialKey = job({ kind: "csv_key", mode: "none", report });
    expect(availableActions(officialKey, AUTHOR, false)).toEqual([]);
    expect(availableActions(officialKey, REVIEWER, false)).toEqual(["createDrafts", "cancel", "close"]);
    expect(availableActions(job({ kind: "csv_key", mode: "none", report, meta: { sourceKind: "aspire", language: "en" } }), AUTHOR, false)).toContain("createDrafts");
  });

  it("links to this import's questions only once reading has stopped", () => {
    expect(reviewLink(job({ status: "running", draftsCreated: 4 }))).toBeNull();
    expect(reviewLink(job({ status: "done", draftsCreated: 0 }))).toBeNull();
    expect(reviewLink(job({ status: "done", draftsCreated: 4 }))).toBe("/admin/questions?import=imp_aaaaaaaaaaaaaaaa");
  });

  it("builds the metadata and the multipart body without empty fields", async () => {
    const meta = metaFromDraft(draft({ exam: "JEE_MAIN", year: "2025", date: "2025-01-22", shift: " Shift 1 ", session: "", aspireRef: "ignored for official" }));
    expect(meta).toEqual({ sourceKind: "official", language: "en", exam: "JEE_MAIN", year: 2025, date: "2025-01-22", shift: "Shift 1" });
    const form = uploadForm({ file: new Blob(["%PDF-1.7"]), fileName: "p.pdf", kind: "pdf_paper", meta, licenceAck: true, licenceNote: " https://jeemain.nta.nic.in ", mode: "batch" });
    expect(form.get("kind")).toBe("pdf_paper");
    expect(JSON.parse(String(form.get("meta")))).toEqual(meta);
    expect(form.get("licenceAck")).toBe("true");
    expect(form.get("licenceNote")).toBe("https://jeemain.nta.nic.in");
    expect(form.get("mode")).toBe("batch");
    expect((form.get("file") as File).name).toBe("p.pdf");
  });
});

describe("messages", () => {
  it("localises API reasons, report codes and job errors, with a fallback", () => {
    expect(reasonMessage(en, "taxonomy_unconfirmed")).toBe(en.errors.reasons.taxonomy_unconfirmed);
    expect(reasonMessage(en, "ai_disabled:setting_off")).toBe(en.ai.off.setting_off);
    expect(reasonMessage(en, "status_running", (status) => en.status[status as "running"])).toBe("This is not possible while the import is Reading.");
    expect(reasonMessage(en, "zip_too_large")).toBe(en.errors.reasons.zip);
    expect(reasonMessage(en, "brand_new_reason")).toBe("The request could not be completed (brand_new_reason).");
    expect(reportCodeMessage(hi, "unknown_exam")).toBe(hi.report.codes.unknown_exam);
    expect(jobErrorMessage(en, "items_failed:3")).toBe("3 parts could not be read. Use “Retry failed parts”.");
    expect(jobErrorMessage(en, "api_529")).toBe("The import stopped (api_529). Resume it, or retry the failed parts.");
    expect(jobErrorMessage(en, "key_header_mismatch:shift,date")).toContain("(Shift, Exam date)");
    expect(jobErrorMessage(hi, "key_header_mismatch:shift")).toContain(hi.form.shift);
  });

  it("has the same keys in English and Hindi", () => {
    const shape = (value: unknown): unknown =>
      Array.isArray(value) ? value.length : typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)])) : typeof value;
    expect(shape(hi)).toEqual(shape(en));
  });
});
