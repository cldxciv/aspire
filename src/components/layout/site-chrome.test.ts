import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mainNav, portalNav } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { setTestLang } from "@/test/root-params-stub";
import { HeaderNav, type HeaderMessages } from "./MainNav";
import { ariaCurrentFor, isActivePath, isActiveSection, isCurrentPage } from "./nav-utils";
import { NotFoundContent } from "./NotFoundContent";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

const programs = mainNav.find((item) => item.labelKey === "programs")!;
const resources = mainNav.find((item) => item.labelKey === "resources")!;

function headerMessages(locale: Locale): HeaderMessages {
  const common = messagesFor(locale, "common");
  return { nav: common.nav, languageSwitcher: common.languageSwitcher };
}

function renderHeaderNav(pathname: string | null, locale: Locale = "en") {
  return renderToStaticMarkup(createElement(HeaderNav, { pathname, locale, messages: headerMessages(locale) }));
}

describe("nav active state", () => {
  it("matches a section and its sub-pages; home only matches itself", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/about", "/")).toBe(false);
    expect(isActivePath("/results/2024", "/results")).toBe(true);
    expect(isActivePath("/resultsx", "/results")).toBe(false);
    expect(isActivePath(null, "/results")).toBe(false);
  });

  it("highlights only one dropdown section for /admissions", () => {
    expect(isActiveSection("/admissions", programs)).toBe(true);
    // "/admissions#faqs" sits under Resources but is an anchor into another section's page.
    expect(isActiveSection("/admissions", resources)).toBe(false);
    expect(isActiveSection("/resources", resources)).toBe(true);
  });

  it("uses aria-current=page for exact pages and never for anchors or queries", () => {
    expect(ariaCurrentFor("/about", "/about")).toBe("page");
    expect(ariaCurrentFor("/programs/jee", "/programs")).toBe("true");
    expect(ariaCurrentFor("/resources", "/resources#downloads")).toBeUndefined();
    expect(isCurrentPage("/login", "/login?role=student")).toBe(false);
  });
});

describe("header", () => {
  it("is a single navy bar: no top bar, phone or portal strip", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const html = renderToStaticMarkup(await SiteHeader());
    expect(html).toContain('data-surface="dark"');
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("Portal and admissions links");
    expect(html).not.toContain("Preview");
  });

  it("shows the slim preview banner only in preview mode", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = renderToStaticMarkup(await SiteHeader());
    expect(html).toContain("DEMO items are unverified");
  });

  it("renders disclosures (not ARIA menus), the login icon and the home enquiry anchor on /", () => {
    const html = renderHeaderNav("/");
    expect(html).not.toMatch(/role="menu(item)?"/);
    expect(html.match(/aria-expanded="false" aria-controls="/g)?.length).toBe(3); // Programs, Resources, mobile toggle
    expect(html).toContain('aria-label="Student and parent login"');
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="#home-enquiry"');
    expect(html).not.toContain('href="/admissions#enquiry"');
    expect(html).toMatch(/aria-current="page"[^>]*href="\/"/);
    for (const item of mainNav) expect(html).toContain(`href="${item.href}"`);
  });

  it("links Enquire Now to the admissions form away from home, including the Suspense fallback", () => {
    for (const pathname of ["/about", null]) {
      const html = renderHeaderNav(pathname);
      expect(html).toContain('href="/admissions#enquiry"');
      expect(html).not.toContain("#home-enquiry");
    }
    // Only the language switcher's current-language label (a <span>) may carry aria-current.
    expect(renderHeaderNav(null)).not.toMatch(/<a [^>]*aria-current/);
  });
});

