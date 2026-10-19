/**
 * Provenance helpers for data imported from Aspire's demo site on 2026-10-19
 * (docs/demo-data-import.md). Every imported record is `status: "placeholder"`
 * until Aspire verifies it (D-005), so it never renders in production.
 */
export const DEMO_SOURCE_HOST = "aspire2.thechunkmedia.com";
export const DEMO_FETCHED_ON = "2026-10-19";

/** `demoRef("/courses")` → "aspire2.thechunkmedia.com/courses (fetched 2026-10-19)". */
export function demoRef(...paths: string[]): string {
  return `${paths.map((path) => `${DEMO_SOURCE_HOST}${path}`).join(" + ")} (fetched ${DEMO_FETCHED_ON})`;
}

/** Full URL of a demo page, used as a result's `sourceReference`. */
export function demoUrl(path: string): string {
  return `https://${DEMO_SOURCE_HOST}${path}`;
}
