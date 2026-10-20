import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import PredictorPage, { generateMetadata } from "@/app/[lang]/(site)/tools/predictor/page";
import { predictorTables } from "@/content/predictor";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { withTestLang } from "@/test/root-params-stub";
import { getRankers, getResultCards } from "@/lib/data";
import { cardsForInstitutions, getAspireAdmits, institutionKey, topInstitutionKeys } from "@/lib/predictor/admits";
import { matchColleges, scoreTableFor, type CollegeOption } from "@/lib/predictor/engine";
import { collegeTotals } from "./AspireAdmits";
import { formatNumber, formatPercentileRange, formatRankRange } from "./format";
import { shareCardUrl, whatsappHref } from "./SharePanel";
import { improvedOptions, whatIfScale } from "./WhatIfPanel";

// Whole pages render here (both locales): allow for a loaded full run.
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  vi.unstubAllEnvs();
});

async function renderPage(locale: Locale): Promise<string> {
  const page = (await withTestLang(locale, () => PredictorPage())) as ReactNode;
  // LocaleProvider's children prop is required in its type; createElement passes them as an argument.
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, page));
}

const count = (html: string, needle: string) => html.split(needle).length - 1;
/** Text as renderToStaticMarkup escapes it. */
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("predictor page (development / preview: sample tables + DEMO results)", () => {
  it("renders in English with one h1, the sample notice, the form, JSON-LD and Aspire's results", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await renderPage("en");
    const t = messagesFor("en", "predictor");
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain(esc(t.hero.title));
    expect(html).toContain(esc(t.notices.sampleTitle));
    expect(html).toContain(esc(t.form.submit));
    expect(html).toContain(esc(t.form.exams["jee-main"]));
    expect(html).toContain(esc(t.result.empty));
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"WebApplication"');
    expect(html).toContain(esc(t.admits.title));
    expect(html).toContain("Demo · pending verification");
    expect(html).toContain('src="/api/result-cards/');
    expect(html).toContain('href="/admissions#enquiry"');
    expect(html).toContain('href="/tools"');
    // No accuracy claims in the structured data.
    expect(html).not.toMatch(/accura(te|cy)/i);
  });

  it("renders in Hindi with one h1, Hindi copy and /hi links", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await renderPage("hi");
    const t = messagesFor("hi", "predictor");
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain(esc(t.hero.title));
    expect(html).toContain(esc(t.form.submit));
    expect(html).toContain(esc(t.admits.title));
    expect(html).toContain('href="/hi/admissions#enquiry"');
    expect(html).toContain('href="/hi/tools"');
    expect(html).toContain('"inLanguage":"hi-IN"');
  });

  it("metadata targets the predictor keywords and keeps the locale alternates", async () => {
    const en = await withTestLang("en", () => generateMetadata());
    expect(String(en.title)).toMatch(/JEE/);
    expect(String(en.title)).toMatch(/NEET/);
    expect(String(en.title)).toMatch(/Himachal/);
    expect(en.alternates?.canonical).toBe("/tools/predictor");
    expect(JSON.stringify(en.keywords)).toMatch(/JEE rank predictor/);
    expect(JSON.stringify(en.keywords)).toMatch(/NEET college predictor/);
    const hi = await withTestLang("hi", () => generateMetadata());
    expect(hi.alternates?.canonical).toBe("/hi/tools/predictor");
    expect(String(hi.title)).toContain("प्रेडिक्टर");
  });
});

describe("predictor page in production (no placeholder content)", () => {
  it("shows 'coming soon' and leaks no sample numbers, names or result cards", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    for (const locale of ["en", "hi"] as const) {
      const html = await renderPage(locale);
      const t = messagesFor(locale, "predictor");
      expect(count(html, "<h1")).toBe(1);
      expect(html).toContain(esc(t.notices.comingSoonTitle));
      expect(html).not.toContain(esc(t.notices.sampleTitle));
      expect(html).not.toContain(esc(t.form.submit));
      expect(html).not.toContain("NIT Kurukshetra");
      expect(html).not.toContain("Scholarship tier");
      expect(html).not.toContain(esc(t.admits.title));
      expect(html).not.toContain("/api/result-cards/");
      expect(html).not.toContain("Demo");
    }
  });
});

