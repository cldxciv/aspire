import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { messagesFor } from "@/i18n/messages";
import { movableKeys, pinnedLastKey, PAGE_LAYOUT_PREVIEW_EXIT_PATH, type LayoutPageKey, type LayoutSectionKey } from "@/lib/page-layout/registry";
import { defaultPageLayout, resolvePageLayout } from "@/lib/page-layout/resolve";
import type { ResolvedPageLayout, StoredEntry } from "@/lib/page-layout/types";
import { withTestLang } from "@/test/root-params-stub";

import { layoutPreviewBanner, LayoutPreviewBanner } from "./preview-banner";
import { PageLayoutFrame, renderLayoutSections, type LayoutSlots, type SectionContext } from "./render";

type Seen = SectionContext<string>;

/** Slots for every section of `page` that render `<section data-key data-tone data-side>`; `nulls` render nothing. */
function fakeSlots<P extends LayoutPageKey>(page: P, nulls: readonly string[] = [], seen: Seen[] = []): LayoutSlots<P> {
  const keys = [...movableKeys(page), pinnedLastKey(page)].filter((key): key is string => key !== null);
  const slots = Object.fromEntries(
    keys.map((key) => [
      key,
      nulls.includes(key)
        ? null
        : (ctx: Seen) => {
            seen.push(ctx);
            return createElement("section", { "data-key": ctx.key, "data-tone": ctx.tone, "data-side": ctx.side });
          },
    ]),
  );
  return slots as unknown as LayoutSlots<P>;
}

/** "key:tone" for every section rendered by renderLayoutSections. */
function tones<P extends LayoutPageKey>(layout: ResolvedPageLayout<P>, nulls: readonly string[] = []): string[] {
  const html = renderToStaticMarkup(createElement("div", null, renderLayoutSections(layout, fakeSlots(layout.page, nulls))));
  return [...html.matchAll(/data-key="([^"]+)" data-tone="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
}

const entries = (...keys: string[]): StoredEntry[] =>
  keys.map((key) => (key.startsWith("-") ? { key: key.slice(1), hidden: true } : { key, hidden: false }));

describe("renderLayoutSections: tone rhythm", () => {
  it("home default, demo-shaped slots: today's tones", () => {
    expect(tones(defaultPageLayout("home"))).toEqual([
      "stats:white",
      "results:white",
      "programs:surface",
      "tools:white",
      "why:surface",
      "centres:white",
      "life:white",
      "voices:surface",
      "impact:white",
      "resources:surface",
      "cta:white",
    ]);
  });

  it("home default, production-shaped slots (no stats, centres or voices)", () => {
    expect(tones(defaultPageLayout("home"), ["stats", "centres", "voices"])).toEqual([
      "results:white",
      "programs:surface",
      "tools:white",
      "why:surface",
      "life:white",
      "impact:surface",
      "resources:white",
      "cta:white",
    ]);
  });

  it("own-background sections restart the rhythm at white", () => {
    const layout = resolvePageLayout("home", entries("results", "stats", "programs", "tools", "why", "life", "centres", "voices"));
    expect(tones(layout).slice(0, 8)).toEqual([
      "results:white",
      "stats:white",
      "programs:white",
      "tools:surface",
      "why:white",
      "life:surface",
      "centres:white",
      "voices:white",
    ]);
  });

  it("null slots and hidden sections take no tone", () => {
    expect(tones(defaultPageLayout("about"), ["mission", "journey"])).toEqual([
      "story:white",
      "approach:surface",
      "values:white",
      "results:surface",
      "explore:white",
      "spaces:surface",
      "cta:white",
    ]);
    const hidden = resolvePageLayout("about", entries("story", "-mission", "approach", "-values", "results"));
    expect(tones(hidden, ["journey"])).toEqual([
      "story:white",
      "approach:surface",
      "results:white",
      "explore:surface",
      "spaces:white",
      "cta:surface",
    ]);
  });

  it("a reordered layout still alternates", () => {
    const layout = resolvePageLayout("admissions", entries("faqs", "results", "enquiry", "-downloads", "next", "scholarships"));
    expect(tones(layout)).toEqual([
      "faqs:white",
      "results:surface",
      "enquiry:white",
      "next:surface",
      "scholarships:white",
    ]);
    // Tools: the Rancho band brings its own background.
    const tools = resolvePageLayout("tools", entries("planner", "rancho", "ask", "predictor", "mockTests"));
    expect(tones(tools)).toEqual([
      "planner:white",
      "rancho:white",
      "ask:white",
      "predictor:surface",
      "mockTests:white",
      "note:surface",
    ]);
  });

  it("passes the side and the keys that actually render", () => {
    const seen: Seen[] = [];
    const layout = resolvePageLayout("results", entries("archive", "stories", "-rankers", "method"));
    renderToStaticMarkup(createElement("div", null, renderLayoutSections(layout, fakeSlots("results", ["stories"], seen))));
    expect(seen.map((ctx) => [ctx.key, ctx.tone, ctx.side])).toEqual([
      ["archive", "white", "right"],
      ["method", "surface", "left"],
      ["cta", "white", "right"],
    ]);
    const rendered: readonly LayoutSectionKey<"results">[] = ["archive", "method", "cta"];
    for (const ctx of seen) expect(ctx.rendered).toEqual(rendered);
  });

  it("wraps each section in a keyed fragment", () => {
    const nodes = renderLayoutSections(defaultPageLayout("centres"), fakeSlots("centres"));
    expect(nodes.map((node) => (isValidElement(node) ? node.key : null))).toEqual(["directory", "districts", "cta"]);
  });
});

