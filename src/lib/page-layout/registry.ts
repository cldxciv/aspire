/**
 * Page layout registry (docs/page-layout-plan.md §3, D1, D2). Client-safe: no imports, no server APIs.
 *
 * Each of the 10 public pages lists its sections in today's (default) order. The hero is always
 * first and is drawn by the page itself (never stored); a pinned-last section (the closing band)
 * always stays last. Everything else can be moved; `keep` sections can be moved but not hidden.
 *
 * Flags:
 * - `background: "own"`: the section brings its own background and restarts the white/surface
 *   rhythm at white after it (render.tsx). Default "toned" (white or surface by position).
 * - `keep`: not hideable. `linked` = anchors or links elsewhere lead here; `notice` = it carries the
 *   page's demo/verified note; `core` = the page's main content. The editor shows the reason.
 * - `conditional`: rendered only when its data exists. Does not count as an "always-shown" section
 *   for the `not_last` and `none_visible` rules (D13).
 * - `notLast`: needs an always-shown section after it (the homepage tools rule).
 *
 * Adding a section: append it here at its default position, add its en/hi label (and hint when
 * conditional) under `layout.pages.<page>.sections`, and give the page a slot for it. Stored
 * layouts without the new key get it at its default position (resolve.ts `normalizeEntries`).
 */

export const LAYOUT_PAGE_KEYS = [
  "home",
  "about",
  "admissions",
  "programs",
  "results",
  "centres",
  "hostels",
  "resources",
  "contact",
  "tools",
] as const;

export type LayoutPageKey = (typeof LAYOUT_PAGE_KEYS)[number];

export interface LayoutSectionDef {
  /** /^[a-z][a-zA-Z0-9]{0,39}$/ */
  readonly key: string;
  /** "first" only for "hero". */
  readonly pin?: "first" | "last";
  /** Not hideable; the editor shows the reason. */
  readonly keep?: "linked" | "notice" | "core";
  /** Default "toned". */
  readonly background?: "toned" | "own";
  readonly conditional?: boolean;
  readonly notLast?: boolean;
}

export interface LayoutPageDef {
  /** Locale-free public path (`localePath()` adds `/hi`). */
  readonly path: string;
  readonly sections: readonly LayoutSectionDef[];
}

export const LAYOUT_PAGES = {
  home: {
    path: "/",
    sections: [
      { key: "hero", pin: "first" },
      { key: "stats", background: "own", conditional: true },
      { key: "results" },
      { key: "programs" },
      { key: "tools", notLast: true },
      { key: "why" },
      { key: "centres", background: "own", conditional: true },
      { key: "life" },
      { key: "voices", conditional: true },
      { key: "impact", conditional: true },
      { key: "resources", conditional: true },
      { key: "cta", pin: "last", background: "own" },
    ],
  },
  about: {
    path: "/about",
    sections: [
      { key: "hero", pin: "first" },
      { key: "story" },
      { key: "mission", conditional: true },
      { key: "approach" },
      { key: "values" },
      { key: "results" },
      { key: "journey", conditional: true },
      { key: "explore" },
      { key: "spaces" },
      { key: "cta", pin: "last" },
    ],
  },
  admissions: {
    path: "/admissions",
    sections: [
      { key: "hero", pin: "first" },
      { key: "enquiry", keep: "linked" },
      { key: "next", keep: "linked" },
      { key: "results" },
      { key: "scholarships", conditional: true },
      { key: "downloads", conditional: true },
      { key: "faqs", keep: "linked" },
    ],
  },
  programs: {
    path: "/programs",
    sections: [
      { key: "hero", pin: "first" },
      { key: "directory", keep: "core" },
      { key: "tracks" },
      { key: "guide" },
      { key: "cta", pin: "last" },
    ],
  },
  results: {
    path: "/results",
    sections: [
      { key: "hero", pin: "first" },
      { key: "stories", conditional: true },
      { key: "archive", keep: "notice" },
      { key: "rankers", conditional: true },
      { key: "method" },
      { key: "cta", pin: "last" },
    ],
  },
  centres: {
    path: "/centres",
    sections: [
      { key: "hero", pin: "first" },
      { key: "directory", keep: "linked" },
      { key: "districts" },
      { key: "cta", pin: "last" },
    ],
  },
  hostels: {
    path: "/hostels",
    sections: [
      { key: "hero", pin: "first" },
      { key: "intro", keep: "notice" },
      { key: "campuses", keep: "linked", conditional: true },
      { key: "care" },
      { key: "rooms", conditional: true },
      { key: "day", conditional: true },
      { key: "cta", pin: "last" },
    ],
  },
  resources: {
    path: "/resources",
    sections: [
      { key: "hero", pin: "first" },
      { key: "types" },
      { key: "downloads", keep: "linked", conditional: true },
      { key: "articles", keep: "linked" },
      { key: "results" },
      { key: "cta", pin: "last" },
    ],
  },
  contact: {
    path: "/contact",
    sections: [
      { key: "hero", pin: "first" },
      { key: "form", keep: "linked" },
      { key: "details" },
      { key: "help" },
      { key: "desks", conditional: true },
    ],
  },
  tools: {
    path: "/tools",
    sections: [
      { key: "hero", pin: "first" },
      { key: "rancho", background: "own" },
      { key: "predictor" },
      { key: "mockTests" },
      { key: "ask" },
      { key: "planner" },
      { key: "note", pin: "last" },
    ],
  },
} as const satisfies Record<LayoutPageKey, LayoutPageDef>;

