import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { siteConfig } from "@/config/site";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Sample-only tool pages: "coming soon" in production, working tools in demo builds. */
const SAMPLE_TOOLS = ["/tools/predictor", "/tools/mock-tests", "/tools/mock-tests/leaderboard", "/tools/planner"];

async function sitemapUrls(): Promise<string[]> {
  return (await sitemap()).map((entry) => entry.url);
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
});
