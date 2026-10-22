/**
 * Page-layout validation and resolution (docs/page-layout-plan.md §7, D12, D13). Pure and
 * client-safe: the loader, the store, the API and the editor all use it.
 */
import { pageLayoutLog } from "./log";
import {
  isHideable,
  movableKeys,
  pinnedLastKey,
  sectionDef,
  type LayoutPageKey,
  type LayoutSectionKey,
} from "./registry";
import type { LayoutChanges, LayoutIssue, LayoutSource, ResolvedPageLayout, StoredEntry } from "./types";

/** The page's movable sections in default order, all visible. */
export function defaultEntries(page: LayoutPageKey): StoredEntry[] {
  return movableKeys(page).map((key) => ({ key, hidden: false }));
}

/**
 * A stored or submitted list made safe to render. Never throws.
 * 1. null → the default order.
 * 2. Unknown keys, pinned keys and repeats are dropped (the first occurrence wins).
 * 3. `hidden` only sticks on hideable sections.
 * 4. Each missing movable key (in default order) goes right after its nearest preceding
 *    default-order sibling already in the list, else first. Consecutive missing keys keep their order.
 */
export function normalizeEntries(page: LayoutPageKey, stored: readonly StoredEntry[] | null | undefined): StoredEntry[] {
  if (!stored) return defaultEntries(page);
  const out: StoredEntry[] = [];
  const seen = new Set<string>();
  for (const entry of stored) {
    if (!entry || typeof entry.key !== "string" || seen.has(entry.key)) continue;
    const def = sectionDef(page, entry.key);
    if (!def || def.pin) continue;
    seen.add(entry.key);
    out.push({ key: entry.key, hidden: entry.hidden === true && isHideable(def) });
  }
  const order = movableKeys(page);
  order.forEach((key, index) => {
    if (seen.has(key)) return;
    let at = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const found = out.findIndex((entry) => entry.key === order[i]);
      if (found !== -1) {
        at = found + 1;
        break;
      }
    }
    out.splice(at, 0, { key, hidden: false });
    seen.add(key);
  });
  return out;
}

/** Visible and not conditional: a section the page shows whatever data exists (D13). */
function alwaysShown(page: LayoutPageKey, entry: StoredEntry): boolean {
  return !entry.hidden && !sectionDef(page, entry.key)?.conditional;
}

/**
 * Rules a (normalised) layout breaks:
 * - `not_last` (with key): a visible `notLast` section with no always-shown section after it;
 * - `none_visible`: no always-shown section at all.
 */
export function layoutIssues(page: LayoutPageKey, entries: readonly StoredEntry[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  entries.forEach((entry, index) => {
    if (entry.hidden || !sectionDef(page, entry.key)?.notLast) return;
    if (!entries.slice(index + 1).some((later) => alwaysShown(page, later))) {
      issues.push({ code: "not_last", key: entry.key });
    }
  });
  if (!entries.some((entry) => alwaysShown(page, entry))) issues.push({ code: "none_visible" });
  return issues;
}

/** API / editor code of an issue: `not_last:<key>` or `none_visible`. */
export function issueCode(issue: LayoutIssue): string {
  return issue.code === "not_last" ? `not_last:${issue.key ?? ""}` : issue.code;
}

/**
 * Validation for writes (D12). Duplicates (any key) and hiding a non-hideable section are checked
 * on the list as submitted; the rules on the normalised list. Unknown, pinned and missing keys are
 * not errors: normalising drops or inserts them.
 */
export function validateEntries(
  page: LayoutPageKey,
  submitted: readonly StoredEntry[],
): { ok: true; entries: StoredEntry[] } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of submitted) {
    if (seen.has(entry.key)) {
      if (!duplicates.has(entry.key)) issues.push(`duplicate:${entry.key}`);
      duplicates.add(entry.key);
      continue;
    }
    seen.add(entry.key);
    const def = sectionDef(page, entry.key);
    if (def && !def.pin && entry.hidden === true && !isHideable(def)) issues.push(`cannot_hide:${entry.key}`);
  }
  const entries = normalizeEntries(page, submitted);
  for (const issue of layoutIssues(page, entries)) issues.push(issueCode(issue));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, entries };
}

/** True when both lists have the same keys, order and hidden flags. */
export function sameOrder(a: readonly StoredEntry[], b: readonly StoredEntry[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry.key === b[i].key && entry.hidden === b[i].hidden);
}

/**
 * The layout a page renders. A stored layout that breaks a rule (possible only after a registry
 * change) falls back to the default, and the fallback is logged. A fallback also clears
 * `preview.hasDraft`: the page no longer shows the draft, so the banner must not say it does.
 */
export function resolvePageLayout<P extends LayoutPageKey>(
  page: P,
  stored: readonly StoredEntry[] | null,
  meta: { source?: LayoutSource; preview?: { hasDraft: boolean } | null } = {},
): ResolvedPageLayout<P> {
  let entries = normalizeEntries(page, stored);
  let source: LayoutSource = meta.source ?? (stored ? "published" : "default");
  let preview = meta.preview ?? null;
  if (layoutIssues(page, entries).length > 0) {
    pageLayoutLog("resolve", "fallback");
    entries = defaultEntries(page);
    source = "default";
    if (preview) preview = { hasDraft: false };
  }
  const last = pinnedLastKey(page);
  // Normalised entries only hold this page's movable keys (registry), so the key types are exact.
  const typed = entries as unknown as { key: LayoutSectionKey<P>; hidden: boolean }[];
  const order = typed.filter((entry) => !entry.hidden).map((entry) => entry.key);
  if (last) order.push(last as unknown as LayoutSectionKey<P>);
  return { page, entries: typed, order, source, preview };
}

/** The default layout (tests, the read-only preview, the build). */
export function defaultPageLayout<P extends LayoutPageKey>(page: P): ResolvedPageLayout<P> {
  return resolvePageLayout(page, null, { source: "default", preview: null });
}

/**
 * Moves, hides and shows between two entry lists. Moved keys are those outside the longest common
 * subsequence of the two orders (n ≤ 16, so O(n²) is fine). Positions are 1-based page positions
 * that count the hero as 1 (the first movable entry is 2), hidden entries included: the editor's
 * row numbers.
 */
export function describeChanges(before: readonly StoredEntry[], after: readonly StoredEntry[]): LayoutChanges {
  const a = before.map((entry) => entry.key);
  const b = after.map((entry) => entry.key);
  // lcs[i][j] = LCS length of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const kept = new Set<string>();
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      kept.add(a[i]);
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  const moved: LayoutChanges["moved"] = [];
  const hidden: string[] = [];
  const shown: string[] = [];
  after.forEach((entry, to) => {
    const from = a.indexOf(entry.key);
    if (from === -1) return;
    if (!kept.has(entry.key)) moved.push({ key: entry.key, from: from + 2, to: to + 2 });
    const wasHidden = before[from].hidden;
    if (entry.hidden && !wasHidden) hidden.push(entry.key);
    if (!entry.hidden && wasHidden) shown.push(entry.key);
  });
  return { moved, hidden, shown };
}
