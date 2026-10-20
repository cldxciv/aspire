import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/" as string | null }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
}));

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

import { RanchoDock } from "./RanchoDock";
import { RanchoLauncher } from "./RanchoLauncher";
import { isRanchoHiddenPath } from "./rancho-chat";

/** Floating launcher: localised accessible name, popup semantics, hidden where Rancho already is, public site only. */

function renderLauncher(locale: Locale, pathname: string | null): string {
  navigation.pathname = pathname;
  return renderToStaticMarkup(
    createElement(
      LocaleProvider,
      { locale } as ComponentProps<typeof LocaleProvider>,
      createElement(RanchoLauncher, { messages: messagesFor(locale, "rancho") }),
    ),
  );
}

// Visible / accessible text: the SVG's <style> (animation keyframes) is not content.
const text = (html: string) => html.replace(/<style>[^<]*<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

afterEach(() => {
  navigation.pathname = "/";
  setTestLang("en");
});

describe("RanchoLauncher", () => {
  it.each([
    ["en", "/"],
    ["hi", "/hi"],
  ] as const)("renders in %s with an accessible name and dialog popup semantics", (locale, pathname) => {
    const html = renderLauncher(locale, pathname);
    const t = messagesFor(locale, "rancho");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(/^<button type="button" aria-haspopup="dialog" aria-expanded="false"/);
    // Accessible name = the label text (visually hidden on phones, shown from sm).
    expect(text(html)).toBe(t.launcher.label);
    expect(html).toContain(`title="${escape(t.launcher.hint)}"`);
    // The mascot inside is decorative; the panel is not in the page until it is first opened.
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("aria-controls");
    // Fixed, above content but below the header (z-40), clear of safe areas, not printed.
    expect(html).toMatch(/class="[^"]*\bfixed\b[^"]*\bz-30\b/);
    expect(html).toContain("env(safe-area-inset-bottom)");
    expect(html).toContain("print:hidden");
  });

  it("uses Devanagari for the Hindi label", () => {
    expect(messagesFor("hi", "rancho").launcher.label).toMatch(/[ऀ-ॿ]/);
    expect(messagesFor("hi", "rancho").launcher.label).toContain("रैंचो");
  });

  it.each([
    "/tools/ask",
    "/hi/tools/ask",
    "/en/tools/ask",
    "/tools/ask/",
    "/rancho",
    "/hi/rancho",
    "/en/rancho",
    "/rancho/",
    "/rancho/install",
    "/tools/mock-tests/jee-main-sample-1",
    "/hi/tools/mock-tests/neet-1",
  ])(
    "is hidden on %s",
    (pathname) => {
      expect(isRanchoHiddenPath(pathname)).toBe(true);
      expect(renderLauncher(pathname.startsWith("/hi") ? "hi" : "en", pathname)).toBe("");
    },
  );

  it.each(["/", "/hi", "/about", "/hi/programs/iit-jee", "/tools", "/hi/tools", "/tools/mock-tests", "/tools/mock-tests/leaderboard", "/tools/mock-tests/verify", "/tools/mock-tests/x/result", "/tools/asking", "/ranchos", "/tools/rancho", null])(
    "is shown on %s",
    (pathname) => {
      expect(isRanchoHiddenPath(pathname)).toBe(false);
      expect(renderLauncher("en", pathname)).toContain("<button");
    },
  );
});

describe("RanchoDock (server)", () => {
  it.each(["en", "hi"] as const)("passes the %s strings to the launcher", async (lang) => {
    navigation.pathname = lang === "hi" ? "/hi/about" : "/about";
    const dock = await withTestLang(lang, () => RanchoDock());
    const html = renderToStaticMarkup(createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, dock as ReactNode));
    expect(text(html)).toBe(messagesFor(lang, "rancho").launcher.label);
  });

  it("is mounted in the public site layout only (not portal / admin / CRM)", () => {
    const appDir = join(process.cwd(), "src", "app", "[lang]");
    const siteLayout = readFileSync(join(appDir, "(site)", "layout.tsx"), "utf8");
    expect(siteLayout).toMatch(/import \{ RanchoDock \} from "@\/components\/rancho\/RanchoDock"/);
    expect(siteLayout).toContain("<RanchoDock />");
    const others = [join(appDir, "layout.tsx"), ...readdirSync(join(appDir, "(portal)"), { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => join(appDir, "(portal)", file))];
    for (const file of others) expect(readFileSync(file, "utf8"), file).not.toMatch(/RanchoDock|RanchoLauncher/);
  });
});
