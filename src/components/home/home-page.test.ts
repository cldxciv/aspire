import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/[lang]/(site)/page";
import { getFaculty, getFeaturedResults, getStats, getTestimonials } from "@/lib/data";

/** Renders the async home page (sections are server components; client children render statically). */
async function renderHome(): Promise<string> {
  return renderToStaticMarkup(await HomePage());
}

/** The markup of one home section, found by its aria-labelledby id (up to the closing </section>). */
function section(html: string, labelId: string): string {
  const start = html.indexOf(`aria-labelledby="${labelId}"`);
  expect(start, `section ${labelId} should render`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
}

const PREVIEW_SECTIONS = [
  "home-results-title",
  "home-programs-title",
  "home-approach-title",
  "home-centres-title",
  "home-life-title",
  "home-voices-title",
  "home-impact-title",
  "home-resources-title",
  "home-cta-title",
];

/** Design-PNG filler that must never ship (docs/homepage-implementation-plan.md §1). */
const MOCKUP_FILLER = [
  "98765 43210",
  "Palampur",
  "Solan",
  "Trusted Choice",
  "Ex-IIT Faculty",
  "20+ Years",
  "10+ Years",
  "5000+ Students",
  "AIR 48",
  "Rohan Mehta",
  "Sneha Verma",
  "Real Success",
  "We Make It Possible",
];

const PERSON_ASSET_FILES = ["hero-students", "students-group-study", "student-studying", "student-boy", "student-girl"];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("home page with placeholder content (development / preview)", () => {
  it("renders the hero form and every showcase section, with DEMO labels", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await renderHome();

    expect(html).toContain('id="home-enquiry"');
    expect(html).toContain("Take Discipline.");
    for (const id of PREVIEW_SECTIONS) section(html, id);
    expect(html).toContain('aria-labelledby="home-stats-title"');
    expect(html.match(/>Demo/g)?.length ?? 0).toBeGreaterThan(10);

    // Stats show stored values, never the design's numbers.
    const stats = await getStats();
    const years = stats.find((stat) => stat.id === "stat-years");
    if (years) expect(section(html, "home-stats-title")).toContain(years.value);
  });

  it("contains none of the design's placeholder names, numbers or claims", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = (await renderHome()).replace(/&nbsp;|\s+/g, " ");
    for (const filler of MOCKUP_FILLER) expect(html.toLowerCase()).not.toContain(filler.toLowerCase());
  });

  it("keeps AI person images out of every section that names people (D-019)", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await renderHome();
    for (const id of ["home-results-title", "home-voices-title"]) {
      const sectionHtml = section(html, id);
      for (const file of PERSON_ASSET_FILES) expect(sectionHtml).not.toContain(file);
    }
    // The only AI person image is the hero students image, decorative and visibly labelled as an
    // illustration (D-023a); the old small postcard file is no longer rendered.
    const heroEnd = html.indexOf('aria-labelledby="home-stats-title"');
    expect(html.indexOf("hero-students")).toBeLessThan(heroEnd);
    expect(html.slice(heroEnd)).not.toContain("hero-students");
    const heroHtml = html.slice(0, heroEnd);
    const studentsImg = heroHtml.match(/<img[^>]*hero-students-large[^>]*>/)?.[0];
    expect(studentsImg, "hero students image").toBeDefined();
    expect(studentsImg).toContain('alt=""');
    expect(heroHtml).toMatch(/>Illustration</);
    expect(html).not.toContain("hero-students.webp");
  });
});

describe("home page without placeholder content (production)", () => {
  it("shows the hero form and honest fallbacks, and no imported people, numbers or contact details", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const [featured, faculty, testimonials, stats] = await Promise.all([
      getFeaturedResults(),
      getFaculty(),
      getTestimonials(),
      getStats(),
    ]);
    const importedStrings = [
      ...featured.map((result) => result.studentDisplayName ?? ""),
      ...faculty.map((member) => member.name),
      ...testimonials.map((testimonial) => testimonial.author),
      ...stats.map((stat) => stat.label),
      "98166",
      "aspireiitmedical",
    ].filter((value) => value.trim().length > 3);
    expect(importedStrings.length).toBeGreaterThan(10);

    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const html = await renderHome();

    expect(html).toContain('id="home-enquiry"');
    expect(html).not.toMatch(/>Demo/);
    for (const value of importedStrings) expect(html).not.toContain(value);

    // Data-only sections disappear; the results intro stays with an honest note.
    for (const id of ["home-stats-title", "home-faculty-title", "home-centres-title", "home-voices-title", "home-impact-title", "home-resources-title"]) {
      expect(html).not.toContain(`aria-labelledby="${id}"`);
    }
    section(html, "home-results-title");
    section(html, "home-programs-title");
    section(html, "home-approach-title");
    section(html, "home-life-title");
    section(html, "home-cta-title");

    // No published centres → the hero form offers no centre options.
    expect(html).not.toContain("verify availability");
  });
});