describe("PageLayoutFrame", () => {
  it("renders the banner, then the hero, then the sections", () => {
    const html = renderToStaticMarkup(
      createElement(PageLayoutFrame<"centres">, {
        layout: defaultPageLayout("centres"),
        banner: createElement("aside", null, "B"),
        hero: createElement("header", null, "H"),
        slots: fakeSlots("centres"),
      }),
    );
    expect(html).toBe(
      '<aside>B</aside><header>H</header><section data-key="directory" data-tone="white" data-side="right"></section>' +
        '<section data-key="districts" data-tone="surface" data-side="left"></section>' +
        '<section data-key="cta" data-tone="white" data-side="right"></section>',
    );
  });

  it("renders nothing extra without a banner", () => {
    const html = renderToStaticMarkup(
      createElement(PageLayoutFrame<"programs">, {
        layout: defaultPageLayout("programs"),
        banner: null,
        hero: createElement("header", null, "H"),
        slots: fakeSlots("programs", ["tracks", "guide"]),
      }),
    );
    expect(html).toBe(
      '<header>H</header><section data-key="directory" data-tone="white" data-side="right"></section>' +
        '<section data-key="cta" data-tone="surface" data-side="left"></section>',
    );
  });
});

describe("preview banner", () => {
  it.each(["en", "hi"] as const)("%s: exit form, hidden fields, back link and texts", (locale) => {
    const t = messagesFor(locale, "layout");
    const html = renderToStaticMarkup(createElement(LayoutPreviewBanner, { page: "about", locale, hasDraft: true, t }));
    expect(html).toMatch(/^<aside aria-labelledby="page-layout-preview-title"/);
    expect(html).toContain('<h2 id="page-layout-preview-title"');
    expect(html).toContain(`action="${PAGE_LAYOUT_PREVIEW_EXIT_PATH}"`);
    expect(html).toContain('method="post"');
    expect(html).toContain('<input type="hidden" name="page" value="about"/>');
    expect(html).toContain(`<input type="hidden" name="lang" value="${locale}"/>`);
    expect(html).toContain(`href="${locale === "hi" ? "/hi" : ""}/admin/page-layout?page=about"`);
    expect(html).toContain('<button type="submit"');
    for (const text of [t.banner.title, t.banner.draft, t.banner.exit, t.banner.back]) expect(html).toContain(text);
    expect(html).not.toContain(t.banner.noDraft);
    // Never fixed or sticky (it sits in the flow above the hero); 44 px targets.
    expect(html).not.toMatch(/\b(fixed|sticky)\b/);
    expect(html.match(/min-h-11/g)).toHaveLength(2);

    const noDraft = renderToStaticMarkup(createElement(LayoutPreviewBanner, { page: "home", locale, hasDraft: false, t }));
    expect(noDraft).toContain(t.banner.noDraft);
    expect(noDraft).toContain(`href="${locale === "hi" ? "/hi" : ""}/admin/page-layout?page=home"`);
  });

  it("layoutPreviewBanner is null outside preview, else the banner in the route's language", async () => {
    expect(await layoutPreviewBanner(defaultPageLayout("home"))).toBeNull();
    const preview = resolvePageLayout("contact", null, { source: "default", preview: { hasDraft: false } });
    const node = await withTestLang("hi", () => layoutPreviewBanner(preview));
    const html = renderToStaticMarkup(createElement("div", null, node));
    expect(html).toContain(messagesFor("hi", "layout").banner.noDraft);
    expect(html).toContain('name="page" value="contact"');
    expect(html).toContain('name="lang" value="hi"');
  });
});
