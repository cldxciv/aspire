/**
 * Placeholder-content switch (docs/agent-decisions.md D-005).
 *
 * - Development: placeholder records are shown, each visibly labelled DEMO.
 * - Production: placeholder records are hidden unless SHOW_PLACEHOLDER_CONTENT=true
 *   is set explicitly (e.g. a client-review deployment). When shown, the whole
 *   site is marked noindex.
 */
export function showPlaceholderContent(): boolean {
  const flag = process.env.SHOW_PLACEHOLDER_CONTENT;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}
