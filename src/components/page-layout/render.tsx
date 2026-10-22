import { Fragment, type ReactNode } from "react";

import { sectionDef, type LayoutPageKey, type LayoutSectionKey } from "@/lib/page-layout/registry";
import type { ResolvedPageLayout } from "@/lib/page-layout/types";

/**
 * Renders a page's sections in layout order (docs/page-layout-plan.md §4, D8). Synchronous and
 * server-safe (no hooks), so `renderToStaticMarkup` can render whole pages in tests.
 *
 * Tone rhythm: white / surface alternate over the sections that actually render, starting at
 * white after the hero. A section with its own background (registry `background: "own"`) gets
 * "white" (and ignores it) and restarts the rhythm at white after it. At the default layout this
 * reproduces every page's tones as they were before layouts became editable.
 *
 * SLOT CONTRACT (binding on every page): a slot is `null` / `false` exactly when the page would
 * render nothing for it (a data condition, or a component that returns null), so empty sections
 * never take a tone.
 */

export type LayoutTone = "white" | "surface";

export type SectionContext<K extends string> = {
  key: K;
  /** Own-background sections get "white" and ignore it. */
  tone: LayoutTone;
  /** tone === "white" ? "right" : "left". Photo side; used only where it follows position (D8). */
  side: "right" | "left";
  /** Keys actually rendered, in order (e.g. the results page's notice rule, D9). */
  rendered: readonly K[];
};

export type SectionSlot<K extends string> = ((ctx: SectionContext<K>) => ReactNode) | null | false | undefined;

/** One slot per section key of the page (hero excluded: the page draws it). */
export type LayoutSlots<P extends LayoutPageKey> = {
  readonly [K in LayoutSectionKey<P>]: SectionSlot<LayoutSectionKey<P>>;
};

export function renderLayoutSections<P extends LayoutPageKey>(
  layout: ResolvedPageLayout<P>,
  slots: LayoutSlots<P>,
): ReactNode[] {
  type K = LayoutSectionKey<P>;
  const lookup = slots as Readonly<Record<K, SectionSlot<K>>>;
  const rendered: readonly K[] = layout.order.filter((key) => Boolean(lookup[key]));
  let next: LayoutTone = "white";
  return rendered.map((key) => {
    let tone: LayoutTone;
    if (sectionDef(layout.page, key)?.background === "own") {
      tone = "white";
      next = "white";
    } else {
      tone = next;
      next = tone === "white" ? "surface" : "white";
    }
    const slot = lookup[key] as (ctx: SectionContext<K>) => ReactNode;
    return <Fragment key={key}>{slot({ key, tone, side: tone === "white" ? "right" : "left", rendered })}</Fragment>;
  });
}

/** The page body: the preview banner (or null), the hero, then the sections in layout order. */
export function PageLayoutFrame<P extends LayoutPageKey>({
  layout,
  banner,
  hero,
  slots,
}: {
  layout: ResolvedPageLayout<P>;
  banner: ReactNode;
  hero: ReactNode;
  slots: LayoutSlots<P>;
}) {
  return (
    <>
      {banner}
      {hero}
      {renderLayoutSections(layout, slots)}
    </>
  );
}
