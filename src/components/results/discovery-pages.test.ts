import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import CentresPage from "@/app/[lang]/(site)/centres/page";
import HostelsPage from "@/app/[lang]/(site)/hostels/page";
import ProgramPage from "@/app/[lang]/(site)/programs/[slug]/page";
import ProgramsPage from "@/app/[lang]/(site)/programs/page";
import ResultsPage from "@/app/[lang]/(site)/results/page";
import { getCentres, getFeaturedResults, getPrograms, getRankers } from "@/lib/data";
import type { RankerRecord } from "@/lib/types";
import { toRankerRows } from "./server-view";

const PERSON_ASSET_FILES = ["hero-students", "students-group-study", "student-studying", "student-boy", "student-girl"];

function programProps(slug: string) {
  return {
    params: Promise.resolve({ lang: "en", slug }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/[lang]/programs/[slug]">;
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("discovery pages with placeholder content (development / preview)", () => {
  it("programs list shows every program with a DEMO badge, illustration and course facts", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = renderToStaticMarkup(await ProgramsPage());
    const programs = await getPrograms();
    expect(programs.length).toBeGreaterThan(0);
    for (const program of programs) expect(html).toContain(`/programs/${program.slug}`);
    expect(count(html, ">Demo<")).toBe(programs.length);
    expect(html).toContain("icon-iit-program.webp");
    expect(html).toContain("Batch size");
    expect(html).toContain("Daily teaching");
  });

  it("program detail renders the new fields and still 404s for unknown slugs", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const [program] = await getPrograms();
    const html = renderToStaticMarkup(await ProgramPage(programProps(program.slug)));
    expect(html).toContain(program.title.replace(/&/g, "&amp;"));
    if (program.classLevel) expect(html).toContain(program.classLevel);
    if (program.doubtMinutesPerDay) expect(html).toContain(`${program.doubtMinutesPerDay} min per day`);
    expect(html).toContain("Demo · pending verification");
    await expect(ProgramPage(programProps("no-such-program"))).rejects.toThrow();
  });

  it("results page shows stories and only the first page of rankers, all DEMO-labelled", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = renderToStaticMarkup(await ResultsPage());
    const featured = await getFeaturedResults();
    const rankers = await getRankers();
    for (const story of featured) expect(html).toContain(story.studentDisplayName ?? "");
    expect(rankers.length).toBeGreaterThan(24);
    // 24 ranker rows: each <th scope="row"> is one row.
    expect(count(html, 'scope="row"')).toBe(24);
    expect(html).toContain(`Showing 24 of ${rankers.length} rankers`);
    expect(html).toContain("Show 24 more");
    expect(html).toContain("Demo data — pending verification");
    for (const file of PERSON_ASSET_FILES) expect(html).not.toContain(file);
  });

  it("centres page shows campus anchors, tel: links and labelled illustrative images", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = renderToStaticMarkup(await CentresPage());
    const centres = await getCentres();
    for (const centre of centres) {
      expect(html).toContain(`id="${centre.slug}"`);
      if (centre.phone) expect(html).toContain(`href="tel:${centre.phone.replace(/[^\d+]/g, "")}"`);
    }
    // next/image renders encoded /_next/image URLs, so count <img> tags: campus illustrations plus
    // region stock photos (D-030) — every one carries a visible label.
    const images = count(html, "<img");
    expect(count(html, ">Illustrative image<")).toBeGreaterThan(0);
    expect(count(html, ">Illustrative image<") + count(html, ">Illustrative stock photo<")).toBe(images);
    // Region landscapes are captioned as the region, never as a centre or campus.
    expect(html).toContain("Shimla region");
    expect(html).not.toMatch(/>[^<]*(centre|campus) (photo|building)[^<]*</i);
    expect(html).toContain('href="/hostels#hostel-shimla"');
    // Faculty info removed (2026-10-20): no campus heads or faculty links.
    expect(html).not.toContain('href="/faculty');
    expect(html).not.toContain("Raman Sharma");
  });

  it("hostels page lists each campus and labels its photos", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = renderToStaticMarkup(await HostelsPage());
    expect(html).toContain('id="hostel-shimla"');
    // D-030: every image is a labelled stock photo; the in-page photos also say they are not Aspire's hostels.
    const images = count(html, "<img");
    expect(images).toBeGreaterThan(4);
    expect(count(html, ">Illustrative stock photo<")).toBe(images);
    expect(html).toContain("Stock photo for illustration — not an Aspire hostel or campus.");
    // Region landscapes are captioned with the region, never as a centre or campus.
    expect(html).toContain("Shimla region");
    expect(html).not.toMatch(/(?:centre|campus)<\/figcaption>/i);
  });
});

describe("discovery pages render no missing-value artefacts", () => {
  it("contains no 'undefined', 'NaN' or 'null' text in preview mode", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const [program] = await getPrograms();
    const pages = await Promise.all([
      ProgramsPage(),
      ProgramPage(programProps(program.slug)),
      ResultsPage(),
      CentresPage(),
      HostelsPage(),
    ]);
    for (const page of pages) {
      const text = renderToStaticMarkup(page).replace(/<[^>]+>/g, " ");
      expect(text).not.toMatch(/\b(undefined|NaN|null)\b/);
    }
  });
});

describe("discovery pages in production (placeholders hidden)", () => {
  it("render honest empty states and no imported names", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const [programs, results, centres, hostels] = await Promise.all([
      ProgramsPage(),
      ResultsPage(),
      CentresPage(),
      HostelsPage(),
    ]).then((pages) => pages.map((page) => renderToStaticMarkup(page)));

    expect(programs).toContain("Program details are being finalised");
    expect(results).toContain("Only verified records are published");
    expect(results).not.toContain("Rankers list");
    expect(results).not.toContain("Pradyun Dharma");
    expect(centres).toContain("Verified centre locations will be listed here");
    expect(hostels).toContain("Hostel details will be published after verification");
    for (const html of [programs, results, centres, hostels]) expect(html).not.toContain(">Demo<");
  });

  it("strips ranker names that may not be shown before they reach the client", () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const base: RankerRecord = {
      id: "r1",
      studentDisplayName: "Test Student",
      exam: "JEE",
      year: 2025,
      sourceReference: "test",
      consentStatus: "pending",
      status: "published",
    };
    expect(toRankerRows([base])[0].name).toBeNull();
    expect(toRankerRows([{ ...base, consentStatus: "granted" }])[0].name).toBe("Test Student");
  });
});
