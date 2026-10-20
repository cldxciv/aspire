import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import PlannerPage from "@/app/[lang]/(site)/tools/planner/page";
import { FLASHCARDS } from "@/content/planner/flashcards";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * QA-SEC-M6: /tools/planner and /hi/tools/planner in both content modes (D-005 / D-032 / D-033).
 * Demo: one h1, the "Sample" notice, localised links. Production (no placeholder content): the
 * honest "not available yet" state, and no sample syllabus or flashcard text in the HTML.
 */

async function render(lang: Locale): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, (await PlannerPage()) as ReactNode)),
  );
}

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe("planner page (QA-SEC-M6)", () => {
  it.each(["en", "hi"] as const)("demo mode (%s): one h1, Sample notice, localised links, honest reminder copy", async (lang) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await render(lang);
    const t = messagesFor(lang, "planner");
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain(escape(t.sample.badge));
    expect(html).toContain(escape(t.how.honest.reminders));
    for (const [, href] of html.matchAll(/href="(\/[^"]*)"/g)) {
      if (/^\/(?:_next|images|assets|api)\//.test(href)) continue;
      if (lang === "hi") expect(href, href).toMatch(/^\/hi(\/|$|#|\?)/);
      else expect(href, href).not.toMatch(/^\/hi(\/|$)/);
    }
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/\b(undefined|NaN)\b/);
  });

  it.each(["en", "hi"] as const)("production (%s): 'not available yet', no sample content or JSON-LD shipped", async (lang) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const html = await render(lang);
    const t = messagesFor(lang, "planner");
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain(escape(t.unavailable.title));
    expect(html).not.toContain(escape(t.sample.note));
    expect(html).not.toContain("application/ld+json");
    for (const card of FLASHCARDS.slice(0, 25)) expect(html).not.toContain(escape(card.front[lang]));
  });
});