describe("where Aspire students got in (real data, counts only)", () => {
  it("aggregates the visible rankers by exam · college · year, duplicates once, MBBS prefix merged", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const admits = await getAspireAdmits();
    expect(admits).not.toBeNull();
    if (!admits) return;
    expect(admits.placeholder).toBe(true);
    const rankers = await getRankers();
    const distinct = new Set(
      rankers
        .filter((r) => r.exam === "JEE" && r.institution?.trim() === "NIT Hamirpur")
        .map((r) => [r.studentDisplayName.trim(), r.exam, r.year].join("|").toLowerCase()),
    );
    const nitTotal = collegeTotals(admits.rows, "JEE", "all").find((c) => c.key === "nit hamirpur");
    expect(nitTotal?.count).toBe(distinct.size);
    expect(institutionKey("MBBS · IGMC Shimla")).toBe(institutionKey("IGMC Shimla"));
    const neetKeys = new Set(admits.rows.filter((r) => r.exam === "NEET").map((r) => r.key));
    expect(neetKeys.has("igmc shimla")).toBe(true);
    expect(neetKeys.has("mbbs · igmc shimla")).toBe(false);
    // Counts only: no names in the rows.
    const names = new Set(rankers.map((r) => r.studentDisplayName));
    for (const row of admits.rows) expect(names.has(row.institution)).toBe(false);
    expect(admits.years).toEqual([...admits.years].sort((a, b) => b - a));
    const top = topInstitutionKeys(admits, "JEE");
    expect(top[0]).toBe("nit hamirpur");
    const cards = cardsForInstitutions(await getResultCards({ exam: "JEE" }), top);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.institute && top.includes(institutionKey(c.institute)))).toBe(true);
  });

  it("is empty in production while the rankers are unverified", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    expect(await getAspireAdmits()).toBeNull();
  });

  it("filters totals by exam and year", () => {
    const rows = [
      { exam: "JEE" as const, year: 2026, key: "a", institution: "A", count: 2 },
      { exam: "JEE" as const, year: 2024, key: "a", institution: "A", count: 3 },
      { exam: "JEE" as const, year: 2026, key: "b", institution: "B", count: 4 },
      { exam: "NEET" as const, year: 2026, key: "c", institution: "C", count: 9 },
    ];
    expect(collegeTotals(rows, "JEE", "all")).toEqual([
      { key: "a", institution: "A", count: 5, from: 2024, to: 2026 },
      { key: "b", institution: "B", count: 4, from: 2026, to: 2026 },
    ]);
    expect(collegeTotals(rows, "JEE", 2024)).toEqual([{ key: "a", institution: "A", count: 3, from: 2024, to: 2024 }]);
    expect(collegeTotals(rows, "NEET", 2024)).toEqual([]);
  });
});

