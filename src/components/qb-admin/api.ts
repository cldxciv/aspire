/**
 * Browser-side calls to the question-bank admin API (`/api/admin/qb/**`, D-007 envelope plus the
 * 409 `code`). Every request is a pure builder (`qbRequests.*`) so tests can check the exact path,
 * method and body without a network; `qbCall` sends one and never throws. Client-safe.
 */
import { format } from "@/i18n/format";
import { PASSWORD_CHANGE_REQUIRED_TEXT } from "@/lib/auth/client-api";
import type { Messages } from "@/i18n/messages/types";
import type { QbExam, QbSlot, QbSubject } from "@/lib/qb/types";
import type {
  QbBlueprintAction,
  QbBlueprintEditable,
  QbBulkOp,
  QbChapterInput,
  QbCorrectionInput,
  QbDuplicateDecision,
  QbMemberInput,
  QbQuestionAction,
  QbQuestionInput,
  QbQuestionPatch,
  QbReportStatus,
  QbSettingsPatch,
  QbUnitInput,
} from "./contract";
import { isOneOf } from "./constants";
import { QB_CONFLICT_CODES } from "./contract";
import { questionFiltersToQuery, type QbQuestionFilters } from "./filters";

export type QbMessages = Messages<"qb">;

export type QbRequest = { path: string; method: "GET" | "POST" | "PATCH" | "PUT"; body?: unknown };

const BASE = "/api/admin/qb";
const enc = encodeURIComponent;

