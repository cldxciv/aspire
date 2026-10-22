/**
 * One structured JSON log line for page-layout events (docs/page-layout-plan.md §5, §7, §8).
 * Fixed codes only (action, outcome, reason): never request bodies, names or ids. Client-safe and
 * import-free, so the pure resolver can use it too; the API's `layoutLog` (access.ts) builds on it.
 */
export function pageLayoutLog(action: string, outcome: string, reason?: string): void {
  const level = outcome === "error" ? "error" : outcome === "ok" ? "info" : "warn";
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event: "page_layout",
    action,
    outcome,
    ...(reason ? { reason } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