/** A page's section keys that a page renders through slots: every key except the hero. */
export type LayoutSectionKey<P extends LayoutPageKey> = Exclude<
  (typeof LAYOUT_PAGES)[P]["sections"][number]["key"],
  "hero"
>;

/** Key format shared by the registry, the stored JSON and the API schema. */
export const SECTION_KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,39}$/;

export const isLayoutPageKey = (value: unknown): value is LayoutPageKey =>
  typeof value === "string" && (LAYOUT_PAGE_KEYS as readonly string[]).includes(value);

/** All sections of a page (hero and pins included), in default order. */
export function pageSections(page: LayoutPageKey): readonly LayoutSectionDef[] {
  return LAYOUT_PAGES[page].sections;
}

export function sectionDef(page: LayoutPageKey, key: string): LayoutSectionDef | undefined {
  return pageSections(page).find((def) => def.key === key);
}

/** Pinned and `keep` sections can't be hidden. */
export function isHideable(def: LayoutSectionDef): boolean {
  return !def.pin && !def.keep;
}

/** The page's pinned-last key (its closing band), or null when every section is movable. */
export function pinnedLastKey(page: LayoutPageKey): string | null {
  return pageSections(page).find((def) => def.pin === "last")?.key ?? null;
}

/** The movable keys (no pins) in default order. */
export function movableKeys(page: LayoutPageKey): string[] {
  return pageSections(page)
    .filter((def) => !def.pin)
    .map((def) => def.key);
}

/** Global cache tag on every page's layout read (loader.ts). */
export const PAGE_LAYOUT_TAG = "page-layout";

/** The per-page cache tag that publish and reset revalidate: `revalidateTag(pageLayoutTag(page), { expire: 0 })`. */
export const pageLayoutTag = (page: LayoutPageKey) => `page-layout:${page}`;

// Paths shared by the preview banner, the API and the editor.
export const PAGE_LAYOUT_ADMIN_PATH = "/admin/page-layout";
export const PAGE_LAYOUT_API = "/api/admin/page-layout";
export const PAGE_LAYOUT_PREVIEW_PATH = "/api/admin/page-layout/preview";
/** Outside the portal API (`/api/admin/**` answers 401 before the handler when signed out), D6. */
export const PAGE_LAYOUT_PREVIEW_EXIT_PATH = "/api/page-layout/preview/exit";
