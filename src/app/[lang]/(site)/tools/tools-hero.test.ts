import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import ToolsPage from "@/app/[lang]/(site)/tools/page";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * /tools hub hero (B · Himalayan editorial, 2026-10-22 hero redesign), en + hi, both content
 * modes: ridge art, gold-capitals eyebrow, the headline with its gold underline, the main action
 * (ask Rancho) and a white card linking to each tool, all in the page's locale. No hero photo; the
 * tool sections keep their labelled stock photos, each used once (D-030 / D-031).
 */

vi.setConfig({ testTimeout: 60_000 });

const LANDSCAPE_FILES = [
  "himalaya-dhauladhar-ridge-hero",
  "himalaya-blue-ridge",
  "mountain-ridge-trail-snow-peaks",
  "shimla-hill-town-panorama",
  "dhauladhar-peaks-triund-dharamshala",
  "kullu-valley-solang-snow-range",
  "hamirpur-hills-dhauladhar-morning",
  "winding-hill-road-barot",
];

/** The tools in page order (the hero card and the sections below). */
const TOOLS = [
  ["predictor", "/tools/predictor"],
  ["mockTests", "/tools/mock-tests"],
  ["ask", "/tools/ask"],
  ["planner", "/tools/planner"],
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

async function render(lang: Locale): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(
      createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, (await ToolsPage()) as ReactNode),
    ),
  );
}

/** The rich hero's markup: from its panel to the first page section. */
function heroOf(html: string): string {
  const at = html.indexOf('data-hero="rich"');
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf("<section", start));
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const reEscape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const linkTo = (href: string, label: string) => new RegExp(`href="${reEscape(href)}"[^>]*>${reEscape(escapeHtml(label))}<`);
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const count = (html: string, needle: string | RegExp) =>
  typeof needle === "string" ? html.split(needle).length - 1 : (html.match(needle) ?? []).length;

describe.each(["true", "false"])("tools hub hero (SHOW_PLACEHOLDER_CONTENT=%s)", (flag) => {
  it.each(["en", "hi"] as const)("%s: editorial frame, ask Rancho, a link to every tool", async (lang) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", flag);
    const html = await render(lang);
    const hero = heroOf(html);
    const t = messagesFor(lang, "tools");
    const label = messagesFor(lang, "common").labels.illustrativeStockPhoto;
    const prefix = lang === "hi" ? "/hi" : "";

    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(hero).toContain('data-hero-art="ridges"');
    expect(hero).toContain(`>${escapeHtml(t.hero.eyebrow)}<`);
    expect(t.hero.title).toContain(t.hero.highlight);
    expect(textOf(/<h1[\s\S]*?<\/h1>/.exec(hero)![0]).trim()).toBe(t.hero.title);
    expect(hero).toMatch(new RegExp(`<span[^>]*style="background-image:url[^"]*"[^>]*>${reEscape(escapeHtml(t.hero.highlight))}</span>`));
    expect(hero).toContain(escapeHtml(t.hero.lead));
    expect(hero).toMatch(linkTo(`${prefix}/tools/ask`, t.hero.primary));

    // The card: one link per tool, in page order, named by the tool.
    expect(hero).toContain(`>${escapeHtml(t.hero.listTitle)}<`);
    const links = [...hero.matchAll(/<li class="border-t[^"]*"><a[^>]*href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
    expect(links).toEqual(TOOLS.map(([key, href]) => [`${prefix}${href}`, escapeHtml(t.items[key].title)]));

    // No hero photo; the page's stock photos are labelled, used once, never a landscape.
    expect(hero).not.toContain("<img");
    const files = [...html.matchAll(/<img[^>]*src="[^"]*%2Fimages%2Fstock%2F([^"&]+)/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(0);
    expect(new Set(files).size, files.join(", ")).toBe(files.length);
    expect(count(html, `>${escapeHtml(label)}<`)).toBe(files.length);
    for (const name of LANDSCAPE_FILES) expect(html, name).not.toContain(name);
    expect(textOf(hero)).not.toMatch(/\[[^\]]*\]/);
    if (lang === "hi") {
      const en = messagesFor("en", "tools");
      for (const english of [en.hero.title, en.hero.eyebrow, en.hero.primary, en.hero.listTitle]) {
        expect(hero, english).not.toContain(escapeHtml(english));
      }
    }
  });
});
