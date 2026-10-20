import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import MockTestPage from "@/app/[lang]/(site)/tools/mock-tests/[testId]/page";
import MockTestResultPage from "@/app/[lang]/(site)/tools/mock-tests/[testId]/result/page";
import MockTestLeaderboardPage from "@/app/[lang]/(site)/tools/mock-tests/leaderboard/page";
import MockTestsPage from "@/app/[lang]/(site)/tools/mock-tests/page";
import MockTestVerifyPage from "@/app/[lang]/(site)/tools/mock-tests/verify/page";
import { Certificate } from "@/components/mocktest/PrintViews";
import { MOCK_TESTS } from "@/content/mocktest";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * Mock-test pages in both locales (D-028) and both content modes (D-005 / D-032): one h1, localised
 * links, sample content labelled — and in production no sample test at all ("coming soon").
 */

function withLocale(locale: Locale, child: React.ReactNode) {
  return createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child);
}

async function render(lang: Locale, page: () => Promise<React.ReactNode>): Promise<string> {
  return withTestLang(lang, async () => renderToStaticMarkup(withLocale(lang, await page())));
}

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

function pageLinks(html: string): string[] {
  return [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]).filter((href) => !/^\/(?:_next|images|assets|api)\//.test(href));
}

const testProps = (testId: string, lang: Locale = "en") =>
  ({ params: Promise.resolve({ lang, testId }) }) as unknown as PageProps<"/[lang]/tools/mock-tests/[testId]">;

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe("mock-test pages with sample content (dev / demo)", () => {
  it.each([
    ["list", () => MockTestsPage()],
    ["runner", () => MockTestPage(testProps("jee-main-sample"))],
    ["leaderboard", () => MockTestLeaderboardPage()],
    ["result", () => MockTestResultPage(testProps("neet-sample") as never)],
    ["verify", () => MockTestVerifyPage()],
  ] as const)("%s renders in English and Hindi with one h1, localised links and Sample labels", async (_name, page) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    for (const lang of ["en", "hi"] as const) {
      const html = await render(lang, page);
      const t = messagesFor(lang, "mocktest");
      expect(count(html, /<h1[\s>]/g), lang).toBe(1);
      expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/\b(undefined|NaN|null)\b/);
      for (const href of pageLinks(html)) {
        if (lang === "hi") expect(href, href).toMatch(/^\/hi(\/|$|#|\?)/);
        else expect(href, href).not.toMatch(/^\/hi(\/|$)/);
      }
      if (_name !== "verify") expect(html).toContain(t.common.sample);
    }
  });

  it("the leaderboard page labels the board honestly (practice, timed by our server) and lists weekly tests only", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    for (const lang of ["en", "hi"] as const) {
      const html = await render(lang, () => MockTestLeaderboardPage());
      const t = messagesFor(lang, "mocktest");
      expect(html).toContain(t.leaderboard.honestLabel);
    }
    const list = await render("en", () => MockTestsPage());
    expect(list).toContain('href="/tools/mock-tests/leaderboard?test=all-himachal-mock-sample"');
    expect(list).not.toContain('href="/tools/mock-tests/leaderboard?test=neet-sample"');
    expect(list).toContain(messagesFor("en", "mocktest").list.practiceNote);
  });

  it("the weekly test's instructions explain the server-timed leaderboard rule", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const weekly = await render("en", () => MockTestPage(testProps("all-himachal-mock-sample")));
    expect(weekly).toContain("between 8 and 32 minutes");
    const practice = await render("en", () => MockTestPage(testProps("neet-sample")));
    expect(practice).not.toContain("Our server times the attempt");
  });

  it("the list shows every sample test with marking, labelled photos and the parent-report note", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await render("en", () => MockTestsPage());
    const t = messagesFor("en", "mocktest");
    for (const test of MOCK_TESTS) expect(html).toContain(test.title.en);
    expect(html).toContain(t.common.sampleNote);
    expect(html).toContain(messagesFor("en", "common").labels.illustrativeStockPhoto);
    expect(html).toContain("MCQ: +4 correct, −1 wrong");
    expect(html).toContain(t.parents.notConnected);
    expect(html).toContain('href="/tools/mock-tests/jee-main-sample"');
  });

  it("the runner page ships questions but never the answer key or solutions", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await render("en", () => MockTestPage(testProps("neet-sample")));
    expect(html).toContain(messagesFor("en", "mocktest").instructions.title);
    // Server-rendered markup contains the instructions; the runner's payload holds no solutions.
    const { runnerPayload, getVisibleMockTest } = await import("@/lib/mocktest/catalog");
    const payload = JSON.stringify(runnerPayload(getVisibleMockTest("neet-sample")!));
    expect(payload).not.toContain('"solution"');
    expect(payload).not.toContain('"answer"');
    expect(payload).toContain("Planck");
  });
});

