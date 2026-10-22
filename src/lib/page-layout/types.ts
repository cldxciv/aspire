/**
 * Shared page-layout types (docs/page-layout-plan.md §3, §5, §6). Client-safe (no runtime imports):
 * the server (store, loader, API) and the editor both import these.
 */
import type { LayoutPageKey, LayoutSectionKey } from "./registry";

/** One movable section as stored (JSON in `page_layout_state.sections`) and submitted. */
export interface StoredEntry {
  key: string;
  hidden: boolean;
}

/** A rule a layout breaks (§7). `key` is set for `not_last`. */
export interface LayoutIssue {
  code: "not_last" | "none_visible";
  key?: string;
}

export type LayoutAction = "save_draft" | "discard_draft" | "publish" | "reset";

export const LAYOUT_ACTIONS: readonly LayoutAction[] = ["save_draft", "discard_draft", "publish", "reset"];

export type LayoutSource = "default" | "published" | "draft";

/** One page's stored state as the editor sees it (§5). Sections are normalised against the registry. */
export interface PageLayoutStateView {
  page: LayoutPageKey;
  /** The newest history id for the page (0 when it has never been changed); sent back with every write. */
  revision: number;
  published: { sections: StoredEntry[]; custom: boolean; updatedAt: number | null; updatedBy: string | null };
  draft: { sections: StoredEntry[]; updatedAt: number; updatedBy: string | null } | null;
  /** Newest first. `actor` is the display name, or null when the account is gone. */
  history: PageLayoutHistoryItem[];
}

export interface PageLayoutHistoryItem {
  id: number;
  action: LayoutAction;
  actor: string | null;
  at: number;
  before: StoredEntry[];
  /** Null for `discard_draft` and `reset` (reset means "the default"). */
  after: StoredEntry[] | null;
}

/** The layout a page renders (§6). Serialisable (it crosses the `"use cache"` boundary). */
export interface ResolvedPageLayout<P extends LayoutPageKey = LayoutPageKey> {
  page: P;
  /** Every movable section, in order, hidden ones included. */
  entries: { key: LayoutSectionKey<P>; hidden: boolean }[];
  /** The visible movable sections in order, then the pinned-last key (when the page has one). */
  order: LayoutSectionKey<P>[];
  source: LayoutSource;
  /** Set only while a super admin previews (Next Draft Mode). */
  preview: { hasDraft: boolean } | null;
}

/** What changed between two entry lists (history and audit). Positions count the hero as 1. */
export interface LayoutChanges {
  moved: { key: string; from: number; to: number }[];
  hidden: string[];
  shown: string[];
}
