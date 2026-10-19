import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import CentresPage from "@/app/(site)/centres/page";
import FacultyPage from "@/app/(site)/faculty/page";
import HostelsPage from "@/app/(site)/hostels/page";
import ProgramPage from "@/app/(site)/programs/[slug]/page";
import ProgramsPage from "@/app/(site)/programs/page";
import ResultsPage from "@/app/(site)/results/page";
import { getCentres, getFaculty, getFeaturedResults, getPrograms, getRankers } from "@/lib/data";
import type { RankerRecord } from "@/lib/types";
import { toRankerRows } from "./server-view";

const PERSON_ASSET_FILES = ["hero-students", "students-group-study", "student-studying", "student-boy", "student-girl"];

function programProps(slug: string) {
  return {
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/programs/[slug]">;
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
    // next/image renders encoded /_next/image URLs, so count <img> tags (only campus illustrations here).
    const images = count(html, "<img");
    expect(images).toBeGreaterThan(0);
    expect(count(html, ">Illustrative image<")).toBe(images);
    expect(html).toContain('href="/hostels#hostel-shimla"');
    expect(html).toContain('href="/faculty#er-raman-sharma"');
  });

  it("faculty page uses initials avatars, never person photos", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = renderToStaticMarkup(await FacultyPage());
    const faculty = await getFaculty();
    for (const member of faculty) expect(html).toContain(`id="${member.slug}"`);
    expect(count(html, ">Demo<")).toBe(faculty.length);
    for (const file of PERSON_ASSET_FILES) expect(html).not.toContain(file);
    expect(html).not.toContain("<img alt=\"A smiling student\"");
  });

  it("hostels page lists each campus and labels its illustrations", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = renderToStaticMarkup(await HostelsPage());
    expect(html).toContain('id="hostel-shimla"');
    expect(html).toContain("Illustrative image — not an Aspire hostel or campus");
    const images = count(html, "<img");
    expect(images).toBeGreaterThan(0);
    expect(images).toBe(count(html, "Illustrative image — not an Aspire hostel or campus"));
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
      FacultyPage(),
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
    const [programs, results, centres, faculty, hostels] = await Promise.all([
      ProgramsPage(),
      ResultsPage(),
      CentresPage(),
      FacultyPage(),
      HostelsPage(),
    ]).then((pages) => pages.map((page) => renderToStaticMarkup(page)));

    expect(programs).toContain("Program details are being finalised");
    expect(results).toContain("Only verified records are published");
    expect(results).not.toContain("Rankers list");
    expect(results).not.toContain("Pradyun Dharma");
    expect(centres).toContain("Verified centre locations will be listed here");
    expect(faculty).toContain("Faculty profiles will be published after verification");
    expect(faculty).not.toContain("Raman Sharma");
    expect(hostels).toContain("Hostel details will be published after verification");
    for (const html of [programs, results, centres, faculty, hostels]) expect(html).not.toContain(">Demo<");
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
