/**
 * Service results (owner: QB-CORE-B). Every staff-facing service returns this envelope (the CRM's
 * pattern plus a stable machine-readable `code` on conflicts, which the API passes on with a 409).
 * Client-safe.
 */

export type QbServiceError = "not_found" | "forbidden" | "validation" | "conflict";

export type QbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: QbServiceError; message: string; code?: string; fieldErrors?: Record<string, string[]> };

/** Stable 409 reasons (the admin UI explains them in words). */
export const QB_CONFLICT_CODES = [
  "stale",
  "taxonomy_unconfirmed",
  "placeholder_blueprint",
  "pattern_unconfirmed",
  "blueprint_invalid",
  "blocking_flags",
  "self_approval",
  "spot_check_incomplete",
  "spot_check_failed",
  "batch_expired",
  "not_allowed_in_status",
  "subject_scope",
  "duplicate_id",
  "figure_quota",
  "fidelity_answer_differs",
  "chapter_in_use",
  "subject_mismatch",
] as const;
export type QbConflictCode = (typeof QB_CONFLICT_CODES)[number];

export function ok<T>(data: T): QbResult<T> {
  return { ok: true, data };
}

export function notFound<T>(message = "Not found."): QbResult<T> {
  return { ok: false, error: "not_found", message };
}

export function forbidden<T>(message = "Your question-bank role does not allow this."): QbResult<T> {
  return { ok: false, error: "forbidden", message };
}

export function invalid<T>(message: string, fieldErrors?: Record<string, string[]>): QbResult<T> {
  return fieldErrors ? { ok: false, error: "validation", message, fieldErrors } : { ok: false, error: "validation", message };
}

export function conflict<T>(code: QbConflictCode, message: string): QbResult<T> {
  return { ok: false, error: "conflict", message, code };
}
