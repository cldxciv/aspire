/**
 * Pure helpers of the import screens (client-safe, no hooks): which actions a job offers, upload
 * form checks that mirror the server's rules (the API re-checks everything), localised reasons,
 * money and number formatting. Tested in import-view.test.ts.
 */
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import type { ImportJobView, TabularReport } from "@/lib/qb/import/types";
import type { QbExam, QbImportKind, QbImportMeta, QbImportStatus } from "@/lib/qb/types";

export type ImportMessages = Messages<"qbImport">;

export const IMPORT_KIND_ORDER: readonly QbImportKind[] = ["pdf_paper", "pdf_key", "pdf_bank", "docx_bank", "xlsx_bank", "csv_bank", "csv_key"];
export const AI_IMPORT_KINDS: readonly QbImportKind[] = ["pdf_paper", "pdf_key", "pdf_bank", "docx_bank"];
export const UPLOAD_EXAMS: readonly QbExam[] = ["JEE_MAIN", "NEET", "JEE_ADV", "BOH"];

export function isAiImportKind(kind: QbImportKind): boolean {
  return AI_IMPORT_KINDS.includes(kind);
}

/** The file picker's `accept` per kind. */
export function acceptFor(kind: QbImportKind): string {
  if (kind.startsWith("pdf_")) return "application/pdf,.pdf";
  if (kind === "docx_bank") return ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (kind === "xlsx_bank") return ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return ".csv,text/csv";
}

/** Kinds this viewer may upload (AI kinds need `import_ai`). */
export function uploadKinds(canAi: boolean): QbImportKind[] {
  return IMPORT_KIND_ORDER.filter((kind) => canAi || !isAiImportKind(kind));
}

/**
 * Source kinds a file kind allows: question files are Aspire's own; papers and keys may be official.
 * An official key sets the official answers, so an official key CSV needs `import_ai` like the key
 * PDF (the server checks this too).
 */
export function sourceKindsFor(kind: QbImportKind, canAi = true): ("official" | "aspire")[] {
  if (kind === "pdf_paper" || kind === "pdf_key") return ["official", "aspire"];
  if (kind === "csv_key") return canAi ? ["official", "aspire"] : ["aspire"];
  return ["aspire"];
}

/** Whether an import of `kind` from `sourceKind` needs `import_ai` (AI kinds and official key CSVs). */
export function needsImportAi(kind: QbImportKind, sourceKind: "official" | "aspire" | undefined): boolean {
  return isAiImportKind(kind) || (kind === "csv_key" && sourceKind === "official");
}

/**
 * Paper imports a key may be applied to: same source kind (an official key only for official
 * papers, an Aspire key only for Aspire files), never a key or a cancelled import.
 */
export function keyTargetsFor<T extends Pick<ImportJobView, "kind" | "status" | "meta">>(papers: readonly T[], sourceKind: "official" | "aspire"): T[] {
  return papers.filter((paper) => paper.kind !== "pdf_key" && paper.kind !== "csv_key" && paper.status !== "cancelled" && paper.meta.sourceKind === sourceKind);
}

export interface UploadDraft {
  kind: QbImportKind;
  sourceKind: "official" | "aspire";
  exam: QbExam | "";
  year: string;
  date: string;
  session: string;
  shift: string;
  paper: string;
  booklet: string;
  language: "en" | "hi" | "bilingual";
  pairsWith: string;
  keyFor: string[];
  keyStage: "" | "provisional" | "final";
  aspireRef: string;
  mode: "" | "sync" | "batch";
  licenceAck: boolean;
  licenceNote: string;
  fileSize: number | null;
}

export const EMPTY_UPLOAD: UploadDraft = {
  kind: "pdf_paper",
  sourceKind: "official",
  exam: "",
  year: "",
  date: "",
  session: "",
  shift: "",
  paper: "",
  booklet: "",
  language: "en",
  pairsWith: "",
  keyFor: [],
  keyStage: "",
  aspireRef: "",
  mode: "",
  licenceAck: false,
  licenceNote: "",
  fileSize: null,
};

