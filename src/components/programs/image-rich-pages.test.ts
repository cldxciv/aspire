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
import { getPrograms } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * D-030 image-rich pages (UPLIFT-A: home, programs, program detail, results, centres): no stock
 * photo repeats on a page, every stock photo carries a visible label, and the results page never
 * shows a person photo (it lists student names). Both locales, preview and production content.
 */

type Locale = "en" | "hi";

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

/** The home hero background and the closing CTA strip share one file on purpose (cached download). */
const SHARED_HOME_FILE = "/images/stock/himalaya-dhauladhar-ridge-hero.jpg";

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
      const files = stockFiles(html).filter((src) => !(name === "home" && src === SHARED_HOME_FILE));
      const repeats = files.filter((src, i) => files.indexOf(src) !== i);
      expect(repeats, `${name} repeats a photo`).toEqual([]);
      if (name !== "home") {
        // Home's hero background and the CTA strip are decorative backdrops (D-019 / D-022).
        expect(html.split(`>${label}<`).length - 1, `${name}: a visible label per stock photo`).toBeGreaterThanOrEqual(
          stockFiles(html).length,
        );
      }
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

describe("image-rich pages: region photos on the centres page", () => {
  it("captions each centre's landscape with its region, in the page's language", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    for (const locale of ["en", "hi"] as const) {
      const t = messagesFor(locale, "centres").regions;
      const html = await render(locale, () => CentresPage());
      for (const caption of [t.shimla, t.hamirpur, t.kullu]) expect(html).toContain(caption.replace(/&/g, "&amp;"));
      expect(html).toContain(t.title);
    }
  });
});
