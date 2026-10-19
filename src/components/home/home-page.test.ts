import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/(site)/page";
import { getCentres, getFeaturedResults, getPrograms } from "@/lib/data";

/** Renders the async home page (its children are all synchronous components). */
async function renderHome(): Promise<string> {
  return renderToStaticMarkup(await HomePage());
}

/** The markup of one home section, found by its aria-labelledby id. */
function section(html: string, labelId: string): string {
  const start = html.indexOf(`aria-labelledby="${labelId}"`);
  expect(start, `section ${labelId} should render`).toBeGreaterThan(-1);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

const PERSON_ASSET_FILES = ["hero-students", "students-group-study", "student-studying", "student-boy", "student-girl"];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("home page with placeholder content (development / preview)", () => {
  it("renders every imported section with DEMO labels", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await renderHome();
    const programs = await getPrograms();
    const centres = await getCentres();

    expect(html).toContain("Brighter Tomorrows.");
    expect(html).toContain("gold-curve.webp");
    expect(html).toContain("Demo · pending verification"); // hero lead from the institute profile

    const programsHtml = section(html, "home-programs-title");
    for (const program of programs) expect(programsHtml).toContain(program.slug);
    expect(programsHtml.match(/>Demo</g)?.length).toBe(programs.length);

    expect(section(html, "home-approach-title")).toContain("icon-mentorship.webp");

    const centresHtml = section(html, "home-centres-title");
    for (const centre of centres) expect(centresHtml).toContain(`/centres#${centre.slug}`);
    const thumbnails = centresHtml.match(/<img[^>]*>/g) ?? [];
    expect(thumbnails.length).toBe(centres.length);
    for (const img of thumbnails) expect(img).toMatch(/alt="Illustrative image/);
    expect(centresHtml.match(/>Illustrative image</g)?.length).toBe(thumbnails.length);

    expect(section(html, "home-cta-title")).toContain("hero-students.webp");
  });

  it("shows featured result names and keeps person images away from them", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await renderHome();
    const featured = await getFeaturedResults();
    expect(featured.length).toBeGreaterThan(0);

    const resultsHtml = section(html, "home-results-title");
    for (const result of featured.slice(0, 4)) expect(resultsHtml).toContain(result.studentDisplayName);
    for (const chunk of [resultsHtml, section(html, "home-voices-title")]) {
      for (const file of PERSON_ASSET_FILES) expect(chunk).not.toContain(file);
    }
  });
});

describe("home page without placeholder content (production)", () => {
  it("falls back to honest, unlabelled generic content", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const html = await renderHome();

    expect(html).not.toMatch(/>Demo</);
    expect(html).not.toContain("Demo · pending verification");
    expect(html).toContain("Guiding students across Himachal Pradesh");
    expect(html).toContain("Results matter");
    expect(html).toContain("Awaiting approved result record");
    expect(html).not.toContain('aria-labelledby="home-approach-title"');
    expect(html).not.toContain('aria-labelledby="home-voices-title"');
    expect(html).not.toContain("Illustrative image");
  });
});
