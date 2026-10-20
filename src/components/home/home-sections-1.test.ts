import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { faculty as importedFaculty } from "@/content/faculty";
import { instituteProfile as importedProfile } from "@/content/institute";
import { programs as importedPrograms } from "@/content/programs";
import { results as importedResults } from "@/content/results";
import { stats as importedStats } from "@/content/stats";
import { resultMosaicMedia } from "@/components/results/ResultMosaicMedia";
import { RESULT_CARD_PATH } from "@/content/results";
import {
  getCentres,
  getFeaturedResults,
  getInstituteProfile,
  getPrograms,
  getResultCards,
  getResults,
  getStats,
} from "@/lib/data";
import type { ResultRecord } from "@/lib/types";
import { stockImages } from "@/content/images";
import { HOME_PROGRAMS_SLIDES } from "./home-carousels";
import { ProgramPaths } from "./ProgramPaths";
import { ResultsShowcase, toResultCardViews } from "./ResultsShowcase";
import { StatsBand } from "./StatsBand";
import { WhyAspire } from "./WhyAspire";

/** Renders one section (sync server component, client children rendered as SSR). */
function render<P extends object>(component: FunctionComponent<P>, props: P): string {
  return renderToStaticMarkup(createElement(component, props));
}

/** Text as React escapes it in markup. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function count(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}

const STAT_IDS = ["stat-campuses", "stat-years", "stat-doctors-iitians", "stat-verified-rankers"];
/** Design filler and unapproved claims that must never render (plan §1, §6). */
const DESIGN_FILLER = [
  "10+ Years",
  "5000+",
  "715+",
  "Real Students",
  "Real Success",
  "Learn from the Best",
  "For over a decade",
  "Proven Track Record",
  "Safe &amp; Supportive",
  "Repeaters",
  "For Class 11, 12 &amp; Droppers",
  "Dr. R. Sharma",
  "Rohan Mehta",
  "AIR 48",
];

