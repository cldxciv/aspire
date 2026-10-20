import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import AskAspirePage, { generateMetadata } from "@/app/[lang]/(site)/tools/ask/page";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor, type Namespace } from "@/i18n/messages";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/** /tools/ask and /hi/tools/ask (Rancho, formerly "Ask Aspire"): one h1, localised copy and links, the mascot, honest notes. */

async function render(lang: Locale): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, (await AskAspirePage()) as ReactNode)),
  );
}

afterEach(() => setTestLang("en"));

describe("Rancho page (/tools/ask)", () => {
  it.each(["en", "hi"] as const)("renders in %s with one h1, the tool, the privacy note and localised links", async (lang) => {
    const html = await render(lang);
    const t = messagesFor(lang, "ask");
    const common = messagesFor(lang, "common");
    const text = html.replace(/<[^>]+>/g, " ");
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(escape(t.hero.title));
    // The doubt solver is the same chat as the floating panel (RanchoChat, page variant): a card, not a dialog.
    expect(html).toMatch(/<section aria-labelledby="([^"]+)" data-rancho-chat="page"/);
    expect(html).not.toContain("<dialog");
    expect(html).toMatch(new RegExp(`<h2 id="[^"]+" tabindex="-1"[^>]*>${escape(t.chat.name)}</h2>`));
    expect(html).toContain(escape(t.chat.greeting));
    expect(html).toContain(escape(t.chat.privacy));
    expect(html).toContain(escape(t.chat.disclaimer));
    // Answer language: a labelled select (English / हिंदी), starting with the page's language.
    const languageId = html.match(/<select id="([^"]+)" title="[^"]*"[^>]*>(?:(?!<\/select>).)*value="hi"/)?.[1];
    expect(html).toContain(`<label for="${languageId}" class="sr-only">${escape(t.chat.answerLanguage)}</label>`);
    expect(html).toMatch(new RegExp(`<option value="${lang}" lang="${lang}" selected="">`));
    // One composer row with the photo button, the field and Send.
    expect(html).toMatch(/<form [^>]*data-rancho-composer=""/);
    expect(html).toMatch(new RegExp(`<span class="sr-only">${escape(t.chat.send)}</span></button>`));
    expect(html).toContain(escape(t.stuck.title));
    expect(html).toContain(escape(t.honest.items.sources));
    expect(html).toContain(escape(t.honest.items.ai));
    // Rancho: named in the h1 and the breadcrumb, waving in the hero (named picture + "AI doubt
    // solver" pill instead of a stock photo) and as the avatar beside the answer (decorative).
    expect(t.hero.title).toMatch(lang === "hi" ? /रैंचो/ : /Rancho/);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${escape(t.hero.title)}</h1>`));
    expect(html).toContain(`aria-current="page">${escape(t.hero.crumb)}<`);
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*data-rancho="wave"/);
    expect(html).toContain(`>${escape(t.hero.mascotLabel)}</title>`);
    expect(html).toContain(`>${escape(t.hero.mascotCaption)}<`);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-rancho="head"/);
    expect(html).not.toContain(escape(common.labels.illustrativeStockPhoto));
    // The AI caveat stays prominent: in the hero note and in the honest notes.
    expect(t.hero.note).toMatch(/AI/);
    // Photo upload (camera or gallery, like the panel), and subject chips with all subjects before the first question.
    expect(html).toMatch(/<input type="file" accept="image\/\*"/);
    expect(html).not.toContain("capture=");
    for (const subject of ["physics", "chemistry", "maths", "biology"]) expect(html).toMatch(new RegExp(`type="radio"[^>]*value="${subject}"`));
    expect(text).not.toMatch(/\b(undefined|NaN|null)\b/);

    const prefix = lang === "hi" ? "/hi" : "";
    expect(html).toContain(`href="${prefix}/admissions#enquiry"`);
    expect(html).toContain(`href="${prefix}/tools"`);
    expect(html).toContain(`href="${prefix}/privacy"`);
    // The page never claims to use Aspire's notes, and never ships the API key.
    expect(html).not.toMatch(/ANTHROPIC_API_KEY|sk-ant-/);
  });

  it("has localised metadata with alternates", async () => {
    expect(messagesFor("en", "ask").meta.title).toMatch(/^Ask Rancho/);
    const meta = await withTestLang("hi", () => generateMetadata());
    expect(meta.title).toBe(messagesFor("hi", "ask").meta.title);
    expect(meta.alternates?.canonical).toBeTruthy();
  });
});

/** Every message namespace (one file per namespace in messages/en), so new namespaces are covered too. */
const NAMESPACES = readdirSync(fileURLToPath(new URL("../../i18n/messages/en", import.meta.url)))
  .filter((file) => file.endsWith(".ts"))
  .map((file) => file.replace(/\.ts$/, "") as Namespace);

function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => strings(child, `${path}.${key}`));
  return [];
}

describe("the doubt solver is called Rancho everywhere", () => {
  it("has the namespaces to check", () => {
    expect(NAMESPACES).toEqual(expect.arrayContaining(["ask", "tools", "common", "legal", "portal", "crm", "home"]));
  });

  it.each(["en", "hi"] as const)("no %s message still says “Ask Aspire”", (lang) => {
    const stale: string[] = [];
    for (const ns of NAMESPACES) {
      const messages: unknown = messagesFor(lang, ns);
      expect(messages, `${lang}/${ns} is registered`).toBeDefined();
      for (const [path, text] of strings(messages, ns)) {
        if (/ask\s*aspire|आस्क\s*एस्पायर|एस्क\s*एस्पायर/i.test(text)) stale.push(`${lang}/${path}: ${text}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("names Rancho as an AI in the privacy notice, which still says Anthropic processes the question", () => {
    for (const lang of ["en", "hi"] as const) {
      const item = messagesFor(lang, "legal").privacy.tools.items.find((text) => /Rancho|रैंचो/.test(text));
      expect(item, lang).toBeDefined();
      expect(item).toMatch(lang === "hi" ? /^रैंचो \(हमारा AI डाउट सॉल्वर\)/ : /^Rancho \(our AI doubt solver\)/);
      expect(item).toContain("Anthropic");
    }
  });

  it("says who turns speech into text (Chrome → Google), that Aspire never gets the audio, and how Listen works", () => {
    const en = messagesFor("en", "legal").privacy.tools.items.find((text) => /^Rancho/.test(text)) ?? "";
    expect(en).toMatch(/Voice typing \(🎤\).*in Chrome, the browser's own speech service \(run by Google\)/);
    expect(en).toMatch(/never the audio/);
    expect(en).toMatch(/Listen \(🔊\) reads answers aloud with your device's own voices/);
    // Tool handoffs: described generically (each tool's button has its own "Ask Rancho …" label).
    expect(en).toMatch(/“Ask Rancho …” button in another tool \(such as the predictor, mock tests or study planner\), a short summary/);
    expect(en).not.toContain("Ask Rancho about this");
    const hi = messagesFor("hi", "legal").privacy.tools.items.find((text) => /^रैंचो/.test(text)) ?? "";
    expect(hi).toMatch(/🎤.*Chrome.*Google/);
    expect(hi).toContain("🔊");
    for (const lang of ["en", "hi"] as const) {
      const note = messagesFor(lang, "rancho").panel.voice.note;
      expect(note).toContain("Chrome");
      expect(note).toContain("Google");
      expect(note).toContain("Aspire");
    }
  });
});
