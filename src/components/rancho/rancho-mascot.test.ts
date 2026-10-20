import { existsSync } from "node:fs";
import { join } from "node:path";

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OFFICIAL_RANCHO_ART_AVAILABLE, RANCHO_ART } from "./rancho-assets";
import { RanchoMascot, RanchoOfficialArt } from "./RanchoMascot";

/** RanchoMascot: both variants, decorative vs titled accessibility, unique ids, official-art switch. */

const render = (props: Parameters<typeof RanchoMascot>[0]) => renderToStaticMarkup(createElement(RanchoMascot, props));

describe("RanchoMascot", () => {
  it("renders the head (square) and wave variants as inline SVG", () => {
    const head = render({});
    const wave = render({ variant: "wave", className: "w-40" });
    expect(head).toMatch(/^<svg[^>]*viewBox="0 0 100 100"/);
    expect(head).toContain('data-rancho="head"');
    expect(wave).toContain('data-rancho="wave"');
    expect(wave).toMatch(/class="block w-40"/);
    expect(wave).not.toBe(head);
    // No external images: everything is drawn inline.
    expect(head + wave).not.toMatch(/<image|<img|href="http/);
  });

  it("is decorative without a title", () => {
    const html = render({ variant: "head" });
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("<title");
  });

  it("is a labelled image with a title", () => {
    const html = render({ variant: "wave", title: "Rancho, Aspire's snow leopard mascot" });
    expect(html).toContain('role="img"');
    expect(html).not.toContain("aria-hidden");
    const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`<title id="${labelledBy}">Rancho, Aspire&#x27;s snow leopard mascot</title>`);
  });

  it("gives every instance its own ids", () => {
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(RanchoMascot, { title: "One" }),
        createElement(RanchoMascot, { variant: "wave", title: "Two" }),
        createElement(RanchoMascot, { title: "Three" }),
      ),
    );
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    // Per instance: the <title> plus the drawing's fur gradient, vest gradient and head clip path.
    expect(ids).toHaveLength(3 * 4);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/); // safe in url(#…) and selectors

    // Each SVG only points at its own gradients / clip path, and every reference resolves.
    const svgs = html.split("</svg>").filter(Boolean);
    expect(svgs).toHaveLength(3);
    for (const svg of svgs) {
      const own = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
      const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(own.has(ref), ref).toBe(true);
      expect(own.has(svg.match(/aria-labelledby="([^"]+)"/)?.[1] ?? "")).toBe(true);
    }
  });

  it("draws Rancho's look: glasses on a spotted face, and the Aspire badge on the waving vest", () => {
    const head = render({});
    const wave = render({ variant: "wave" });
    // Same face in both variants (head outline clipped for the rosettes, two lens frames).
    for (const html of [head, wave]) {
      expect(html).toContain("<clipPath");
      expect(html.match(/<rect[^>]*rx="6.5"/g)).toHaveLength(2);
    }
    // Chest badge: white lettering over the red "IIT & MEDICAL" bar (just a mark on the small avatar).
    for (const html of [head, wave]) {
      expect(html).toContain('fill="#c4262e"');
      expect(html).toMatch(/<g[^>]*fill="none" stroke="#fff"[^>]*>(<path[^>]*><\/path>){6}<\/g>/); // A-S-P-I-R-E
    }
  });

  it("adds no text to the page (badge lettering is drawn, not <text>)", () => {
    // Text inside the SVG would leak into a parent button's accessible name, find-in-page and copy.
    for (const variant of ["head", "wave"] as const) {
      const html = render({ variant });
      expect(html).not.toContain("<text");
      expect(html.replace(/<style>.*?<\/style>/g, "").replace(/<[^>]+>/g, "")).toBe("");
    }
  });

  it("keeps the idle animation behind prefers-reduced-motion (motion-safe)", () => {
    const html = render({ variant: "wave" });
    for (const match of html.matchAll(/animate-\[rancho-[a-z]+/g)) {
      expect(html.slice(Math.max(0, match.index - 12), match.index)).toContain("motion-safe:");
    }
    expect(html).toContain("motion-safe:animate-[rancho-wave");
  });
});

describe("official Rancho artwork switch", () => {
  it("lists the official files in one place, under public/images/rancho", () => {
    for (const art of Object.values(RANCHO_ART)) {
      expect(art.src).toMatch(/^\/images\/rancho\/[a-z-]+\.(webp|png|svg)$/);
      expect(art.width).toBeGreaterThan(0);
      expect(art.height).toBeGreaterThan(0);
    }
    expect(RANCHO_ART.head.width).toBe(RANCHO_ART.head.height);
  });

  it("only claims the official art is available when the files exist", () => {
    for (const art of Object.values(RANCHO_ART)) {
      const present = existsSync(join(process.cwd(), "public", art.src));
      if (OFFICIAL_RANCHO_ART_AVAILABLE) expect(present, art.src).toBe(true);
    }
    // Until Aspire supplies the art, the SVG stand-in is drawn (and marked as a placeholder).
    if (!OFFICIAL_RANCHO_ART_AVAILABLE) expect(render({})).toContain('data-placeholder="true"');
  });

  it("renders the official art with alt text, or hidden when decorative", () => {
    const titled = renderToStaticMarkup(createElement(RanchoOfficialArt, { variant: "head", title: "Rancho", className: "size-10" }));
    expect(titled).toMatch(/^<img[^>]*alt="Rancho"/);
    expect(titled).toContain('width="512"');
    expect(titled).not.toContain("aria-hidden");
    const decorative = renderToStaticMarkup(createElement(RanchoOfficialArt, { variant: "wave" }));
    expect(decorative).toContain('alt=""');
    expect(decorative).toContain('aria-hidden="true"');
  });
});
