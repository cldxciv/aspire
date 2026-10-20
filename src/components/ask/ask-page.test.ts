import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import AskAspirePage, { generateMetadata } from "@/app/[lang]/(site)/tools/ask/page";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/** /tools/ask and /hi/tools/ask: one h1, localised copy and links, labelled stock photo, honest notes. */

async function render(lang: Locale): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, (await AskAspirePage()) as ReactNode)),
  );
}

afterEach(() => setTestLang("en"));

describe("Ask Aspire page", () => {
  it.each(["en", "hi"] as const)("renders in %s with one h1, the tool, the privacy note and localised links", async (lang) => {
    const html = await render(lang);
    const t = messagesFor(lang, "ask");
    const common = messagesFor(lang, "common");
    const text = html.replace(/<[^>]+>/g, " ");
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(escape(t.hero.title));
    expect(html).toContain(escape(t.form.heading));
    expect(html).toContain(escape(t.form.privacyNote));
    expect(html).toContain(escape(t.stuck.title));
    expect(html).toContain(escape(t.honest.items.sources));
    expect(html).toContain(escape(common.labels.illustrativeStockPhoto));
    // Photo upload with camera capture, and a subject select with all subjects.
    expect(html).toMatch(/type="file"[^>]*accept="image\/\*"[^>]*capture="environment"/);
    for (const subject of ["physics", "chemistry", "maths", "biology"]) expect(html).toContain(`value="${subject}"`);
    expect(text).not.toMatch(/\b(undefined|NaN|null)\b/);

    const prefix = lang === "hi" ? "/hi" : "";
    expect(html).toContain(`href="${prefix}/admissions#enquiry"`);
    expect(html).toContain(`href="${prefix}/tools"`);
    expect(html).toContain(`href="${prefix}/privacy"`);
    // The page never claims to use Aspire's notes, and never ships the API key.
    expect(html).not.toMatch(/ANTHROPIC_API_KEY|sk-ant-/);
  });

  it("has localised metadata with alternates", async () => {
    const meta = await withTestLang("hi", () => generateMetadata());
    expect(meta.title).toBe(messagesFor("hi", "ask").meta.title);
    expect(meta.alternates?.canonical).toBeTruthy();
  });
});