export const qbRequests = {
  listQuestions: (filters: Partial<QbQuestionFilters>): QbRequest => ({ path: `${BASE}/questions${questionFiltersToQuery(filters)}`, method: "GET" }),
  getQuestion: (id: string, spotCheckBatchId?: string): QbRequest => ({
    path: `${BASE}/questions/${enc(id)}${spotCheckBatchId ? `?spotCheck=${enc(spotCheckBatchId)}` : ""}`,
    method: "GET",
  }),
  createQuestion: (input: QbQuestionInput): QbRequest => ({ path: `${BASE}/questions`, method: "POST", body: input }),
  updateQuestion: (id: string, patch: QbQuestionPatch): QbRequest => ({ path: `${BASE}/questions/${enc(id)}`, method: "PATCH", body: patch }),
  questionAction: (id: string, action: QbQuestionAction): QbRequest => ({ path: `${BASE}/questions/${enc(id)}/actions`, method: "POST", body: action }),
  bulkStart: (op: QbBulkOp, ids: readonly string[], exam: QbExam | null): QbRequest =>
    op === "approve"
      ? { path: `${BASE}/questions/bulk`, method: "POST", body: { action: "start", ids: [...ids] } }
      : { path: `${BASE}/questions/bulk-labels`, method: "POST", body: { action: "start", op, exam, ids: [...ids] } },
  bulkCommit: (op: QbBulkOp, body: { batchId: string; checks: { id: string; token: string; ok: boolean }[] }): QbRequest =>
    op === "approve"
      ? { path: `${BASE}/questions/bulk`, method: "POST", body: { action: "commit", ...body } }
      : { path: `${BASE}/questions/bulk-labels`, method: "POST", body: { action: "commit", op, ...body } },
  bulkCancel: (op: QbBulkOp, batchId: string): QbRequest =>
    op === "approve"
      ? { path: `${BASE}/questions/bulk`, method: "POST", body: { action: "cancel", batchId } }
      : { path: `${BASE}/questions/bulk-labels`, method: "POST", body: { action: "cancel", op, batchId } },
  units: (exam: QbExam): QbRequest => ({ path: `${BASE}/units?exam=${exam}`, method: "GET" }),
  saveUnit: (input: QbUnitInput): QbRequest => ({ path: `${BASE}/units`, method: "POST", body: input }),
  chapters: (filter: { exam?: QbExam; subject?: QbSubject; all?: boolean } = {}): QbRequest => {
    const params = new URLSearchParams();
    if (filter.exam) params.set("exam", filter.exam);
    if (filter.subject) params.set("subject", filter.subject);
    if (filter.all) params.set("all", "true");
    const query = params.toString();
    return { path: `${BASE}/chapters${query ? `?${query}` : ""}`, method: "GET" };
  },
  createChapter: (input: QbChapterInput): QbRequest => ({ path: `${BASE}/chapters`, method: "POST", body: input }),
  updateChapter: (id: string, patch: Partial<Omit<QbChapterInput, "id">>): QbRequest => ({ path: `${BASE}/chapters/${enc(id)}`, method: "PATCH", body: patch }),
  confirmTaxonomy: (exam: QbExam, syllabusRevisionYear: number, note?: string): QbRequest => ({
    path: `${BASE}/taxonomy/${exam}/confirm`,
    method: "POST",
    body: note ? { confirm: true, syllabusRevisionYear, note } : { confirm: true, syllabusRevisionYear },
  }),
  blueprints: (): QbRequest => ({ path: `${BASE}/blueprints`, method: "GET" }),
  createBlueprint: (slot: QbSlot): QbRequest => ({ path: `${BASE}/blueprints`, method: "POST", body: { slot } }),
  getBlueprint: (id: string): QbRequest => ({ path: `${BASE}/blueprints/${enc(id)}`, method: "GET" }),
  saveBlueprint: (id: string, definition: QbBlueprintEditable, baseUpdatedAt: number): QbRequest => ({
    path: `${BASE}/blueprints/${enc(id)}`,
    method: "PATCH",
    body: { definition, baseUpdatedAt },
  }),
  blueprintAction: (id: string, action: QbBlueprintAction): QbRequest => ({ path: `${BASE}/blueprints/${enc(id)}/actions`, method: "POST", body: action }),
  readiness: (id: string, language: "en" | "hi"): QbRequest => ({ path: `${BASE}/blueprints/${enc(id)}/readiness?language=${language}`, method: "GET" }),
  preview: (id: string, language: "en" | "hi", seed?: string): QbRequest => ({
    path: `${BASE}/blueprints/${enc(id)}/preview?language=${language}${seed ? `&seed=${enc(seed)}` : ""}`,
    method: "GET",
  }),
  previewStats: (id: string, language: "en" | "hi"): QbRequest => ({ path: `${BASE}/blueprints/${enc(id)}/preview-stats?language=${language}`, method: "GET" }),
  coverage: (exam: QbExam, subject?: QbSubject): QbRequest => ({ path: `${BASE}/coverage?exam=${exam}${subject ? `&subject=${subject}` : ""}`, method: "GET" }),
  duplicates: (page = 1, status = "open"): QbRequest => ({ path: `${BASE}/duplicates?status=${status}&page=${page}`, method: "GET" }),
  decideDuplicate: (a: string, b: string, decision: QbDuplicateDecision, keep?: string): QbRequest => ({
    path: `${BASE}/duplicates/decide`,
    method: "POST",
    body: keep ? { a, b, decision, keep } : { a, b, decision },
  }),
  reports: (page = 1, status: QbReportStatus = "open"): QbRequest => ({ path: `${BASE}/reports?status=${status}&page=${page}`, method: "GET" }),
  closeReport: (id: number, status: Exclude<QbReportStatus, "open">, note?: string): QbRequest => ({
    path: `${BASE}/reports/${id}`,
    method: "PATCH",
    body: note ? { status, note } : { status },
  }),
  corrections: (questionId?: string): QbRequest => ({ path: `${BASE}/corrections${questionId ? `?questionId=${enc(questionId)}` : ""}`, method: "GET" }),
  createCorrection: (input: QbCorrectionInput): QbRequest => ({ path: `${BASE}/corrections`, method: "POST", body: input }),
  members: (): QbRequest => ({ path: `${BASE}/members`, method: "GET" }),
  saveMember: (userId: string, input: QbMemberInput): QbRequest => ({ path: `${BASE}/members/${enc(userId)}`, method: "PUT", body: input }),
  settings: (): QbRequest => ({ path: `${BASE}/settings`, method: "GET" }),
  saveSettings: (patch: QbSettingsPatch): QbRequest => ({ path: `${BASE}/settings`, method: "PUT", body: patch }),
  uploadFigurePath: `${BASE}/figures`,
};