function expectNoDesignFiller(html: string) {
  for (const filler of DESIGN_FILLER) expect(html).not.toContain(filler);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("home sections I with placeholder content (development / preview)", () => {
  it("StatsBand shows the four headline stats exactly as stored, in order, each DEMO-labelled", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const stats = await getStats();
    const html = render(StatsBand, { stats, locale: "en" });

    let previous = -1;
    for (const id of STAT_IDS) {
      const stat = stats.find((s) => s.id === id);
      expect(stat, id).toBeDefined();
      const at = html.indexOf(`>${esc(stat!.value)}</p>`);
      expect(at, `${id} value, in order`).toBeGreaterThan(previous);
      previous = at;
      expect(html).toContain(esc(stat!.label));
      if (stat!.context) expect(html).toContain(esc(stat!.context));
    }
    // Other headline stats are not part of the band.
    for (const stat of stats.filter((s) => !STAT_IDS.includes(s.id))) expect(html).not.toContain(esc(stat.label));
    expect(count(html, />Demo</g)).toBe(STAT_IDS.length);
    expect(html).toMatch(/font-serif[^"]*">5,000\+</);
    expect(html).not.toContain("<img");
    expectNoDesignFiller(html);
  });

  it("ResultsShowcase renders a rail of DEMO cards with permitted names and no person images", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const results = await getFeaturedResults();
    expect(results.length).toBeGreaterThan(0);
    const html = render(ResultsShowcase, { results, locale: "en" });

    expect(html).toContain("Results, year by year");
    expect(html).toContain('href="/results"');
    expect(html).toMatch(/<h2[^>]*class="[^"]*font-serif/);
    for (const result of results) {
      expect(html).toContain(esc(result.studentDisplayName!));
      expect(html).toContain(esc(result.rankOrOutcome));
      // School and quote are not shown on the home cards.
      if (result.quote) expect(html).not.toContain(esc(result.quote));
      if (result.school) expect(html).not.toContain(esc(result.school));
    }
    expect(count(html, />Demo</g)).toBe(results.length);
    // Without result-card media (D-031) the only image is the decorative, labelled fallback photo:
    // objects only — never a person beside names, never a landscape.
    const images = html.match(/<img[^>]*>/g) ?? [];
    expect(images).toHaveLength(1);
    expect(images[0]).toContain("hand-writing-notebook-solutions");
    expect(images[0]).toContain('alt=""');
    expect(html).toContain(">Illustrative stock photo<");
    for (const file of ["hero-students", "students-group-study", "student-studying", "student-boy", "student-girl"]) {
      expect(html).not.toContain(file);
    }
    expect(html).toContain(`1 of ${results.length}`);
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("Name withheld");
    expectNoDesignFiller(html);
  });

  it("ResultsShowcase withholds names that may not be shown and projects only displayed fields", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const [first] = await getFeaturedResults();
    const withheld: ResultRecord = {
      ...first,
      id: "res-test-withheld-person",
      status: "published",
      consentStatus: "pending",
      studentDisplayName: "Withheld Testperson",
      sourceRef: "internal-provenance-ref",
      sourceReference: "internal-source-reference",
    };
    const html = render(ResultsShowcase, { results: [withheld, first], locale: "en" });
    expect(html).toContain("Name withheld");
    expect(html).not.toContain("Withheld Testperson");
    expect(html).not.toContain("withheld-person");
    expect(html).toContain(esc(first.studentDisplayName!));

    const views = toResultCardViews([withheld, first]);
    for (const view of views) {
      expect(Object.keys(view).sort()).toEqual(["destination", "exam", "name", "outcome", "placeholder", "year"]);
    }
    expect(views[0].name).toBeNull();
    expect(views[0].placeholder).toBe(false);
    const payload = JSON.stringify(views);
    for (const secret of ["Withheld Testperson", "withheld-person", "internal-provenance-ref", "internal-source-reference", "pending"]) {
      expect(payload).not.toContain(secret);
    }
    if (first.quote) expect(payload).not.toContain(first.quote);
    if (first.school) expect(payload).not.toContain(first.school);
  });

  it("ProgramPaths renders one tinted row per program with data labels, links and DEMO badges", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const programs = await getPrograms();
    expect(programs.length).toBeGreaterThan(0);
    const html = render(ProgramPaths, { programs, locale: "en" });

    expect(html).toContain("A clear path for every aspirant");
    expect(html).toContain('href="/programs"');
    for (const program of programs) {
      expect(html).toContain(`href="/programs/${program.slug}"`);
      expect(html).toContain(esc(program.title));
      if (program.classLevel) expect(html).toContain(esc(program.classLevel));
    }
    expect(count(html, />Demo</g)).toBe(programs.filter((p) => p.status === "placeholder").length);
    expect(count(html, /<h3[^>]*class="[^"]*font-serif/g)).toBe(programs.length);

    // A carousel of labelled stock study scenes (home-carousels.ts), lazy (below the fold), with alt text.
    expect(count(html, /aria-roledescription="carousel"/g)).toBe(1);
    expect(html).toContain('aria-label="Our programs: Photo gallery"');
    const images = html.match(/<img[^>]*>/g) ?? [];
    expect(images).toHaveLength(HOME_PROGRAMS_SLIDES.length);
    HOME_PROGRAMS_SLIDES.forEach((key, i) => {
      expect(images[i]).toContain(encodeURIComponent(stockImages[key].src));
      expect(images[i]).toContain(`alt="${esc(stockImages[key].alt)}"`);
      expect(images[i]).toContain('loading="lazy"');
      expect(images[i]).not.toMatch(/fetchPriority="high"/i);
    });
    expect(count(html, />Illustrative stock photo</g)).toBe(HOME_PROGRAMS_SLIDES.length);
    expect(html).not.toContain("Program details are being finalised");
    expectNoDesignFiller(html);
  });

  it("WhyAspire shows the profile copy, four approach points and one DEMO badge", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const profile = await getInstituteProfile();
    expect(profile).not.toBeNull();
    const html = render(WhyAspire, { profile, locale: "en" });

    expect(html).toContain("More than coaching");
    expect(html).toContain(esc(profile!.mission.title));
    expect(html).toContain(esc(profile!.summary));
    expect(html).toContain('href="/about"');
    expect(html).toContain("Our story");
    expect(html).toMatch(/aria-hidden="true"[^>]*>Rooted in<br\/>Himachal</);
    for (const point of profile!.approach.slice(0, 4)) expect(html).toContain(esc(point.title));
    for (const point of profile!.approach.slice(4)) expect(html).not.toContain(esc(point.title));
    expect(count(html, /Demo · pending verification/g)).toBe(1);
    expect(html).not.toContain("Conceptual clarity"); // fallback points only without a profile

    const images = html.match(/<img[^>]*>/g) ?? [];
    expect(images).toHaveLength(1);
    expect(images[0]).toContain('alt=""');
    expect(images[0]).toContain("teacher-chalkboard-from-behind");
    expectNoDesignFiller(html);
  });
});

