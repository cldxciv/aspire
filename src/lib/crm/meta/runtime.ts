import "server-only";

import { getCentres } from "@/lib/data";

import type { CentreOption } from "../intake/fields";

/**
 * What LR-META takes from the outside world, injectable (docs/lead-routing-plan.md §18.6, rule 2):
 * the `fetch` used for Graph (tests pass fixtures; the default resolves the global `fetch` at call
 * time, so a test guard on `globalThis.fetch` catches any stray call), the clock, the jitter
 * source and the centre list used to match a "centre" answer.
 */
export interface MetaRuntime {
  fetchImpl: typeof fetch;
  now: () => number;
  random: () => number;
  centres: () => Promise<readonly CentreOption[]>;
}

async function loadCentres(): Promise<readonly CentreOption[]> {
  const [en, hi] = await Promise.all([getCentres(undefined, "en"), getCentres(undefined, "hi")]);
  return en.map((centre) => ({ slug: centre.slug, names: [centre.name, ...hi.filter((other) => other.slug === centre.slug).map((other) => other.name)] }));
}

const DEFAULT_RUNTIME: MetaRuntime = {
  fetchImpl: (input, init) => globalThis.fetch(input, init),
  now: () => Date.now(),
  random: () => Math.random(),
  centres: loadCentres,
};

let override: Partial<MetaRuntime> = {};

/** The runtime in force: defaults, then a test override, then per-call options. */
export function metaRuntime(options: Partial<MetaRuntime> = {}): MetaRuntime {
  return { ...DEFAULT_RUNTIME, ...override, ...options };
}

/** Test helper: replaces parts of the runtime for route handlers (null resets). */
export function setMetaRuntimeForTests(runtime: Partial<MetaRuntime> | null): void {
  override = runtime ?? {};
}

/** Fixed-code log line (`metaLog(event, outcome, reason)`): never ids, tokens, URLs, bodies or Graph text. */
export function metaLog(event: string, outcome: "success" | "warn" | "error" | "skipped", reason?: string): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: outcome === "error" ? "error" : outcome === "warn" ? "warn" : "info",
    event: "crm_meta",
    step: event.replace(/[^a-z_.]/g, "").slice(0, 40),
    outcome,
    ...(reason ? { reason: reason.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) } : {}),
  });
  if (outcome === "error") console.error(line);
  else if (outcome === "warn") console.warn(line);
  else console.info(line);
}

/** Runs a background job: never throws, logs only the error's class as a fixed code (M11). */
export async function safely(job: Promise<unknown> | (() => Promise<unknown>), event = "background"): Promise<void> {
  try {
    await (typeof job === "function" ? job() : job);
  } catch (error) {
    const name = typeof error === "object" && error !== null && typeof (error as { name?: unknown }).name === "string" ? (error as { name: string }).name : "unknown";
    metaLog(event, "error", name);
  }
}