export type QbFailure = {
  ok: false;
  /** HTTP status; 0 when the request never got a response. */
  status: number;
  error: string;
  /** The 409 reason (`stale`, `taxonomy_unconfirmed`, …) when the server sent one. */
  code: string | null;
  /** The server's field messages (English); shown to staff only as details under the localised message. */
  fieldErrors: Record<string, string[]>;
  message: string | null;
  retryAfterSeconds?: number;
};

export type QbResult<T> = { ok: true; status: number; data: T } | QbFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a fetch response into a `QbResult` (shared by JSON calls and the figure upload). */
export async function readQbResponse<T>(response: Response): Promise<QbResult<T>> {
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (response.ok && isRecord(json) && json.ok === true) return { ok: true, status: response.status, data: json.data as T };
  const body = isRecord(json) ? json : {};
  const fieldErrors: Record<string, string[]> = {};
  if (isRecord(body.fieldErrors)) {
    for (const [key, value] of Object.entries(body.fieldErrors)) {
      if (Array.isArray(value)) fieldErrors[key] = value.filter((entry): entry is string => typeof entry === "string").slice(0, 5);
    }
  }
  const retry = Number(response.headers.get("retry-after"));
  return {
    ok: false,
    status: response.status,
    error: typeof body.error === "string" ? body.error : response.status >= 500 ? "server_error" : "bad_request",
    code: typeof body.code === "string" ? body.code : null,
    fieldErrors,
    message: typeof body.message === "string" ? body.message : null,
    ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}),
  };
}

/** Same-origin JSON call to the admin QB API. Never throws. */
export async function qbCall<T>(request: QbRequest): Promise<QbResult<T>> {
  if (!request.path.startsWith(`${BASE}/`)) throw new Error("qbCall only calls /api/admin/qb");
  const hasBody = request.body !== undefined;
  try {
    const response = await fetch(request.path, {
      method: request.method,
      headers: hasBody ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: hasBody ? JSON.stringify(request.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    return await readQbResponse<T>(response);
  } catch {
    return { ok: false, status: 0, error: "network", code: null, fieldErrors: {}, message: null };
  }
}

/** Uploads one figure (already scaled in the browser) as multipart/form-data. */
export async function uploadFigure<T>(file: Blob, filename: string): Promise<QbResult<T>> {
  const form = new FormData();
  form.set("file", file, filename);
  try {
    const response = await fetch(qbRequests.uploadFigurePath, { method: "POST", body: form, credentials: "same-origin", cache: "no-store" });
    return await readQbResponse<T>(response);
  } catch {
    return { ok: false, status: 0, error: "network", code: null, fieldErrors: {}, message: null };
  }
}

/** The account still has an admin-issued temporary password (403 or 409 from the guard). */
export function isPasswordChangeRequired(result: QbFailure): boolean {
  if (result.code === "password_change_required") return true;
  return (result.status === 403 || result.status === 409) && result.message === PASSWORD_CHANGE_REQUIRED_TEXT;
}

/** Localised copy for a failed call; the server's English text is never the main message. */
export function qbFailureMessage(result: QbFailure, t: Pick<QbMessages, "errors">): string {
  const e = t.errors;
  if (result.status === 401) return e.sessionExpired;
  if (isPasswordChangeRequired(result)) return e.passwordChangeRequired;
  if (result.status === 409 && result.code && isOneOf(QB_CONFLICT_CODES, result.code)) return e.codes[result.code];
  if (result.status === 409) return e.conflict;
  if (result.status === 413) return e.tooLarge;
  if (result.status === 415) return e.unsupported;
  switch (result.error) {
    case "forbidden":
      return e.forbidden;
    case "not_found":
      return e.notFound;
    case "validation":
    case "bad_request":
      return e.validation;
    case "rate_limited":
      return format(e.rateLimited, { minutes: Math.max(1, Math.ceil((result.retryAfterSeconds ?? 60) / 60)) });
    case "network":
      return e.network;
    default:
      return e.server;
  }
}

/** "field: message" lines for the details under a validation error (English from the server). */
export function fieldErrorLines(result: QbFailure): string[] {
  return Object.entries(result.fieldErrors).flatMap(([field, messages]) => messages.map((message) => (field === "_form" ? message : `${field}: ${message}`)));
}