describe("header (Hindi, D-028)", () => {
  it("localizes labels and every internal link, and accepts rewritten /en paths for active states", () => {
    const hi = messagesFor("hi", "common");
    const html = renderHeaderNav("/hi/about", "hi");
    for (const item of mainNav) {
      expect(html).toContain(`href="${item.href === "/" ? "/hi" : `/hi${item.href}`}"`);
      expect(html).toContain(hi.nav.items[item.labelKey]);
    }
    expect(html).toContain('href="/hi/login"');
    expect(html).toContain(`aria-label="${hi.nav.loginLabel}"`);
    expect(html).toContain('href="/hi/admissions#enquiry"');
    expect(html).toMatch(/aria-current="page"[^>]*href="\/hi\/about"|href="\/hi\/about"[^>]*aria-current="page"/);
    expect(html).not.toContain(">Programs<");
    // The proxy rewrites /about to /en/about: both forms mark About as current.
    expect(renderHeaderNav("/en/about")).toMatch(/aria-current="page"[^>]*href="\/about"|href="\/about"[^>]*aria-current="page"/);
  });

  it("uses the home enquiry anchor on the Hindi homepage", () => {
    const html = renderHeaderNav("/hi", "hi");
    expect(html).toContain('href="#home-enquiry"');
    expect(html).not.toContain("admissions#enquiry");
  });

  it("language switcher keeps the current path and has an accessible name", () => {
    const en = renderHeaderNav("/programs/iit-jee", "en");
    expect(en).toContain('role="group" aria-label="Language"');
    expect(en).toMatch(/<span lang="en-IN" aria-current="true"[^>]*>English<\/span>/);
    expect(en).toMatch(/<a [^>]*href="\/hi\/programs\/iit-jee"[^>]*>हिन्दी<\/a>/);
    expect(en).toContain('hrefLang="hi-IN"');

    const hi = renderHeaderNav("/hi/programs/iit-jee", "hi");
    expect(hi).toContain('aria-label="भाषा (Language)"');
    expect(hi).toMatch(/<a [^>]*href="\/programs\/iit-jee"[^>]*>English<\/a>/);
    expect(hi).toMatch(/<span lang="hi-IN" aria-current="true"[^>]*>हिन्दी<\/span>/);

    // Unknown pathname (Suspense fallback): the other language's home.
    expect(renderHeaderNav(null, "hi")).toMatch(/<a [^>]*href="\/"[^>]*>English<\/a>/);
    // Bar + mobile panel.
    expect(en.match(/role="group"/g)?.length).toBe(2);
  });

  it("SiteHeader reads the locale from the [lang] root param", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    setTestLang("hi");
    const html = renderToStaticMarkup(await SiteHeader());
    const hi = messagesFor("hi", "common");
    expect(html).toContain(hi.previewBanner.longDetail);
    expect(html).toContain(`aria-label="${hi.logo.homeLabel.replace("&", "&amp;")}"`);
    expect(html).toContain('href="/hi"');
    expect(html).not.toContain("DEMO items are unverified");
  });
});

describe("footer", () => {
  it("production: no imported contact details, social links or DEMO badges; no copyright year", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const html = renderToStaticMarkup(await SiteFooter());
    for (const leaked of ["tel:", "mailto:", "wa.me", "facebook.com", "instagram.com", "Demo", "Follow Aspire"]) {
      expect(html).not.toContain(leaked);
    }
    expect(html).toContain("© Aspire IIT &amp; Medical");
    expect(html).not.toMatch(/©[^<]*\d{4}/);
    for (const href of ["/privacy", "/terms", "/sitemap.xml", "/login?role=student", "/login?role=parent"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("preview: DEMO-labelled contact block and validated social links without tracking", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = renderToStaticMarkup(await SiteFooter());
    expect(html).toContain("Demo · contact details pending verification");
    expect(html).toContain("Demo · social links pending verification");
    const socialLinks = html.match(/<a [^>]*aria-label="Aspire on [^"]+"[^>]*>/g) ?? [];
    expect(socialLinks.length).toBeGreaterThan(0);
    for (const tag of socialLinks) {
      expect(tag).toContain('rel="noopener noreferrer"');
      expect(tag).toMatch(/href="https:\/\//);
      expect(tag).not.toMatch(/utm_|fbclid|igshid/);
    }
  });

  it("Hindi: localized labels, /hi links, unchanged sitemap and brand", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    setTestLang("hi");
    const hi = messagesFor("hi", "common");
    const html = renderToStaticMarkup(await SiteFooter());
    for (const text of [hi.footer.blurb, hi.footer.privacy, hi.footer.terms, hi.footer.sitemap, hi.footer.contactDemo]) {
      expect(html).toContain(text);
    }
    for (const href of ["/hi/privacy", "/hi/terms", "/hi/programs", "/hi/admissions", "/hi/login?role=student", "/sitemap.xml"]) {
      expect(html).toContain(`href="${href}"`);
    }
    for (const item of portalNav) expect(html).toContain(hi.nav.items[item.labelKey]);
    expect(html).toContain("© Aspire IIT &amp; Medical");
    expect(html).not.toMatch(/href="\/(about|programs|privacy|terms)"/);
    expect(html).not.toContain("Follow Aspire");
  });
});

describe("not-found content", () => {
  it("is localized with locale-aware links", async () => {
    const en = renderToStaticMarkup(await NotFoundContent());
    expect(en).toContain("We couldn&#x27;t find that page");
    expect(en).toContain('href="/contact"');
    setTestLang("hi");
    const hi = renderToStaticMarkup(await NotFoundContent());
    expect(hi).toContain(messagesFor("hi", "common").notFound.title);
    expect(hi).toContain('href="/hi"');
    expect(hi).toContain('href="/hi/contact"');
  });
});
