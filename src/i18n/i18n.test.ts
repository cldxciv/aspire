import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { siteConfig } from "@/config/site";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import { defaultLocale, htmlLang, isLocale, locales } from "./config";
import { format } from "./format";
import { messagesFor, type Namespace } from "./messages";
import { alternatesFor, languageAlternates } from "./metadata";
import { isNonLocalizedPath, localeFromPathname, localePath, splitLocale, stripLocale } from "./paths";
import { getLocale, getMessages, localeAlternates } from "./server";

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe("config", () => {
  it("supports en (default) and hi only", () => {
    expect(locales).toEqual(["en", "hi"]);
    expect(defaultLocale).toBe("en");
    expect(htmlLang).toEqual({ en: "en-IN", hi: "hi-IN" });
    for (const value of ["en", "hi"]) expect(isLocale(value)).toBe(true);
    for (const value of ["EN", "hi-IN", "xx", "", "constructor", undefined, null, 1]) expect(isLocale(value)).toBe(false);
  });
});

describe("paths", () => {
  it.each([
    ["/", "en", "/"],
    ["/", "hi", "/hi"],
    ["/about", "en", "/about"],
    ["/about", "hi", "/hi/about"],
    ["/programs/iit-jee", "hi", "/hi/programs/iit-jee"],
    ["/admissions#enquiry", "hi", "/hi/admissions#enquiry"],
    ["/login?role=student", "hi", "/hi/login?role=student"],
    ["/?ref=x", "hi", "/hi?ref=x"],
    ["/hi/about", "en", "/about"],
    ["/hi", "en", "/"],
    ["/en/about", "hi", "/hi/about"],
    ["/hi/about", "hi", "/hi/about"],
    ["/hindi", "hi", "/hi/hindi"],
  ] as const)("localePath(%s, %s) → %s", (href, locale, expected) => {
    expect(localePath(href, locale)).toBe(expected);
  });

  it.each([
    "#home-enquiry",
    "?page=2",
    "https://example.com/about",
    "mailto:office@example.com",
    "tel:+910000000000",
    "//evil.com/x",
    "/api/enquiries",
    "/images/stock/x.jpg",
    "/assets/aspire/logo.webp",
    "/sitemap.xml",
    "/robots.txt",
    "/favicon.ico",
    "/brochure.pdf",
  ])("localePath leaves %s unchanged", (href) => {
    expect(localePath(href, "hi")).toBe(href);
  });

  it("splits and strips the locale segment exactly", () => {
    expect(splitLocale("/hi/about")).toEqual({ locale: "hi", path: "/about" });
    expect(splitLocale("/hi")).toEqual({ locale: "hi", path: "/" });
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/about")).toEqual({ locale: null, path: "/about" });
    expect(splitLocale("/hindi/x")).toEqual({ locale: null, path: "/hindi/x" });
    expect(stripLocale("/en/programs/x")).toBe("/programs/x");
    expect(localeFromPathname("/hi/contact")).toBe("hi");
    expect(localeFromPathname("/contact")).toBe("en");
  });

  it("knows which paths are not localized", () => {
    for (const path of ["/api", "/api/x", "/_next/static/a.js", "/images/a.jpg", "/assets/a", "/.well-known/x", "/og.png"]) {
      expect(isNonLocalizedPath(path), path).toBe(true);
    }
    for (const path of ["/", "/about", "/hi", "/hi/about", "/apiary", "/imagesx", "/programs/iit-jee"]) {
      expect(isNonLocalizedPath(path), path).toBe(false);
    }
  });
});