describe("home sections I without placeholder content (production)", () => {
  it("renders only honest fallbacks and no imported strings", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const [stats, featured, results, programs, profile, centres] = await Promise.all([
      getStats(),
      getFeaturedResults(),
      getResults(),
      getPrograms(),
      getInstituteProfile(),
      getCentres(),
    ]);
    // Nothing is published today; the sections must cope with empty data.
    expect([stats, featured, results, programs, centres].every((list) => list.length === 0)).toBe(true);
    expect(profile).toBeNull();

    const statsHtml = render(StatsBand, { stats, locale: "en" });
    const resultsHtml = render(ResultsShowcase, { results: featured.length > 0 ? featured : results.slice(0, 4), locale: "en" });
    const programsHtml = render(ProgramPaths, { programs, locale: "en" });
    const whyHtml = render(WhyAspire, { profile, locale: "en" });

    // Hidden sections.
    expect(statsHtml).toBe("");

    // Results: intro, one honest line and the link — no rail, no "awaiting" cards.
    expect(resultsHtml).toContain("Results, year by year");
    expect(resultsHtml).toContain("Verified results will be published here once Aspire has confirmed them.");
    expect(resultsHtml).toContain('href="/results"');
    expect(resultsHtml).not.toContain("<article");
    expect(resultsHtml).not.toContain("aria-live");
    expect(resultsHtml).not.toMatch(/awaiting/i);
    expect(resultsHtml).not.toContain("Name withheld");

    // Programs: compact empty state pointing to the enquiry form.
    expect(programsHtml).toContain("Program details are being finalised");
    expect(programsHtml).toContain('href="/admissions#enquiry"');
    expect(programsHtml).not.toContain('href="/programs/');

    // Why Aspire: generic copy and the About page's neutral points.
    expect(whyHtml).toContain("More than coaching");
    for (const title of ["Conceptual clarity", "Structured practice", "Consistent feedback", "Accessible guidance"]) {
      expect(whyHtml).toContain(title);
    }
    expect(whyHtml).toContain('href="/about"');

    const html = [statsHtml, resultsHtml, programsHtml, whyHtml].join("\n");
    expect(html).not.toMatch(/>Demo</);
    expect(html).not.toContain("Demo · pending verification");
    expectNoDesignFiller(html);

    // Zero imported strings: names, numbers, titles and profile copy.
    const imported = [
      ...importedResults.flatMap((r) => [r.studentDisplayName, r.rankOrOutcome, r.destination]),
      ...importedFaculty.flatMap((f) => [f.name, f.credentials, f.role]),
      ...importedPrograms.flatMap((p) => [p.title, p.classLevel]),
      ...importedStats.filter((s) => STAT_IDS.includes(s.id)).flatMap((s) => [s.value, s.label, s.context]),
      importedProfile.summary,
      importedProfile.mission.title,
      ...importedProfile.approach.map((point) => point.title),
    ].filter((text): text is string => Boolean(text) && text!.length > 1);
    for (const text of imported) expect(html, text).not.toContain(esc(text));
  });
});

describe("home sections I with result-card media (D-031)", () => {
  it("ResultsShowcase and WhyAspire show the mosaic instead of their photo, with no overlay or stock label", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const cards = await getResultCards({ limit: 16 });
    expect(cards).toHaveLength(16);
    const [resultsMedia, whyMedia] = await Promise.all([
      resultMosaicMedia({ locale: "en", cards: cards.slice(0, 8) }),
      resultMosaicMedia({ locale: "en", cards: cards.slice(8) }),
    ]);
    const results = await getFeaturedResults();
    const showcase = render(ResultsShowcase, { results, locale: "en", media: resultsMedia });
    const why = render(WhyAspire, { profile: await getInstituteProfile(), locale: "en", media: whyMedia });
    for (const html of [showcase, why]) {
      expect(html).toContain(`src="${RESULT_CARD_PATH}`);
      expect(html).not.toContain("/images/stock/");
      expect(html).not.toContain(">Illustrative stock photo<");
      // Two breakpoint mosaics over the same cards; the "See all results" tile links to /results.
      expect(count(html, /<ul aria-label="Result cards from Aspire&#x27;s previous batches"/g)).toBe(2);
      expect(html).toContain('href="/results"');
    }
    expect(why).not.toContain("Rooted in");
    // Disjoint cards: no card appears in both sections.
    const files = (html: string) => new Set([...html.matchAll(/src="(\/api\/result-cards\/[^"]+)"/g)].map((m) => m[1]));
    const overlap = [...files(showcase)].filter((file) => files(why).has(file));
    expect(overlap).toEqual([]);
  });

  it("without cards (production) the helper returns null, so the fallback photo shows", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    expect(await getResultCards()).toEqual([]);
    expect(await resultMosaicMedia({ locale: "en", cards: await getResultCards() })).toBeNull();
    const html = render(WhyAspire, { profile: null, locale: "en", media: null });
    expect(html).toContain("teacher-chalkboard-from-behind");
    expect(html).toContain(">Illustrative stock photo<");
    expect(html).not.toContain(RESULT_CARD_PATH);
  });
});
