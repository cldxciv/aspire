import { isRunnerState, type RunnerState } from "./runner-state";
import type { Answer } from "./scoring";

/**
 * Browser storage for guests (D-034: a guest's attempts never leave the browser unless they sign in
 * and choose to save). Client-only helpers; every access is wrapped because storage can be blocked
 * (private windows, disabled site data) — callers must work without it.
 *
 * Keys (versioned):
 * - aspire.mocktest.v1.progress.<testId>  unfinished attempt (RunnerState), for resume after reload
 * - aspire.mocktest.v1.attempts           finished attempts (newest first, at most 30)
 * - aspire.mocktest.v1.lang               preferred question language
 */

const PREFIX = "aspire.mocktest.v1";
const ATTEMPTS_KEY = `${PREFIX}.attempts`;
const LANG_KEY = `${PREFIX}.lang`;
export const MAX_LOCAL_ATTEMPTS = 30;

export interface LocalAttempt {
  /** Client attempt id (also sent to the server to de-duplicate saves). */
  id: string;
  testId: string;
  answers: Answer[];
  timeSpentSec: number[];
  startedAt: number;
  submittedAt: number;
  submitReason: "manual" | "timeout";
  /** One-time server start token (sent with the save; QA-SEC-M6 M1). */
  startToken?: string | null;
  /** Filled in after the server scored the attempt (for the "your attempts" list). */
  score?: number;
  maxScore?: number;
  /** Server id once saved to the student's account. */
  savedId?: string;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Storage blocked: nothing to remove.
  }
}

/** True when this browser lets the page save progress. */
export function storageAvailable(): boolean {
  try {
    const store = storage();
    if (!store) return false;
    const probe = `${PREFIX}.probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const progressKey = (testId: string) => `${PREFIX}.progress.${testId}`;

export function readProgress(testId: string, questionCount: number): RunnerState | null {
  const value = read(progressKey(testId));
  return isRunnerState(value, testId, questionCount) ? value : null;
}

export function writeProgress(state: RunnerState): boolean {
  return write(progressKey(state.testId), state);
}

export function clearProgress(testId: string): void {
  remove(progressKey(testId));
}

function isLocalAttempt(value: unknown): value is LocalAttempt {
  if (!value || typeof value !== "object") return false;
  const a = value as Partial<LocalAttempt>;
  return (
    typeof a.id === "string" &&
    typeof a.testId === "string" &&
    Array.isArray(a.answers) &&
    Array.isArray(a.timeSpentSec) &&
    typeof a.startedAt === "number" &&
    typeof a.submittedAt === "number"
  );
}

export function listLocalAttempts(): LocalAttempt[] {
  const value = read(ATTEMPTS_KEY);
  return Array.isArray(value) ? value.filter(isLocalAttempt) : [];
}

export function getLocalAttempt(id: string): LocalAttempt | null {
  return listLocalAttempts().find((a) => a.id === id) ?? null;
}

export function addLocalAttempt(attempt: LocalAttempt): boolean {
  const others = listLocalAttempts().filter((a) => a.id !== attempt.id);
  return write(ATTEMPTS_KEY, [attempt, ...others].slice(0, MAX_LOCAL_ATTEMPTS));
}

export function updateLocalAttempt(id: string, patch: Partial<Omit<LocalAttempt, "id">>): void {
  const list = listLocalAttempts();
  const index = list.findIndex((a) => a.id === id);
  if (index === -1) return;
  list[index] = { ...list[index], ...patch };
  write(ATTEMPTS_KEY, list);
}

export function readPreferredLanguage(): "en" | "hi" | null {
  const value = read(LANG_KEY);
  return value === "en" || value === "hi" ? value : null;
}

export function writePreferredLanguage(lang: "en" | "hi"): void {
  write(LANG_KEY, lang);
}

/** A random id for a new attempt (UUID; falls back to time + random where crypto is missing). */
export function newAttemptId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
