/**
 * Pure model of the page-layout editor (docs/page-layout-plan.md §10, D14). Client-safe: the
 * editor, its tests and the server page (`defaultStateViews`) import it.
 */
import { LAYOUT_PAGE_KEYS, LAYOUT_PAGES, isHideable, sectionDef, type LayoutPageKey } from "@/lib/page-layout/registry";
import { defaultEntries, describeChanges, issueCode, layoutIssues, sameOrder } from "@/lib/page-layout/resolve";
import type { LayoutAction, LayoutChanges, PageLayoutHistoryItem, PageLayoutStateView, StoredEntry } from "@/lib/page-layout/types";

import { fill, sectionLabel, type LayoutMessages } from "./labels";

export type MoveDirection = "up" | "down";

/** Why a move or show/hide control is blocked (D14). */
export type BlockReason =
  | { kind: "atTop" }
  | { kind: "atBottom" }
  | { kind: "notLast"; key: string }
  | { kind: "noneVisible" }
  | { kind: "keep"; keep: "linked" | "notice" | "core" };

/** The order the page uses once saved: the draft, else the live order. */
export function savedEntries(state: PageLayoutStateView): StoredEntry[] {
  return state.draft?.sections ?? state.published.sections;
}

/** Unsaved local edits that differ from the saved order. */
export function isDirty(state: PageLayoutStateView, local: readonly StoredEntry[] | undefined): boolean {
  return local !== undefined && !sameOrder(local, savedEntries(state));
}

/** Swaps the entry at `index` with its neighbour; a move off either end returns a copy. */
export function moveEntries(entries: readonly StoredEntry[], index: number, direction: MoveDirection): StoredEntry[] {
  const next = entries.map((entry) => ({ ...entry }));
  const to = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= next.length || to < 0 || to >= next.length) return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Flips `hidden` on the entry at `index`. */
export function toggleEntries(entries: readonly StoredEntry[], index: number): StoredEntry[] {
  return entries.map((entry, i) => (i === index ? { ...entry, hidden: !entry.hidden } : { ...entry }));
}

/** The first rule the candidate breaks that the current layout does not already break. */
function addedIssue(page: LayoutPageKey, current: readonly StoredEntry[], candidate: readonly StoredEntry[]): BlockReason | null {
  const existing = new Set(layoutIssues(page, current).map(issueCode));
  const added = layoutIssues(page, candidate).find((issue) => !existing.has(issueCode(issue)));
  if (!added) return null;
  return added.code === "not_last" ? { kind: "notLast", key: added.key ?? "" } : { kind: "noneVisible" };
}

/** Why moving the entry at `index` is blocked, else null. */
export function moveBlock(
  page: LayoutPageKey,
  entries: readonly StoredEntry[],
  index: number,
  direction: MoveDirection,
): BlockReason | null {
  if (direction === "up" && index <= 0) return { kind: "atTop" };
  if (direction === "down" && index >= entries.length - 1) return { kind: "atBottom" };
  return addedIssue(page, entries, moveEntries(entries, index, direction));
}

/** Why showing / hiding the entry at `index` is blocked, else null. */
export function toggleBlock(page: LayoutPageKey, entries: readonly StoredEntry[], index: number): BlockReason | null {
  const entry = entries[index];
  if (!entry) return null;
  const def = sectionDef(page, entry.key);
  if (def && !isHideable(def) && !entry.hidden) return { kind: "keep", keep: def.keep ?? "core" };
  return addedIssue(page, entries, toggleEntries(entries, index));
}

/** Visible rule reasons (shown in the row); top / bottom reasons are screen-reader only. */
export function isVisibleReason(reason: BlockReason): boolean {
  return reason.kind !== "atTop" && reason.kind !== "atBottom";
}

export function reasonText(t: LayoutMessages, page: LayoutPageKey, reason: BlockReason): string {
  switch (reason.kind) {
    case "atTop":
      return t.reasons.atTop;
    case "atBottom":
      return t.reasons.atBottom;
    case "notLast":
      return fill(t.reasons.notLast, { section: sectionLabel(t, page, reason.key) });
    case "noneVisible":
      return t.reasons.noneVisible;
    case "keep":
      return t.keep[reason.keep];
  }
}

/** Texts for the current layout's own rule problems (an inconsistent reload). */
export function currentIssueTexts(t: LayoutMessages, page: LayoutPageKey, entries: readonly StoredEntry[]): string[] {
  return layoutIssues(page, entries).map((issue) =>
    issue.code === "not_last"
      ? reasonText(t, page, { kind: "notLast", key: issue.key ?? "" })
      : reasonText(t, page, { kind: "noneVisible" }),
  );
}

