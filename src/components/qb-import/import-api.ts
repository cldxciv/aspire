/**
 * Browser calls to /api/admin/qb/imports/** (same-origin; D-007 envelope plus `reason`). Never
 * throws: network failures and error envelopes come back as `{ ok: false, … }`. The upload is
 * `multipart/form-data` (fetch sets the boundary and the Content-Length the server compares).
 */
import type { ImportJobView, TabularReport } from "@/lib/qb/import/types";
import type { QbExam, QbImportKind, QbImportMeta } from "@/lib/qb/types";

export interface ImportSummaryView {
  ai: { enabled: boolean; reason: "env_off" | "setting_off" | "no_api_key" | null };
  spentTodayUsd: number;
  dailyCapUsd: number;
  maxFileBytes: number;
  batchMinPages: number;
  model: string;
  confirmedExams: QbExam[];
  retentionDays: number;
}

export interface ImportViewerInfo {
  role: "admin" | "reviewer" | "author";
  can: { importTabular: boolean; importAi: boolean; approve: boolean };
}

export type ImportFailure = {
  ok: false;
  status: number;
  /** Envelope code, or "network". */
  error: string;
  /** The API's machine-readable reason, when it gave one. */
  reason: string | null;
  report: TabularReport | null;
  fieldErrors: Record<string, string[]>;
};

export type ImportCall<T> = { ok: true; data: T } | ImportFailure;

const BASE = "/api/admin/qb/imports";

async function read<T>(response: Response): Promise<ImportCall<T>> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (response.ok && record.ok === true) return { ok: true, data: record.data as T };
  return {
    ok: false,
    status: response.status,
    error: typeof record.error === "string" ? record.error : "server_error",
    reason: typeof record.reason === "string" ? record.reason : null,
    report: (record.report as TabularReport | undefined) ?? null,
    fieldErrors: (record.fieldErrors as Record<string, string[]> | undefined) ?? {},
  };
}

function networkFailure(): ImportFailure {
  return { ok: false, status: 0, error: "network", reason: null, report: null, fieldErrors: {} };
}

async function send<T>(path: string, init: RequestInit = {}): Promise<ImportCall<T>> {
  if (!path.startsWith(BASE)) throw new Error("import calls only");
  try {
    return await read<T>(await fetch(path, { credentials: "same-origin", cache: "no-store", ...init }));
  } catch {
    return networkFailure();
  }
}

export function listImports() {
  return send<{ summary: ImportSummaryView; viewer: ImportViewerInfo; imports: ImportJobView[] }>(BASE);
}

export function getImportJob(id: string) {
  return send<{ job: ImportJobView; summary: ImportSummaryView; viewer: ImportViewerInfo }>(`${BASE}/${encodeURIComponent(id)}`);
}

export type ImportActionRequest =
  | { action: "run"; options?: { mode?: "sync" | "batch" } }
  | { action: "pause" | "cancel" | "retry_failed" | "close" | "create_drafts" | "confirm_snapshot" };

export function importAction(id: string, body: ImportActionRequest) {
  return send<{ job: ImportJobView; summary: ImportSummaryView; viewer: ImportViewerInfo }>(`${BASE}/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The multipart body of an upload (exported for tests: no network). */
export function uploadForm(input: { file: Blob; fileName: string; kind: QbImportKind; meta: QbImportMeta; licenceAck: boolean; licenceNote: string; mode: "" | "sync" | "batch" }): FormData {
  const form = new FormData();
  form.append("file", input.file, input.fileName);
  form.append("kind", input.kind);
  form.append("meta", JSON.stringify(input.meta));
  form.append("licenceAck", input.licenceAck ? "true" : "false");
  if (input.licenceNote.trim()) form.append("licenceNote", input.licenceNote.trim());
  if (input.mode) form.append("mode", input.mode);
  return form;
}

export function uploadImport(form: FormData) {
  return send<ImportJobView>(BASE, { method: "POST", body: form });
}

export const TEMPLATE_PATHS = {
  bank: `${BASE}/template?kind=csv_bank`,
  key: `${BASE}/template?kind=csv_key`,
} as const;

export function sourcePath(id: string): string {
  return `${BASE}/${encodeURIComponent(id)}/source`;
}