describe("client helpers", () => {
  it("share URLs carry only exam + bucket; WhatsApp text is encoded", () => {
    const url = shareCardUrl({ exam: "jee-main", mode: "score", from: 180 });
    expect(url).toBe("/api/predictor/card?exam=jee-main&mode=score&from=180");
    expect(url).not.toMatch(/category|state|gender|pwd|name/i);
    const href = whatsappHref("My band: 1,800 – 6,000 & more", "https://example.test/tools/predictor");
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(href.slice("https://wa.me/?text=".length))).toBe(
      "My band: 1,800 – 6,000 & more https://example.test/tools/predictor",
    );
  });

  it("what-if: scale per paper and the options that get better", () => {
    expect(whatIfScale(scoreTableFor("jee-main", predictorTables)!)).toEqual({ step: 5, max: 60, initial: 20 });
    expect(whatIfScale(scoreTableFor("neet-ug", predictorTables)!)).toEqual({ step: 5, max: 145, initial: 20 });
    expect(whatIfScale(scoreTableFor("boh", predictorTables)!)).toEqual({ step: 1, max: 20, initial: 20 });
    const before = matchColleges({ exam: "jee-main", value: 120 }, predictorTables);
    const after = matchColleges({ exam: "jee-main", value: 140 }, predictorTables);
    if (before.status !== "ok" || after.status !== "ok") throw new Error("expected ok");
    const better = improvedOptions(before.options, after.options);
    expect(better.length).toBeGreaterThan(0);
    const was = new Map(before.options.map((o: CollegeOption) => [`${o.institute.id}|${o.program}`, o.tag]));
    for (const o of better) expect(was.get(`${o.institute.id}|${o.program}`)).not.toBe(o.tag);
    expect(improvedOptions(after.options, after.options)).toEqual([]);
  });

  it("formats ranks with Indian grouping and Latin digits in both locales", () => {
    expect(formatNumber(120000, "en")).toBe("1,20,000");
    expect(formatNumber(120000, "hi")).toBe("1,20,000");
    expect(formatRankRange({ low: 2700, high: 6000 }, "en", "{low} – {high}")).toBe("2,700 – 6,000");
    expect(formatPercentileRange({ low: 99.575, high: 99.775 }, "en", "{low} – {high}")).toBe("99.57 – 99.78");
    expect(formatPercentileRange({ low: 98.5, high: 98.5 }, "en", "{low} – {high}")).toBe("98.5");
  });
});

describe("honesty guard (D-032)", () => {
  /** Every source file: no page, message or component may claim a link between scores and Aspire outcomes. */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") ? [full] : [];
    });
  }

  it('never says "students with similar scores" (English or Hindi)', () => {
    const offenders = sourceFiles(path.join(process.cwd(), "src")).filter((file) =>
      /similar[\s-]+(scores?|marks)|समान\s+(स्कोर|अंक)|मिलते[\s-]+जुलते\s+(स्कोर|अंक)/i.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

describe("result copy with sample tables (D-032, QA-SEC-M6)", () => {
  async function renderResult(locale: Locale, status: "placeholder" | "published") {
    const { selectVisibleData } = await import("@/lib/predictor/engine");
    const { ResultBody } = await import("./PredictorApp");
    const tables = {
      scoreTables: predictorTables.scoreTables.map((table) => ({ ...table, status })),
      cutoffTables: predictorTables.cutoffTables.map((table) => ({ ...table, status })),
    };
    const data = selectVisibleData(tables, true);
    const result = matchColleges({ exam: "jee-main", mode: "score", value: 180 }, data);
    if (result.status !== "ok") throw new Error("expected a prediction");
    const t = messagesFor(locale, "predictor");
    const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
    const html = renderToStaticMarkup(
      createElement(Provider, { locale }, createElement(ResultBody, { result, messages: t, sample: status === "placeholder" })),
    );
    return { html, t, result };
  }

  it.each(["en", "hi"] as const)("%s: sample tables never read as official counselling data", async (locale) => {
    const { html, t, result } = await renderResult(locale, "placeholder");
    expect(result.cutoffs?.sample).toBe(true);
    expect(html).toContain(esc(t.result.optionsLeadSample));
    expect(html).toContain(esc(t.result.basedOnSample.split("{exam}")[1]));
    expect(html).not.toContain(esc(result.cutoffs!.counselling));
    expect(html).not.toContain(String(result.band.year));
  });

  it("published tables keep the official wording with counselling and year", async () => {
    const { html, t, result } = await renderResult("en", "published");
    expect(html).toContain(esc(t.result.optionsLead.replace("{counselling}", result.cutoffs!.counselling).replace("{year}", String(result.cutoffs!.year))));
    expect(html).not.toContain(esc(t.result.optionsLeadSample));
  });
});