/** A 422 code from the API (`not_last:<key>`, `cannot_hide:<key>`, `duplicate:<key>`, `none_visible`, `no_draft`) as text. */
export function apiIssueText(t: LayoutMessages, page: LayoutPageKey, code: string): string {
  const [kind, key = ""] = code.split(":");
  switch (kind) {
    case "not_last":
      return reasonText(t, page, { kind: "notLast", key });
    case "none_visible":
      return t.reasons.noneVisible;
    case "cannot_hide": {
      const keep = sectionDef(page, key)?.keep;
      return keep ? t.keep[keep] : t.errors.generic;
    }
    case "no_draft":
      return t.errors.noDraft;
    default:
      return t.errors.generic;
  }
}

/** Rows on the page: the hero, the movable sections and the pinned-last one. */
export function totalRows(page: LayoutPageKey): number {
  return LAYOUT_PAGES[page].sections.length;
}

/** The page position of a movable entry (the hero is 1, so the first movable entry is 2). */
export const positionOf = (index: number) => index + 2;

export function movedAnnouncement(t: LayoutMessages, page: LayoutPageKey, key: string, index: number): string {
  return fill(t.announce.moved, { section: sectionLabel(t, page, key), position: positionOf(index), total: totalRows(page) });
}

export function toggledAnnouncement(t: LayoutMessages, page: LayoutPageKey, key: string, hidden: boolean): string {
  return fill(hidden ? t.announce.hidden : t.announce.shown, { section: sectionLabel(t, page, key) });
}

const HISTORY_ACTION_KEY: Record<LayoutAction, keyof LayoutMessages["history"]["actions"]> = {
  save_draft: "saveDraft",
  discard_draft: "discardDraft",
  publish: "publish",
  reset: "reset",
};

/** "Free student tools moved from position 5 to 7", "Voices from families hidden", … */
export function changeParts(t: LayoutMessages, page: LayoutPageKey, changes: LayoutChanges): string[] {
  return [
    ...changes.moved.map((move) =>
      fill(t.history.moved, { section: sectionLabel(t, page, move.key), from: move.from, to: move.to }),
    ),
    ...changes.hidden.map((key) => fill(t.history.hid, { section: sectionLabel(t, page, key) })),
    ...changes.shown.map((key) => fill(t.history.showed, { section: sectionLabel(t, page, key) })),
  ];
}

/**
 * One history line without its date: "Anu published: Free student tools moved from position 5 to
 * 7; Voices from families hidden". Saves and publishes list what changed; reset and discard only
 * name the action. A deleted account reads `history.someone`.
 */
export function historySentence(t: LayoutMessages, page: LayoutPageKey, item: PageLayoutHistoryItem): string {
  const sentence = fill(t.history.actions[HISTORY_ACTION_KEY[item.action]], { name: item.actor ?? t.history.someone });
  if ((item.action !== "save_draft" && item.action !== "publish") || !item.after) return sentence;
  const parts = changeParts(t, page, describeChanges(item.before, item.after));
  return `${sentence}: ${parts.length > 0 ? parts.join("; ") : t.history.noChange}`;
}

/** The state shown in the page picker after the page name, by priority. */
export function pickerState(state: PageLayoutStateView, local: readonly StoredEntry[] | undefined): "unsaved" | "draft" | "custom" | null {
  if (isDirty(state, local)) return "unsaved";
  if (state.draft) return "draft";
  if (state.published.custom) return "custom";
  return null;
}

/** Reset is pointless when the live order is the default and there is no draft. */
export function canReset(state: PageLayoutStateView): boolean {
  return state.published.custom || state.draft !== null;
}

/** One page's state with nothing stored (revision 0, default order, no draft, no history). */
export function defaultStateView(page: LayoutPageKey): PageLayoutStateView {
  return {
    page,
    revision: 0,
    published: { sections: defaultEntries(page), custom: false, updatedAt: null, updatedBy: null },
    draft: null,
    history: [],
  };
}

/** Every page with nothing stored (the data-free preview of the screen). */
export function defaultStateViews(): Record<LayoutPageKey, PageLayoutStateView> {
  return Object.fromEntries(LAYOUT_PAGE_KEYS.map((page) => [page, defaultStateView(page)])) as Record<
    LayoutPageKey,
    PageLayoutStateView
  >;
}
