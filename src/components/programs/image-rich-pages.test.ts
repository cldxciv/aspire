import { createElement, type FunctionComponent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import CentresPage from "@/app/[lang]/(site)/centres/page";
import HomePage from "@/app/[lang]/(site)/page";
import ProgramPage from "@/app/[lang]/(site)/programs/[slug]/page";
import ProgramsPage from "@/app/[lang]/(site)/programs/page";
import ResultsPage from "@/app/[lang]/(site)/results/page";
import { LocaleProvider } from "@/i18n/client";
import { messagesFor } from "@/i18n/messages";
import { RESULT_CARD_PATH } from "@/content/results";
import { getPrograms } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * D-030 image-rich pages (home, programs, program detail, results, centres): no stock photo
 * repeats on a page, every stock photo carries a visible label, and the results page never shows a
 * stock person photo (it lists student names). D-031: no landscape anywhere except the home hero;
 * result cards only in general sections (never on /centres), none in production, where every slot
 * keeps a fallback photo. Both locales, preview and production content.
 */

type Locale = "en" | "hi";

// Whole pages render here (both locales, several pages per test): allow for a loaded full run.
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

const Provider = LocaleProvider as FunctionComponent<{ locale: Locale; children?: ReactNode }>;
async function render(locale: Locale, page: () => Promise<ReactElement>): Promise<string> {
  return withTestLang(locale, async () => renderToStaticMarkup(createElement(Provider, { locale }, await page())));
}

function programProps(locale: Locale, slug: string) {
  return {
    params: Promise.resolve({ lang: locale, slug }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/[lang]/programs/[slug]">;
}

/** Source files of every rendered <img> (next/image encodes them in `/_next/image?url=…`). */
function imageFiles(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)].map((m) => {
    const src = m[1].replace(/&amp;/g, "&");
    const url = src.startsWith("/_next/image") ? new URLSearchParams(src.split("?")[1]).get("url") ?? src : src;
    return decodeURIComponent(url);
  });
}

const stockFiles = (html: string) => imageFiles(html).filter((src) => src.startsWith("/images/stock/"));
const cardFiles = (html: string) => imageFiles(html).filter((src) => src.startsWith(RESULT_CARD_PATH));

/** The home hero's background: the only landscape on the site (D-031, owner choice). */
const HOME_HERO_FILE = "/images/stock/himalaya-dhauladhar-ridge-hero.jpg";
/** Landscape files: stock (src/content/images.ts) and Aspire assets (src/content/aspire-assets.ts). */
const LANDSCAPE_FILES = [
  "himalaya-dhauladhar-ridge-hero",
  "himalaya-blue-ridge",
  "mountain-ridge-trail-snow-peaks",
  "shimla-hill-town-panorama",
  "dhauladhar-peaks-triund-dharamshala",
  "kullu-valley-solang-snow-range",
  "hamirpur-hills-dhauladhar-morning",
  "winding-hill-road-barot",
  "hero-mountains",
  "himachal-landscape",
  "bg-mountain-",
];
const isLandscape = (src: string) => LANDSCAPE_FILES.some((file) => src.includes(file));

const PERSON_STOCK = [
  "young-student-writing",
  "students-taking-notes-class",
  "library-reading-student",
  "mentoring-conversation-table",
  "seminar-students-from-behind",
  "teacher-chalkboard-from-behind",
  "table-discussion-notebooks",
  "young-student-notebook-pencil",
  "study-desk-through-window",
  "students-walking-campus-path",
];
const PERSON_ASSETS = ["hero-students", "students-group-study", "student-studying", "student-boy", "student-girl"];

async function pages(locale: Locale) {
  const programs = await getPrograms();
  return {
    home: await render(locale, () => HomePage()),
    programs: await render(locale, () => ProgramsPage()),
    results: await render(locale, () => ResultsPage()),
    centres: await render(locale, () => CentresPage()),
    ...Object.fromEntries(
      await Promise.all(
        programs.map(async (p) => [`program ${p.slug}`, await render(locale, () => ProgramPage(programProps(locale, p.slug)))]),
      ),
    ),
  } as Record<string, string>;
}

describe.each([
  ["preview", "true"],
  ["production", "false"],
] as const)("image-rich pages (%s content)", (_mode, flag) => {
  it.each(["en", "hi"] as const)("never repeat a stock photo and label every one (%s)", async (locale) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", flag);
    const label = messagesFor(locale, "common").labels.illustrativeStockPhoto;
    for (const [name, html] of Object.entries(await pages(locale))) {
      expect(stockFiles(html).length, `${name} renders stock photos`).toBeGreaterThan(2);
      const files = stockFiles(html);
      const repeats = files.filter((src, i) => files.indexOf(src) !== i);
      expect(repeats, `${name} repeats a photo`).toEqual([]);
      if (name !== "home") {
        // Home's hero background is a decorative backdrop (D-019 / D-022).
        expect(html.split(`>${label}<`).length - 1, `${name}: a visible label per stock photo`).toBeGreaterThanOrEqual(
          stockFiles(html).length,
        );
      }
    }
  });

  it.each(["en", "hi"] as const)("show no landscape outside the home hero (%s)", async (locale) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", flag);
    for (const [name, html] of Object.entries(await pages(locale))) {
      const landscapes = imageFiles(html).filter(isLandscape);
      expect(landscapes, `${name} shows a landscape`).toEqual(name === "home" ? [HOME_HERO_FILE] : []);
    }
  });

  it("results shows no person photo anywhere (it lists student names)", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", flag);
    for (const locale of ["en", "hi"] as const) {
      const html = await render(locale, () => ResultsPage());
      for (const src of imageFiles(html)) {
        for (const file of [...PERSON_STOCK, ...PERSON_ASSETS]) expect(src, `results: ${src}`).not.toContain(file);
      }
    }
  });
});