describe("certificates (QA-SEC-M6 L7)", () => {
  const scored = {
    testId: "neet-sample",
    result: { score: 72, maxScore: 160 },
    review: [],
    projection: null,
    sample: false,
    solutionsReleased: true,
    solutionsReleaseAt: null,
  } as unknown as ComponentProps<typeof Certificate>["scored"];

  async function certificate(lang: Locale, verifyId: string | null): Promise<string> {
    const { runnerPayload, getVisibleMockTest } = await import("@/lib/mocktest/catalog");
    const test = runnerPayload(getVisibleMockTest("neet-sample")!);
    const t = messagesFor(lang, "mocktest");
    return renderToStaticMarkup(
      withLocale(lang, createElement(Certificate, { test, t, scored, submittedAt: Date.parse("2026-10-21T10:00:00+05:30"), verifyId, backHref: "" })),
    );
  }

  it.each(["en", "hi"] as const)("a guest / device-only attempt is a self-generated practice certificate without Aspire's signature (%s)", async (lang) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const t = messagesFor(lang, "mocktest").certificate;
    const html = await certificate(lang, null);
    expect(html).toContain(t.selfLabel);
    expect(html).toContain(t.selfHeading);
    expect(html).not.toContain(t.issuer.replace("&", "&amp;"));
    expect(html).not.toContain("Aspire IIT &amp; Medical</p>");
    expect(html).not.toContain(`${t.verifyIdLabel}: `);
    expect(html).not.toContain("verify?id=");
  });

  it.each(["en", "hi"] as const)("an attempt saved to a student account carries a verification id and link (%s)", async (lang) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const t = messagesFor(lang, "mocktest").certificate;
    const html = await certificate(lang, "0123456789abcdef");
    expect(html).not.toContain(t.selfLabel);
    expect(html).toContain(t.heading);
    expect(html).toContain(t.issuer.replace("&", "&amp;"));
    expect(html).toContain("0123-4567-89AB-CDEF");
    expect(html).toContain(`${lang === "hi" ? "/hi" : ""}/tools/mock-tests/verify?id=0123-4567-89AB-CDEF`);
  });
});

describe("production (no placeholder content)", () => {
  it("the list says practice tests are coming soon and shows no sample test", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    for (const lang of ["en", "hi"] as const) {
      const html = await render(lang, () => MockTestsPage());
      const t = messagesFor(lang, "mocktest");
      expect(count(html, /<h1[\s>]/g)).toBe(1);
      expect(html).toContain(t.comingSoon.title);
      for (const test of MOCK_TESTS) expect(html).not.toContain(test.title[lang]);
      expect(html).not.toContain(t.common.sampleNote);
    }
  });

  it("sample test pages are 404s", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    await expect(render("en", () => MockTestPage(testProps("jee-main-sample")))).rejects.toThrow();
    await expect(render("en", () => MockTestResultPage(testProps("jee-main-sample") as never))).rejects.toThrow();
  });
});

describe("mocktest messages", () => {
  function leaves(value: unknown, prefix = ""): Map<string, unknown> {
    const out = new Map<string, unknown>();
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        for (const [path, leaf] of leaves(child, prefix ? `${prefix}.${key}` : key)) out.set(path, leaf);
      }
    } else out.set(prefix, value);
    return out;
  }

  it("Hindi has exactly the English keys, non-empty, with the same placeholders", () => {
    const en = leaves(messagesFor("en", "mocktest"));
    const hi = leaves(messagesFor("hi", "mocktest"));
    expect([...hi.keys()].sort()).toEqual([...en.keys()].sort());
    const placeholders = (text: unknown) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of hi) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(en.get(key)));
    }
  });
});
