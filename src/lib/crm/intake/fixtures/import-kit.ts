/**
 * TEST HELPER (not shipped): the import's PRODUCTION wiring (`importDeps`: CORE `captureLead`,
 * the secret-box keyed hashes, the routing seam's preview) with a spy on the capture call, the
 * synthetic integrations keys, and fixture loading. Tests mock the routing / SLA seams with
 * `./seams.ts` so nothing depends on a stub's answers. Synthetic people only.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getDb } from "@/lib/db/connection";
import { keyedHash } from "@/lib/server/secret-box";

import { parseCsv } from "../csv";
import { decodeCsvBytes } from "../decode";
import type { ImportCaptureInput, ImportCaptureOptions, ImportDeps } from "../import";
import { importDeps } from "../import-backend";
import { buildImportRows, guessMapping, type ImportRowInput } from "../rows";

/** Synthetic `INTEGRATIONS_SECRET` / `_PREVIOUS` values (≥ 43 characters; never real keys). */
export const TEST_INTEGRATIONS_SECRET = "import-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
export const TEST_INTEGRATIONS_SECRET_PREVIOUS = "import-test-previous-0123456789-abcdefghijklmnopqrstuv";

/** CORE `keyedHash` under the current key (needs `INTEGRATIONS_SECRET` stubbed). */
export const testHash = (purpose: "csv-ref" | "phone", value: string) => keyedHash(purpose, value);
/** CORE `keyedHash` under the previous key (needs `INTEGRATIONS_SECRET_PREVIOUS` stubbed). */
export const testPreviousHash = (purpose: "csv-ref" | "phone", value: string) => keyedHash(purpose, value, { previous: true });

export interface CaptureSpy {
  calls: { input: ImportCaptureInput; options: ImportCaptureOptions }[];
  /** Throw (like a locked database) when capturing this E.164 phone. */
  failOnPhone: string | null;
}

export function captureSpy(): CaptureSpy {
  return { calls: [], failOnPhone: null };
}

/** `importDeps()` on the test database; every capture call is recorded, then runs CORE's `captureLead`. */
export function spiedImportDeps(spy: CaptureSpy): ImportDeps {
  const deps = importDeps(getDb());
  return {
    ...deps,
    capture: (input, now, options) => {
      spy.calls.push({ input, options });
      if (spy.failOnPhone && input.phone === spy.failOnPhone) throw new Error("database is locked");
      return deps.capture(input, now, options);
    },
  };
}

/** A fixture file → the rows the wizard would send (default mapping). */
export function fixtureRows(name: string): ImportRowInput[] {
  const bytes = new Uint8Array(readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url))));
  const decoded = decodeCsvBytes(bytes);
  const parsed = parseCsv(decoded.text);
  if (!parsed.ok) throw new Error(parsed.issue);
  return buildImportRows(parsed.header, parsed.rows, guessMapping(parsed.header), { encoding: decoded.encoding }).rows;
}