/** Which fields the form shows for a kind and source. */
export function visibleFields(draft: Pick<UploadDraft, "kind" | "sourceKind" | "language">) {
  const official = draft.sourceKind === "official";
  const paper = draft.kind === "pdf_paper";
  const key = draft.kind === "pdf_key" || draft.kind === "csv_key";
  return {
    exam: true,
    year: official,
    date: official && (paper || key),
    session: official && (paper || key),
    shift: official && (paper || key),
    paper: official && (paper || key),
    booklet: official && (paper || key),
    language: paper || draft.kind === "pdf_bank" || draft.kind === "docx_bank",
    pairsWith: paper && draft.language === "hi",
    keyFor: key,
    keyStage: key && official,
    aspireRef: !official,
    mode: isAiImportKind(draft.kind),
  };
}

/**
 * Field problems before sending (keys are form field names). Mirrors the server's metadata rules so
 * staff see them early; the server re-checks everything.
 */
export function uploadProblems(draft: UploadDraft, maxBytes: number): Record<string, "required" | "too_large" | "invalid"> {
  const problems: Record<string, "required" | "too_large" | "invalid"> = {};
  if (draft.fileSize === null) problems.file = "required";
  else if (draft.fileSize > maxBytes) problems.file = "too_large";
  if (!draft.licenceAck) problems.licenceAck = "required";
  const official = draft.sourceKind === "official";
  if (isAiImportKind(draft.kind) && !draft.exam) problems.exam = "required";
  if (official) {
    if (!draft.exam) problems.exam = "required";
    if (!/^(19|20)\d{2}$/.test(draft.year.trim())) problems.year = draft.year.trim() ? "invalid" : "required";
  }
  if (draft.date && !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) problems.date = "invalid";
  if (draft.kind === "pdf_paper" && official) {
    if (draft.exam === "JEE_MAIN") {
      if (!draft.date) problems.date = "required";
      if (!draft.shift.trim()) problems.shift = "required";
    }
    if (draft.exam === "NEET" && !draft.booklet.trim()) problems.booklet = "required";
    if (draft.exam === "JEE_ADV" && !draft.paper.trim()) problems.paper = "required";
    if (draft.language === "hi" && !draft.pairsWith) problems.pairsWith = "required";
  }
  if ((draft.kind === "pdf_key" || draft.kind === "csv_key") && official && !draft.keyStage) problems.keyStage = "required";
  return problems;
}

/** The `meta` JSON the API expects (empty fields left out). */
export function metaFromDraft(draft: UploadDraft): QbImportMeta {
  const fields = visibleFields(draft);
  const meta: QbImportMeta = { sourceKind: draft.sourceKind, language: fields.language ? draft.language : "en" };
  if (draft.exam) meta.exam = draft.exam;
  if (fields.year && draft.year.trim()) meta.year = Number(draft.year.trim());
  if (fields.date && draft.date) meta.date = draft.date;
  if (fields.session && draft.session.trim()) meta.session = draft.session.trim();
  if (fields.shift && draft.shift.trim()) meta.shift = draft.shift.trim();
  if (fields.paper && draft.paper.trim()) meta.paper = draft.paper.trim();
  if (fields.booklet && draft.booklet.trim()) meta.booklet = draft.booklet.trim();
  if (fields.pairsWith && draft.pairsWith) meta.pairsWith = draft.pairsWith;
  if (fields.keyFor && draft.keyFor.length > 0) meta.keyFor = [...draft.keyFor];
  if (fields.keyStage && draft.keyStage) meta.keyStage = draft.keyStage;
  if (fields.aspireRef && draft.aspireRef.trim()) meta.aspireRef = draft.aspireRef.trim();
  return meta;
}

export type JobActionKey = "run" | "runFast" | "resume" | "pause" | "cancel" | "retry" | "close" | "createDrafts" | "confirmSnapshot";

