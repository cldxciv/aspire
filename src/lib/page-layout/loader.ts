import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { draftMode } from "next/headers";

import { PAGE_LAYOUT_TAG, pageLayoutTag, type LayoutPageKey } from "./registry";
import { resolvePageLayout } from "./resolve";
import { readLayoutForRender, type LayoutRead } from "./store";
import type { ResolvedPageLayout } from "./types";

/**
 * The layout a public page renders (docs/page-layout-plan.md §6, D6, D7, D15). Server-only.
 *
 * Synchronous SQLite counts as predictable I/O under Cache Components, so without `"use cache"`
 * the build would bake the result in for good. Instead the read is cached and tagged per page;
 * publish and reset call `revalidateTag(pageLayoutTag(page), { expire: 0 })`.
 * - Build: the image has no database, so the default order, with a short life (still prerendered:
 *   stale ≥ 30 s and expire ≥ 5 min, cacheLife.md) that is refreshed on the first request.
 * - Runtime: the stored layout, `cacheLife("max")`; a failed read gets the default for "minutes".
 * - Draft Mode (a super admin's preview): `"use cache"` re-runs on every request and the page is
 *   served no-store, so the draft is never cached or shown to visitors.
 */

/**
 * The tags (defined in the import-free registry, so route handlers can import them without the
 * Next cache / request modules): `PAGE_LAYOUT_TAG` on every read, `pageLayoutTag(page)` per page.
 */
export { PAGE_LAYOUT_TAG, pageLayoutTag };

/** Next's cache / request APIs exist only in the Next runtime; vitest renders pages without them. */
const IN_NEXT = process.env.NODE_ENV !== "test";

/** Build: still prerendered (stale ≥ 30 s, expire ≥ 5 min, cacheLife.md), refreshed on the first request (D7). */
const BUILD_LIFE = { stale: 300, revalidate: 1, expire: 600 } as const;

const BUILD_READ: LayoutRead = { ok: true, entries: null, source: "default", hasDraft: false };

export async function getPageLayout<P extends LayoutPageKey>(page: P): Promise<ResolvedPageLayout<P>> {
  "use cache";
  const building = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD; // the image has no database
  const preview = IN_NEXT && !building ? (await draftMode()).isEnabled : false;
  const read = building ? BUILD_READ : readLayoutForRender(page, preview);
  if (IN_NEXT) {
    // Exactly one cacheLife call per invocation. Separate literal calls: the profile overloads
    // (.next/types/cache-life.d.ts) take one literal each, not a union.
    if (building) cacheLife(BUILD_LIFE);
    else if (read.ok) cacheLife("max");
    else cacheLife("minutes");
    cacheTag(pageLayoutTag(page), PAGE_LAYOUT_TAG);
  }
  return resolvePageLayout(page, read.ok ? read.entries : null, {
    source: read.ok ? read.source : "default",
    preview: preview ? { hasDraft: read.ok && read.hasDraft } : null,
  });
}
