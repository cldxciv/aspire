"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getLocalAttempt, updateLocalAttempt, type LocalAttempt } from "@/lib/mocktest/local-store";
import type { SavedAttemptDetail, SavedAttemptSummary, ScoredAttempt } from "@/lib/mocktest/types";

/** False on the server and during hydration, true afterwards (no effect, no flash of wrong state). */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

export type SessionStatus =
  | { state: "loading" }
  | { state: "guest" }
  | { state: "signedIn"; role: "student" | "parent" | "admin"; displayName: string | null };

/** The visitor's session from GET /api/session (never ids or tokens). */
export function useSessionStatus(): SessionStatus {
  const [status, setStatus] = useState<SessionStatus>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/session", { headers: { accept: "application/json" }, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { ok?: boolean; data?: { authenticated: boolean; role?: string; displayName?: string | null } } | null) => {
        if (cancelled) return;
        const data = body?.data;
        if (data?.authenticated && (data.role === "student" || data.role === "parent" || data.role === "admin")) {
          setStatus({ state: "signedIn", role: data.role, displayName: data.displayName ?? null });
        } else {
          setStatus({ state: "guest" });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus({ state: "guest" });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

export interface JsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  fieldErrors?: Record<string, string[]>;
}

/** JSON request against our own API (same origin, D-007 envelope). Network errors → status 0. */
export async function apiJson<T>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<JsonResult<T>> {
  try {
    const response = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { accept: "application/json", ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      credentials: "same-origin",
      signal: init.signal,
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; fieldErrors?: Record<string, string[]> } | null;
    return { ok: response.ok && body?.ok === true, status: response.status, data: body?.data ?? null, fieldErrors: body?.fieldErrors };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/** An attempt to show: from this browser (guests and students) or from the student's account. */
export type AttemptSource = { kind: "local"; attempt: LocalAttempt } | { kind: "saved"; attempt: SavedAttemptDetail };

export type ScoredState =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "error"; status: number }
  | {
      state: "ready";
      source: AttemptSource;
      scored: ScoredAttempt;
      /** The server record when this attempt is saved to the signed-in student's account. */
      saved: SavedAttemptSummary | null;
    };

const NOT_THEIRS = new Set([400, 401, 403, 404]);

/**
 * Loads `?attempt=<local id>` from this browser or `?saved=<server id>` from the student's account.
 * A SAVED attempt (also a local one that was saved) is scored by GET /api/mocktest/attempts?id= —
 * the student's own attempt, so with solutions. Anything else is scored anonymously by POST
 * /api/mocktest/score, which withholds the answer key of a weekly test while its window is open
 * (QA-SEC-M6 M1). Repeatable, so a result page can be reloaded or opened later.
 */
export function useScoredAttempt(testId: string, params: { attempt: string | null; saved: string | null }, reloadKey = 0): ScoredState {
  const [state, setState] = useState<ScoredState>({ state: "loading" });
  const { attempt: localId, saved: savedParam } = params;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ state: "loading" });
      const local = localId ? getLocalAttempt(localId) : null;
      const localSource: AttemptSource | null = local && local.testId === testId ? { kind: "local", attempt: local } : null;
      const savedId = localSource ? (local?.savedId ?? null) : savedParam;
      if (savedId) {
        const detail = await apiJson<SavedAttemptDetail>(`/api/mocktest/attempts?id=${encodeURIComponent(savedId)}`);
        if (cancelled) return;
        if (detail.ok && detail.data && detail.data.testId === testId) {
          const source: AttemptSource = localSource ?? { kind: "saved", attempt: detail.data };
          if (localSource) updateLocalAttempt(localSource.attempt.id, { score: detail.data.score, maxScore: detail.data.maxScore });
          setState({ state: "ready", source, scored: detail.data.scored, saved: detail.data });
          return;
        }
        if (!localSource) {
          setState(NOT_THEIRS.has(detail.status) ? { state: "missing" } : { state: "error", status: detail.status });
          return;
        }
        // Signed out (or another account): score this device's copy anonymously below.
      }
      if (!localSource) {
        setState({ state: "missing" });
        return;
      }
      const scored = await apiJson<ScoredAttempt>("/api/mocktest/score", {
        body: { testId, answers: localSource.attempt.answers, timeSpentSec: localSource.attempt.timeSpentSec },
      });
      if (cancelled) return;
      if (!scored.ok || !scored.data) {
        setState(scored.status === 404 ? { state: "missing" } : { state: "error", status: scored.status });
        return;
      }
      updateLocalAttempt(localSource.attempt.id, { score: scored.data.result.score, maxScore: scored.data.result.maxScore });
      setState({ state: "ready", source: localSource, scored: scored.data, saved: null });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [testId, localId, savedParam, reloadKey]);

  return state;
}