describe("image-rich pages: result cards (D-031)", () => {
  it.each(["en", "hi"] as const)("preview: cards in general sections only, never on /centres (%s)", async (locale) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const all = await pages(locale);
    const withCards = [
      "home",
      "programs",
      "results",
      "program jee-neet-pinnacle-2027",
      "program class-12-intensive",
      "program dropper-special",
    ];
    for (const name of withCards) expect(cardFiles(all[name]).length, `${name} shows result cards`).toBeGreaterThan(5);
    expect(cardFiles(all.centres), "centres shows no result card").toEqual([]);
    expect(cardFiles(all["program junior-foundation"]), "Foundation has no result cards").toEqual([]);
    for (const [name, html] of Object.entries(all)) {
      // Each slot renders a card at most twice (its phone and desktop mosaics, or the marquee's
      // aria-hidden loop copy); a third copy would mean one card in two slots.
      const files = cardFiles(html);
      const tooMany = [...new Set(files)].filter((file) => files.filter((f) => f === file).length > 2);
      expect(tooMany, `${name} shows a card in two slots`).toEqual([]);
    }
    // Exam-filtered program pages: a NEET program shows NEET cards only, a JEE program JEE only.
    const examsOf = (html: string) =>
      new Set([...html.matchAll(/<img alt="[^"]*?(JEE|NEET) \d{4}[^"]*"[^>]*src="\/api\/result-cards\//g)].map((m) => m[1]));
    expect([...examsOf(all["program dropper-special"])]).toEqual(["NEET"]);
    expect([...examsOf(all["program class-12-intensive"])]).toEqual(["JEE"]);
    expect([...examsOf(all["program jee-neet-pinnacle-2027"])].sort()).toEqual(["JEE", "NEET"]);
  });

  it.each(["en", "hi"] as const)("production: no result card anywhere, fallback photos instead (%s)", async (locale) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const all = await pages(locale);
    for (const [name, html] of Object.entries(all)) expect(html, name).not.toContain(RESULT_CARD_PATH);
    // The slots that show cards in preview keep a non-nature photo.
    const fallbacks: Record<string, string[]> = {
      home: ["hand-writing-notebook-solutions", "teacher-chalkboard-from-behind", "graduate-silhouette-cap-sky"],
      programs: ["pocket-watch-calculus-worksheet"],
      results: ["graduate-silhouette-cap-sky", "signing-form-pen-hands", "hand-writing-notebook-solutions"],
    };
    for (const [name, files] of Object.entries(fallbacks)) {
      for (const file of files) expect(stockFiles(all[name]).some((src) => src.includes(file)), `${name}: ${file}`).toBe(true);
    }
  });
});

describe("image-rich pages: centre card photos", () => {
  it("are labelled stock education photos with no place caption, plus one note, in the page's language", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    for (const locale of ["en", "hi"] as const) {
      const t = messagesFor(locale, "centres");
      const html = await render(locale, () => CentresPage());
      expect(html).toContain(t.photos.note.replace(/'/g, "&#x27;"));
      const files = ["classroom-desks-sunlight", "students-taking-notes-class", "library-reading-student", "table-discussion-notebooks"];
      for (const file of files) expect(stockFiles(html).some((src) => src.includes(file)), file).toBe(true);
      expect(html).not.toMatch(/<figcaption[^>]*>[^<]*(region|valley|range|क्षेत्र|घाटी)[^<]*</i);
    }
  });
});