describe("metadata alternates", () => {
  it("canonical in the page's locale plus en-IN, hi-IN and x-default", () => {
    const languages = { "en-IN": "/about", "hi-IN": "/hi/about", "x-default": "/about" };
    expect(alternatesFor("/about", "en")).toEqual({ canonical: "/about", languages });
    expect(alternatesFor("/about", "hi")).toEqual({ canonical: "/hi/about", languages });
    expect(alternatesFor("/", "hi")).toEqual({ canonical: "/hi", languages: { "en-IN": "/", "hi-IN": "/hi", "x-default": "/" } });
    expect(languageAlternates("/hi/terms", (href) => `https://x.test${href}`)).toEqual({
      "en-IN": "https://x.test/terms",
      "hi-IN": "https://x.test/hi/terms",
      "x-default": "https://x.test/terms",
    });
  });

  it("localeAlternates() reads the root param", async () => {
    setTestLang("hi");
    expect((await localeAlternates("/programs/x")).canonical).toBe("/hi/programs/x");
  });
});

describe("messages", () => {
  const namespaces: Namespace[] = [
    "common",
    "home",
    "programs",
    "results",
    "centres",
    "forms",
    "about",
    "hostels",
    "admissions",
    "contact",
    "resources",
    "legal",
    "portal",
    "auth",
  ];

  /** "a.b.c" → string value for every leaf. */
  function leaves(value: unknown, prefix = ""): Map<string, unknown> {
    const out = new Map<string, unknown>();
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        for (const [path, leaf] of leaves(child, prefix ? `${prefix}.${key}` : key)) out.set(path, leaf);
      }
    } else {
      out.set(prefix, value);
    }
    return out;
  }

  it.each(namespaces)("%s: Hindi has exactly the English keys, all non-empty strings with the same placeholders", (ns) => {
    const en = leaves(messagesFor("en", ns));
    const hi = leaves(messagesFor("hi", ns));
    expect([...hi.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, value] of hi) {
      expect(typeof value, `${ns}.${key}`).toBe("string");
      expect((value as string).trim(), `${ns}.${key}`).not.toBe("");
      const placeholders = (text: unknown) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(placeholders(value), `${ns}.${key}`).toEqual(placeholders(en.get(key)));
    }
  });

  it("common is fully translated into Devanagari for nav labels", () => {
    for (const [key, label] of Object.entries(messagesFor("hi", "common").nav.items)) {
      expect(label, key).toMatch(/[ऀ-ॿ]/);
    }
  });

  it("getMessages() follows the [lang] root param; an unsupported value is a 404", async () => {
    expect((await getMessages("common")).nav.items.home).toBe("Home");
    expect(await withTestLang("hi", () => getMessages("common"))).toBe(messagesFor("hi", "common"));
    expect(await withTestLang("hi", () => getLocale())).toBe("hi");
    await expect(withTestLang("xx", () => getLocale())).rejects.toThrow();
  });

  it("format() fills placeholders and keeps unknown ones visible", () => {
    expect(format("Aspire on {platform}", { platform: "YouTube" })).toBe("Aspire on YouTube");
    expect(format("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
});

describe("sitemap and robots", () => {
  it("lists every public page in both locales with hreflang alternates", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain(siteConfig.url);
    expect(urls).toContain(`${siteConfig.url}/hi`);
    expect(urls).toContain(`${siteConfig.url}/about`);
    expect(urls).toContain(`${siteConfig.url}/hi/about`);
    expect(urls.filter((url) => url.includes("/hi")).length).toBe(urls.length / 2);
    for (const url of urls) expect(url).not.toMatch(/\/(en|student|parent|admin|login|api)(\/|$)/);
    const about = entries.find((entry) => entry.url === `${siteConfig.url}/hi/about`);
    expect(about?.alternates?.languages).toEqual({
      "en-IN": `${siteConfig.url}/about`,
      "hi-IN": `${siteConfig.url}/hi/about`,
      "x-default": `${siteConfig.url}/about`,
    });
  });

  it("robots keeps portal, account and login pages out in both locales", () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow;
    expect(disallow).toEqual([
      "/api/",
      "/student",
      "/parent",
      "/admin",
      "/account",
      "/login",
      "/hi/student",
      "/hi/parent",
      "/hi/admin",
      "/hi/account",
      "/hi/login",
    ]);
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});
