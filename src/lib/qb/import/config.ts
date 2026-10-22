import "server-only";

import { dirname, isAbsolute, resolve } from "node:path";

import { MEMORY_DB_PATH, resolveDbPath } from "@/lib/db/connection";

/**
 * Server configuration of the question-bank import (docs/question-bank-plan.md §B8, §B13).
 * Read per call so tests and deployments see the current environment. The API key never leaves
 * the server: it is not logged, returned or sent to the browser.
 *
 * AI import runs only when BOTH are true: `QB_IMPORT_ENABLED` is not `0` (hard kill switch) and the
 * admin setting `import.enabled` is on (QB-CORE-B settings, default off, audited); plus
 * `ANTHROPIC_API_KEY` must be set. Tabular files (CSV / XLSX) never call the API and work without.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Claude Opus 5.5: the default model for reading papers. */
export const DEFAULT_IMPORT_MODEL = "claude-opus-5-5";
export const DEFAULT_IMPORT_EFFORT = "medium" as const;
export const IMPORT_EFFORTS = ["low", "medium", "high"] as const;
export type ImportEffort = (typeof IMPORT_EFFORTS)[number];

/** Output cap per request (streamed). Batches of pages are sized so the expected output is ≤ half. */
export const IMPORT_MAX_TOKENS = 64_000;
/** Hard upper bound of the upload size: the Next 16 proxy buffers only 10 MB of a body. */
export const IMPORT_MAX_FILE_MB_CAP = 9;
/** Zip guard (DOCX / XLSX): central-directory limits checked before any parser sees the file. */
export const ZIP_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 2000;
/** Tabular files: at most this many data rows. */
export const TABULAR_MAX_ROWS = 2000;
/** Sync request timeout (a large paper batch can take minutes). */
export const SYNC_TIMEOUT_MS = 10 * 60_000;
/** `max_tokens` → halve the pages and retry, at most this many times. */
export const MAX_SPLIT_DEPTH = 2;
/** Job-level retries of a failed item (on top of the SDK's own 2 retries). */
export const MAX_ITEM_ATTEMPTS = 2;

/** USD per million tokens (Oct 2026 list prices, docs/question-bank-plan.md §B8.2). */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  /** 5-minute cache writes cost 1.25 × input. */
  cacheWrite: number;
}

export const IMPORT_MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  // Haiku 5.5 prices hold for prompts up to 100K tokens; no cache-read discount is assumed.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.1, cacheWrite: 0.125 },
};

/** The Message Batches API bills half of the standard price. */
export const BATCH_PRICE_FACTOR = 0.5;

export interface QbImportConfig {
  /** `QB_IMPORT_ENABLED` is not `0`. The admin setting must also be on for AI imports. */
  envEnabled: boolean;
  apiKey: string | null;
  workspaceId: string | null;
  model: string;
  effort: ImportEffort;
  /** PDFs with more pages than this default to batch mode. */
  batchMinPages: number;
  dailyUsd: number;
  maxFileBytes: number;
  dir: string;
  storageBytes: number;
  retentionDays: number;
  price: ModelPrice;
  maxTokens: number;
}

function intInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function numberInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = raw?.trim();
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Model ids are plain `[a-z0-9.-]`; anything else falls back to the default. */
function modelId(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  return /^[a-z0-9][a-z0-9.-]{2,63}$/i.test(value) ? value : DEFAULT_IMPORT_MODEL;
}

function workspaceIdOf(raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  return /^[A-Za-z0-9_-]{4,128}$/.test(value) ? value : null;
}

function effortOf(raw: string | undefined): ImportEffort {
  const value = raw?.trim().toLowerCase();
  return (IMPORT_EFFORTS as readonly string[]).includes(value ?? "") ? (value as ImportEffort) : DEFAULT_IMPORT_EFFORT;
}

/** Default storage folder: `<dir of AUTH_DB_PATH>/<name>` (`.data/<name>` for the in-memory test database). */
export function defaultDataDir(name: string, env: Env = process.env, cwd: string = process.cwd()): string {
  const dbPath = resolveDbPath(env, cwd);
  if (dbPath === MEMORY_DB_PATH) return resolve(cwd, ".data", name);
  return resolve(dirname(dbPath), name);
}

function dirOf(raw: string | undefined, name: string, env: Env, cwd: string): string {
  const value = raw?.trim();
  if (!value) return defaultDataDir(name, env, cwd);
  return isAbsolute(value) ? value : resolve(cwd, value);
}

/** Price per million tokens for `model`, with the optional `QB_IMPORT_PRICE_IN` / `_OUT` overrides. */
export function priceFor(model: string, env: Env = process.env): ModelPrice {
  const base = IMPORT_MODEL_PRICES[model] ?? IMPORT_MODEL_PRICES[DEFAULT_IMPORT_MODEL];
  const input = numberInRange(env.QB_IMPORT_PRICE_IN, base.input, 0, 1000);
  const output = numberInRange(env.QB_IMPORT_PRICE_OUT, base.output, 0, 1000);
  return { input, output, cacheRead: base.cacheRead, cacheWrite: Math.max(base.cacheWrite, input * 1.25) };
}

export function getImportConfig(env: Env = process.env, cwd: string = process.cwd()): QbImportConfig {
  const model = modelId(env.QB_IMPORT_MODEL);
  return {
    // Same rule as QB-CORE-B's `importEnvOff`: 0 / false / off is the hard kill switch.
    envEnabled: !["0", "false", "off"].includes(env.QB_IMPORT_ENABLED?.trim().toLowerCase() ?? ""),
    apiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    workspaceId: workspaceIdOf(env.ANTHROPIC_WORKSPACE_ID),
    model,
    effort: effortOf(env.QB_IMPORT_EFFORT),
    batchMinPages: intInRange(env.QB_IMPORT_BATCH_MIN_PAGES, 8, 1, 10_000),
    dailyUsd: numberInRange(env.QB_IMPORT_DAILY_USD, 10, 0, 10_000),
    maxFileBytes: intInRange(env.QB_IMPORT_MAX_FILE_MB, IMPORT_MAX_FILE_MB_CAP, 1, IMPORT_MAX_FILE_MB_CAP) * 1024 * 1024,
    dir: dirOf(env.QB_IMPORT_DIR, "qb-imports", env, cwd),
    storageBytes: intInRange(env.QB_IMPORT_STORAGE_MB, 100, 1, 100_000) * 1024 * 1024,
    retentionDays: intInRange(env.QB_IMPORT_RETENTION_DAYS, 14, 1, 14),
    price: priceFor(model, env),
    maxTokens: IMPORT_MAX_TOKENS,
  };
}

export type AiUnavailableReason = "env_off" | "setting_off" | "no_api_key";

/**
 * Whether AI import may run. The env kill switch wins over the admin setting; the key is checked last.
 */
export function aiAvailability(config: Pick<QbImportConfig, "envEnabled" | "apiKey">, settingEnabled: boolean): {
  enabled: boolean;
  reason: AiUnavailableReason | null;
} {
  if (!config.envEnabled) return { enabled: false, reason: "env_off" };
  if (!settingEnabled) return { enabled: false, reason: "setting_off" };
  if (!config.apiKey) return { enabled: false, reason: "no_api_key" };
  return { enabled: true, reason: null };
}

/** `output_config.effort` is accepted by the current models but rejected by older ones (shared with Rancho). */
export { supportsEffort } from "@/lib/ask/config";

/** Server-side refusal fallback (sync requests only; the Batches API rejects it). */
export const IMPORT_FALLBACK_BETA = "server-side-fallback-2026-07-01";