/** The actions a job offers this viewer now (the API re-checks status and capability). */
export function availableActions(
  job: Pick<ImportJobView, "kind" | "status" | "mode" | "items" | "patternSnapshot" | "report"> & { meta?: Pick<ImportJobView["meta"], "sourceKind"> },
  can: { importAi: boolean; importTabular: boolean; approve: boolean },
  aiEnabled: boolean,
): JobActionKey[] {
  const actions: JobActionKey[] = [];
  const ai = isAiImportKind(job.kind);
  const busy = job.status === "running" || job.status === "waiting_batch";
  if (ai && can.importAi) {
    // "Read with AI" uses the job's own mode; "fast" is offered only when that mode is batch.
    if (aiEnabled && job.status === "ready") actions.push("run");
    if (aiEnabled && job.status === "ready" && job.mode === "batch") actions.push("runFast");
    if (aiEnabled && (job.status === "paused" || job.status === "failed")) actions.push("resume");
    if (busy) actions.push("pause");
    if (aiEnabled && (job.status === "done" || job.status === "failed" || job.status === "paused") && job.items.failed + job.items.refused > 0) actions.push("retry");
  }
  const tabularAllowed = needsImportAi(job.kind, job.meta?.sourceKind) ? can.importAi : can.importTabular;
  if (!ai && tabularAllowed && (job.status === "ready" || job.status === "done") && (job.report?.valid ?? 0) > 0) actions.push("createDrafts");
  if (ai && can.approve && job.patternSnapshot && job.patternSnapshot.sections.length > 0 && job.patternSnapshot.confirmedAt === null && job.kind !== "pdf_key") {
    actions.push("confirmSnapshot");
  }
  const mayManage = ai ? can.importAi : tabularAllowed;
  if (mayManage && ["uploaded", "ready", "running", "waiting_batch", "paused", "failed"].includes(job.status)) actions.push("cancel");
  if (mayManage && !busy && job.status !== "closed") actions.push("close");
  return actions;
}

/** Poll while a job is working on its own. */
export function shouldPoll(status: QbImportStatus): boolean {
  return status === "running" || status === "waiting_batch";
}

/**
 * The question list filtered to this import's questions, offered once the job has stopped working:
 * while it runs, a later page may still reveal a third-party mark that must reach every draft.
 */
export function reviewLink(job: Pick<ImportJobView, "id" | "status" | "draftsCreated">): string | null {
  if (job.draftsCreated <= 0 || shouldPoll(job.status)) return null;
  return `/admin/questions?import=${encodeURIComponent(job.id)}`;
}

export function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "hi" ? "hi-IN" : "en-IN", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "hi" ? "hi-IN" : "en-IN").format(Math.round(value));
}

export function formatDateTime(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(ms));
}

export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/** A failure `reason` from the API in the viewer's language. */
export function reasonMessage(t: ImportMessages, reason: string, statusLabel?: (status: string) => string): string {
  const reasons = t.errors.reasons as Record<string, string>;
  if (reasons[reason]) return reasons[reason];
  const base = reason.split(":")[0];
  if (base === "ai_disabled") {
    const why = reason.split(":")[1] as keyof ImportMessages["ai"]["off"] | undefined;
    return why && t.ai.off[why] ? t.ai.off[why] : reasons.ai_disabled;
  }
  if (base.startsWith("status_")) {
    const status = base.slice("status_".length);
    return format(reasons.status, { status: statusLabel ? statusLabel(status) : status });
  }
  for (const family of ["pdf", "zip", "docx", "xlsx", "csv"]) if (base.startsWith(`${family}_`)) return reasons[family];
  return format(reasons.other, { reason: base });
}

const HEADER_FIELDS = ["exam", "year", "date", "shift", "paper", "booklet"] as const;

/** The job's error column (`items_failed:N`, `retention`, a runner or API code) in the viewer's language. */
export function jobErrorMessage(t: ImportMessages, error: string): string {
  const [base, detail] = error.split(":");
  if (base === "items_failed") return format(t.job.itemsFailed, { n: Number(detail) || 0 });
  if (base === "retention") return t.job.retentionClosed;
  if (base === "key_header_mismatch") {
    const fields = (detail ?? "")
      .split(",")
      .filter((field): field is (typeof HEADER_FIELDS)[number] => (HEADER_FIELDS as readonly string[]).includes(field))
      .map((field) => t.form[field]);
    return format(t.job.keyHeaderMismatch, { fields: fields.join(", ") });
  }
  const reasons = t.errors.reasons as Record<string, string>;
  if (reasons[base]) return reasons[base];
  return format(t.job.stopped, { code: base });
}

/** A dry-run report code in the viewer's language. */
export function reportCodeMessage(t: ImportMessages, code: string): string {
  const codes = t.report.codes as Record<string, string>;
  return codes[code] ?? format(t.report.codes.other, { code });
}

/** An unmatched key / pairing reason in the viewer's language. */
export function applyReasonMessage(t: ImportMessages, reason: string): string {
  const reasons = t.apply.reasons as Record<string, string>;
  return reasons[reason] ?? format(t.apply.reasons.other, { reason });
}

/** Rows the "Create N drafts" / "Apply the key" button names. */
export function creatableRows(report: TabularReport | null): number {
  return report?.valid ?? 0;
}
