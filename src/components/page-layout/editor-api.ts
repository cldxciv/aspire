/**
 * Browser-side calls of the page-layout editor (docs/page-layout-plan.md §9, §10). Client-safe;
 * never throws. Results are typed by HTTP status so the editor shows its own localised text (the
 * API answers in English, D-007).
 */
import { PAGE_LAYOUT_API, type LayoutPageKey } from "@/lib/page-layout/registry";
import type { PageLayoutStateView, StoredEntry } from "@/lib/page-layout/types";

export type LayoutWriteRequest =
  | { action: "save_draft"; revision: number; sections: StoredEntry[] }
  | { action: "discard_draft" | "publish" | "reset"; revision: number };

export type LayoutFailureKind = "conflict" | "signedOut" | "forbidden" | "rateLimited" | "network" | "generic";

export type LayoutApiResult =
  | { ok: true; state: PageLayoutStateView }
  | { ok: false; kind: LayoutFailureKind }
  | { ok: false; kind: "invalid"; issues: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Maps a failed response (status + parsed JSON body, or null) to what the editor shows. */
export function layoutFailure(status: number, body: unknown): Exclude<LayoutApiResult, { ok: true }> {
  switch (status) {
    case 401:
      return { ok: false, kind: "signedOut" };
    case 403:
      return { ok: false, kind: "forbidden" };
    case 409:
      return { ok: false, kind: "conflict" };
    case 429:
      return { ok: false, kind: "rateLimited" };
    case 422: {
      const fieldErrors = isObject(body) && isObject(body.fieldErrors) ? body.fieldErrors : {};
      const sections = Array.isArray(fieldErrors.sections) ? fieldErrors.sections : [];
      const issues = sections.filter((code): code is string => typeof code === "string");
      return issues.length > 0 ? { ok: false, kind: "invalid", issues } : { ok: false, kind: "generic" };
    }
    default:
      return { ok: false, kind: "generic" };
  }
}

async function send(page: LayoutPageKey, init: RequestInit): Promise<LayoutApiResult> {
  let response: Response;
  try {
    response = await fetch(`${PAGE_LAYOUT_API}/${page}`, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch {
    return { ok: false, kind: "network" };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.ok && isObject(body) && body.ok === true && isObject(body.data)) {
    return { ok: true, state: body.data as unknown as PageLayoutStateView };
  }
  return layoutFailure(response.ok ? 500 : response.status, body);
}

/** GET the page's current state (the "Reload" after a conflict). */
export function fetchLayoutState(page: LayoutPageKey): Promise<LayoutApiResult> {
  return send(page, { method: "GET", headers: { Accept: "application/json" } });
}

/** POST one action; the body carries the revision the editor last saw (409 when stale). */
export function writeLayout(page: LayoutPageKey, body: LayoutWriteRequest): Promise<LayoutApiResult> {
  return send(page, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
}
