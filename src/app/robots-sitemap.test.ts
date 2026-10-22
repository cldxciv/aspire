import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { siteConfig } from "@/config/site";
import { setQbPaperPortForTests } from "@/lib/mocktest/generated";
import { FakeQbPort } from "@/lib/mocktest/testing/fake-qb-port";
import { QB_SLOTS } from "@/lib/qb/types";

// `connection()` needs a Next.js request scope; outside Next it throws. In the sitemap it only marks
// the route as dynamic (the question bank is read at request time, never at build time).
const connectionMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: connectionMock,
}));

/** A bank that cannot be read (every readiness call fails). */
class UnreadableQbPort extends FakeQbPort {
  override async readiness(): Promise<never> {
    throw new Error("bank unavailable");
  }
}

beforeEach(() => {
  // Every exam can serve a full paper unless a test says otherwise (synthetic bank, no database).
  setQbPaperPortForTests(new FakeQbPort());
});

afterEach(() => {
  vi.unstubAllEnvs();
  setQbPaperPortForTests(null);
  connectionMock.mockClear();
});

/** Sample-only tool pages: "coming soon" in production, working tools in demo builds. */
const SAMPLE_TOOLS = ["/tools/predictor", "/tools/mock-tests", "/tools/mock-tests/leaderboard", "/tools/planner"];

async function sitemapUrls(): Promise<string[]> {
  return (await sitemap()).map((entry) => entry.url);
}

const examPath = (slot: string) => `/tools/mock-tests/exam/${slot}`;

/** Exam-pattern mock pages in the sitemap (English URLs, as paths). */
async function listedExamPaths(): Promise<string[]> {
  const prefix = `${siteConfig.url}/tools/mock-tests/exam/`;
  return (await sitemapUrls()).filter((url) => url.startsWith(prefix)).map((url) => url.slice(siteConfig.url.length));
}

describe("robots", () => {
  it("disallows the staff CRM in both locales in production", () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const { rules, sitemap: sitemapUrl } = robots();
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/crm", "/hi/crm", "/admin", "/hi/admin"]));
    expect(sitemapUrl).toBe(`${siteConfig.url}/sitemap.xml`);
  });

  it("blocks everything in demo builds", () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});

describe("sitemap", () => {
  it("production: lists the tools hub and Rancho, not the sample-only tools", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const urls = await sitemapUrls();
    for (const path of ["/tools", "/tools/ask"]) {
      expect(urls).toContain(`${siteConfig.url}${path}`);
      expect(urls).toContain(`${siteConfig.url}/hi${path}`);
    }
    for (const path of SAMPLE_TOOLS) {
      expect(urls).not.toContain(`${siteConfig.url}${path}`);
      expect(urls).not.toContain(`${siteConfig.url}/hi${path}`);
    }
  });

  it("demo builds: lists the sample tools too, since their pages show them", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const urls = await sitemapUrls();
    for (const path of ["/tools", "/tools/ask", ...SAMPLE_TOOLS]) {
      expect(urls).toContain(`${siteConfig.url}${path}`);
      expect(urls).toContain(`${siteConfig.url}/hi${path}`);
    }
  });

  it.each(["false", "true"])("never lists private or duplicate URLs (SHOW_PLACEHOLDER_CONTENT=%s)", async (mode) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", mode);
    const urls = await sitemapUrls();
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      expect(url.startsWith(siteConfig.url)).toBe(true);
      expect(url).not.toMatch(/\/(en|crm|student|parent|admin|account|login|api)(\/|$)/);
    }
  });

  describe("exam-pattern mock pages (/tools/mock-tests/exam/[slot])", () => {
    it("lists only exams that can serve a full-length paper, in both locales with hreflang alternates", async () => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
      setQbPaperPortForTests(new FakeQbPort({ thin: ["neet-ug", "boh-class-10"] }));
      const entries = await sitemap();
      expect(connectionMock).toHaveBeenCalled();
      expect((await listedExamPaths()).sort()).toEqual([examPath("jee-adv"), examPath("jee-main")]);
      for (const slot of ["jee-main", "jee-adv"]) {
        const en = `${siteConfig.url}${examPath(slot)}`;
        const hi = `${siteConfig.url}/hi${examPath(slot)}`;
        const languages = { "en-IN": en, "hi-IN": hi, "x-default": en };
        expect(entries.find((entry) => entry.url === en)?.alternates?.languages).toEqual(languages);
        expect(entries.find((entry) => entry.url === hi)?.alternates?.languages).toEqual(languages);
      }
      const urls = entries.map((entry) => entry.url);
      for (const slot of ["neet-ug", "boh-class-10"]) {
        expect(urls).not.toContain(`${siteConfig.url}${examPath(slot)}`);
        expect(urls).not.toContain(`${siteConfig.url}/hi${examPath(slot)}`);
      }
    });

    it("lists an exam whose bank serves only a labelled shorter set", async () => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
      setQbPaperPortForTests(new FakeQbPort({ short: true, thin: ["jee-main", "jee-adv", "boh-class-10"] }));
      expect(await listedExamPaths()).toEqual([examPath("neet-ug")]);
    });

    it("lists no exam page while every exam is too thin", async () => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
      setQbPaperPortForTests(new FakeQbPort({ thin: [...QB_SLOTS] }));
      expect(await listedExamPaths()).toEqual([]);
    });

    it("lists no exam page when paper generation is switched off", async () => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
      vi.stubEnv("QB_GENERATION_ENABLED", "off");
      expect(await listedExamPaths()).toEqual([]);
    });

    it("lists no exam page when the bank cannot be read, and still lists every other page", async () => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
      setQbPaperPortForTests(new UnreadableQbPort());
      const urls = await sitemapUrls();
      expect(urls.filter((url) => url.includes("/tools/mock-tests/exam/"))).toEqual([]);
      for (const path of ["/tools", "/tools/ask"]) {
        expect(urls).toContain(`${siteConfig.url}${path}`);
        expect(urls).toContain(`${siteConfig.url}/hi${path}`);
      }
    });
  });
});
