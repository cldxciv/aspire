import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { articles as importedArticles } from "@/content/articles";
import { centres as importedCentres } from "@/content/centres";
import { contactDetails as importedContact } from "@/content/contact";
import { hostelInfo as importedHostel } from "@/content/hostels";
import { stats as importedStats } from "@/content/stats";
import { testimonials as importedTestimonials } from "@/content/testimonials";
import {
  getArticles,
  getCentres,
  getContactDetails,
  getHostelInfo,
  getRankerYearCounts,
  getStats,
  getTestimonials,
  type RankerYearCount,
} from "@/lib/data";
import type { Article, Centre, Testimonial } from "@/lib/types";
import { CampusLifeTiles } from "./CampusLifeTiles";
import { CentresShowcase, toCentrePickerItems } from "./CentresShowcase";
import { CtaBand } from "./CtaBand";
import { CENTRE_PIN_POSITIONS } from "./HimachalMap";
import { ImpactChart } from "./ImpactChart";
import { ResourcesTeaser } from "./ResourcesTeaser";
import { pickHomeTestimonials, TestimonialsSection } from "./TestimonialsSection";

const render = (element: ReactElement): string => renderToStaticMarkup(element);

/** Same escaping React applies to text and attribute values. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Visible text only (tags stripped), for wording checks that must ignore URLs and class names. */
function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

const count = (html: string, pattern: RegExp): number => html.match(pattern)?.length ?? 0;

/** Places that appear only in the design mockup; they must never render. */
const MOCKUP_ONLY_PLACES = /palampur|solan/i;
const PERSON_ASSET_FILES = ["hero-students", "students-group-study", "student-studying", "student-boy", "student-girl"];

/** Strings that exist only in imported (placeholder) records. */
const IMPORTED_STRINGS: string[] = [
  ...importedCentres.flatMap((c) => [
    c.name,
    c.address ?? "",
    c.phone ?? "",
    c.email ?? "",
    ...(c.facilities ?? []).map((f) => f.name),
  ]),
  ...importedTestimonials.flatMap((t) => [t.quote.slice(0, 40), t.author]),
  importedHostel.headline,
  ...importedHostel.charter.map((f) => f.name),
  ...importedHostel.features.map((f) => f.name),
  ...importedArticles.flatMap((a) => [a.title, a.summary]),
  ...importedStats.filter((s) => s.group === "results").map((s) => s.label),
  importedContact.phone.display,
  importedContact.email,
  importedContact.hours ?? "",
].filter((s) => s.length > 0);

function expectNoImportedStrings(html: string) {
  for (const needle of IMPORTED_STRINGS) expect(html, `imported string ${JSON.stringify(needle)}`).not.toContain(esc(needle));
}

function testimonial(overrides: Partial<Testimonial> & Pick<Testimonial, "id" | "relation">): Testimonial {
  return {
    quote: `Quote ${overrides.id}`,
    author: `Author ${overrides.id}`,
    isVideo: false,
    consentStatus: "pending",
    status: "placeholder",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("homepage sections II with placeholder content (development / preview)", () => {
  beforeEach(() => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
  });

  it("CentresShowcase: count from data, pins only for data centres, DEMO and illustrative labels", async () => {
    const centres = await getCentres();
    expect(centres.length).toBeGreaterThan(0);
    const html = render(createElement(CentresShowcase, { centres, locale: "en" }));

    expect(html).toContain('aria-labelledby="home-centres-title"');
    expect(html).toContain(`${centres.length} centres across Himachal Pradesh`);
    expect(html).toContain('href="/centres"');
    expect(html).toContain("Map not to scale");
    expect(html).toMatch(/>Demo</);
    expect(html).toContain(">Illustrative image<");

    // Pins (centres in the position table) + the visible list (every centre), all aria-pressed.
    const pinned = centres.filter((c) => c.slug in CENTRE_PIN_POSITIONS);
    expect(count(html, /aria-pressed="(true|false)"/g)).toBe(pinned.length + centres.length);
    expect(count(html, /aria-pressed="true"/g)).toBe(2);
    for (const centre of centres) expect(html).toContain(esc(centre.name));

    // The selected (head) centre's card: tel: link, directory link, one labelled image ≤ 240px.
    const head = centres.find((c) => c.isHeadquarters) ?? centres[0];
    expect(html).toContain(`href="/centres#${head.slug}"`);
    expect(html).toContain('href="tel:');
    const images = html.match(/<img[^>]*>/g) ?? [];
    expect(images).toHaveLength(1);
    expect(images[0]).toMatch(/alt="Illustrative image/);
    const widths = [...html.matchAll(/max-width:(?:min\(100%, ?)?(\d+)px/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const width of widths) expect(width).toBeLessThanOrEqual(240);

    expect(html).not.toMatch(MOCKUP_ONLY_PLACES);
    expect(html).not.toContain("thechunkmedia");
  });

  it("CentresShowcase: one centre reads singular; an unknown slug is listed without a pin", async () => {
    const [first] = await getCentres();
    const unknown: Centre = { ...first, id: "centre-test", slug: "test-town", name: "Test Town Centre", isHeadquarters: false };
    const html = render(createElement(CentresShowcase, { centres: [unknown], locale: "en" }));
    expect(html).toContain("1 centre across Himachal Pradesh");
    expect(count(html, /aria-pressed=/g)).toBe(1); // list button only, no pin
    expect(html).not.toContain("<img"); // no illustration registered for this slug
  });

  it("CentresShowcase: the client view model carries displayed fields only", async () => {
    const items = toCentrePickerItems(await getCentres());
    const allowed = new Set(["slug", "name", "shortName", "label", "address", "phone", "pin", "media", "demo", "href"]);
    for (const item of items) {
      for (const key of Object.keys(item)) expect(allowed.has(key), `unexpected key ${key}`).toBe(true);
      const json = JSON.stringify({ ...item, media: undefined });
      expect(json).not.toMatch(/thechunkmedia|sourceRef|consent|servesDistricts|travelTimes/);
      expect(json).not.toMatch(MOCKUP_ONLY_PLACES);
    }
  });

  it("CampusLifeTiles: four tiles, activity captions with DEMO facility names, labels and note", async () => {
    const [hostel, centres] = await Promise.all([getHostelInfo(), getCentres()]);
    expect(hostel).not.toBeNull();
    const html = render(createElement(CampusLifeTiles, { hostel, centres, locale: "en" }));

    expect(html).toContain('aria-labelledby="home-life-title"');
    expect(html).toContain("A home for learning and growth");
    // D-030: a labelled stock photo band carrying the heading, then the four tiles.
    expect(count(html, /<figure/g)).toBe(5);
    expect(html).toContain("study-desk-through-window.jpg");
    expect(html).toContain(">Illustrative stock photo<");
    for (const file of ["classroom-desks-sunlight.jpg", "library-reading-student.jpg", "science-lab-pipette-experiment.jpg", "campus-building.webp"]) {
      expect(html).toContain(file);
    }
    expect(html).toContain(">Illustrative image<");
    expect(html).toContain(esc("Illustrative stock photos. They do not show Aspire's centres, students or staff."));
    expect(html).toMatch(/>Demo</);
    expect(html).toContain('href="/hostels"');

    const text = textOf(html);
    expect(text).toContain("Classrooms Learning together");
    expect(text).toContain("Hostel life Study and rest");
    expect(text).not.toMatch(/\bsafe\b|non-ac|\bAC\b|warden|capacit/i);
    expect(html).not.toMatch(MOCKUP_ONLY_PLACES);
  });

  it("TestimonialsSection: three written quotes without rank/score claims, no person images, DEMO each", async () => {
    const list = await getTestimonials();
    const picked = pickHomeTestimonials(list);
    // Faculty-naming and rank/score quotes are excluded, so fewer than 3 may remain.
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.length).toBeLessThanOrEqual(3);
    for (const t of picked) expect(t.facultySlugs ?? []).toHaveLength(0);
    for (const t of picked) {
      expect(t.isVideo).toBe(false);
      expect([t.quote, t.context ?? ""].join(" ")).not.toMatch(/\bAIR\b|\bscor|\bmarks\b|\d+\s*\/\s*\d+/i);
    }

    const html = render(createElement(TestimonialsSection, { testimonials: list, locale: "en" }));
    expect(html).toContain('aria-labelledby="home-voices-title"');
    expect(html).toContain("Voices from families");
    // Quote cards plus one labelled object still life (D-030) — never a person beside the names.
    expect(count(html, /<figure/g)).toBe(picked.length + 1);
    expect(count(html, />Demo</g)).toBe(picked.length);
    for (const t of picked) expect(html).toContain(esc(t.quote.slice(0, 30)));
    for (const img of html.match(/<img[^>]*>/g) ?? []) expect(img).toMatch(/quote-icon|desk-lamp-notebook-evening/);
    expect(count(html, />Illustrative stock photo</g)).toBe(1);
    for (const file of PERSON_ASSET_FILES) expect(html).not.toContain(file);
    expect(textOf(html)).not.toMatch(/view all/i);
    expect(html).not.toMatch(MOCKUP_ONLY_PLACES);
  });

  it("TestimonialsSection: alternates voices, drops records failing canShowStudentName or naming faculty, never uses claims", () => {
    const list = [
      testimonial({ id: "p1", relation: "parent" }),
      testimonial({ id: "p2", relation: "parent" }),
      testimonial({ id: "s1", relation: "student", context: "AIR 12 JEE" }),
      testimonial({ id: "s2", relation: "student" }),
      testimonial({ id: "v1", relation: "student", isVideo: true }),
      // Published but without consent: canShowStudentName() is false → never shown.
      testimonial({ id: "x1", relation: "student", status: "published", consentStatus: "pending" }),
      // Names a faculty member → excluded (faculty info removed, 2026-10-20).
      testimonial({ id: "f1", relation: "parent", facultySlugs: ["er-raman-sharma"] }),
    ];
    expect(pickHomeTestimonials(list).map((t) => t.id)).toEqual(["p1", "s2", "p2"]);
    // Claim-bearing quotes never fill remaining slots.
    expect(pickHomeTestimonials(list, 4).map((t) => t.id)).toEqual(["p1", "s2", "p2"]);
  });

  it("ImpactChart: shows exactly the counts passed in, a data table, DEMO and the stored stat", async () => {
    const counts = await getRankerYearCounts({ from: 2020, to: 2024 });
    expect(counts.length).toBeGreaterThan(0);
    const rankerStat = (await getStats("results")).find((s) => s.id === "stat-verified-rankers");
    expect(rankerStat).toBeDefined();
    const html = render(createElement(ImpactChart, { counts, rankerStat, locale: "en" }));

    expect(html).toContain('aria-labelledby="home-impact-title"');
    expect(html).toContain("Entries in the imported results list, by exam year");
    expect(html).toContain("These are list entries, not ranks.");
    expect(html).toContain("Demo data — unverified.");
    expect(html).toMatch(/>Demo/);

    // Direct value labels, in order: JEE then NEET for each year.
    const valueLabels = [...html.matchAll(/<text[^>]*class="fill-ink[^"]*"[^>]*>(\d+)<\/text>/g)].map((m) => Number(m[1]));
    expect(valueLabels).toEqual(counts.flatMap((c) => [c.jee, c.neet]));
    const yearLabels = [...html.matchAll(/<text[^>]*class="fill-muted[^"]*"[^>]*>(\d+)<\/text>/g)].map((m) => Number(m[1]));
    expect(yearLabels).toEqual(counts.map((c) => c.year));

    // Accessible alternatives: the SVG's name lists every value, and the table holds the same numbers.
    expect(html).toContain('role="img"');
    for (const c of counts) expect(html).toContain(`${c.year}: JEE ${c.jee}, NEET ${c.neet}`);
    expect(html).toContain("<details");
    expect(html).toContain("Show data as a table");
    const rows = [...html.matchAll(/<tr[^>]*><th scope="row"[^>]*>(\d+)<\/th><td[^>]*>(\d+)<\/td><td[^>]*>(\d+)<\/td><\/tr>/g)].map(
      (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
    );
    expect(rows).toEqual(counts.map((c) => [c.year, c.jee, c.neet]));

    // The stat exactly as stored.
    expect(html).toContain(`>${esc(rankerStat!.value)}<`);
    expect(html).toContain(`>${esc(rankerStat!.label)}<`);
    expect(html).not.toContain(`${rankerStat!.value}+`);
    expect(html).not.toMatch(/consistent growth|top ranks/i);
  });

  it("ImpactChart: renders whatever counts it is given, omitting zero bars; no DEMO for verified rows", () => {
    const counts: RankerYearCount[] = [
      { year: 2031, jee: 5, neet: 0, placeholder: false },
      { year: 2032, jee: 12, neet: 3, placeholder: false },
    ];
    const html = render(createElement(ImpactChart, { counts, locale: "en" }));
    const valueLabels = [...html.matchAll(/<text[^>]*class="fill-ink[^"]*"[^>]*>(\d+)<\/text>/g)].map((m) => Number(m[1]));
    expect(valueLabels).toEqual([5, 0, 12, 3]);
    expect(count(html, /class="fill-blue /g)).toBe(2);
    expect(count(html, /class="fill-\[#eda100\] /g)).toBe(1);
    expect(html).not.toMatch(/>Demo/);
    expect(html).not.toContain("Demo data");
    expect(html).not.toContain("trophy-success"); // no stat card without a stat
  });

  it("ResourcesTeaser: up to four ArticleCards with DEMO badges and a resources link", async () => {
    const articles = await getArticles();
    expect(articles.length).toBeGreaterThan(0);
    const html = render(createElement(ResourcesTeaser, { articles, locale: "en" }));
    expect(html).toContain('aria-labelledby="home-resources-title"');
    expect(html).toContain("Guidance for your journey");
    expect(html).toContain('href="/resources"');
    for (const a of articles.slice(0, 4)) expect(html).toContain(`href="/resources/${a.slug}"`);
    expect(html).toMatch(/>Demo/);

    const many: Article[] = Array.from({ length: 6 }, (_, i) => ({ ...articles[0], id: `a${i}`, slug: `slug-${i}` }));
    expect(count(render(createElement(ResourcesTeaser, { articles: many, locale: "en" })), /href="\/resources\/slug-/g)).toBe(4);
  });

  it("CtaBand photo: Enquire Now, Call Us (tel:) with number and hours, DEMO, hidden slogan, dark surface", async () => {
    const contact = await getContactDetails();
    expect(contact).not.toBeNull();
    const html = render(
      createElement(CtaBand, {
        variant: "photo",
        headingId: "home-cta-title",
        title: "Ready to begin your journey?",
        description: "Talk to our team about programs and admissions.",
        phone: contact!.phone,
        hours: contact!.hours,
        demo: contact!.status === "placeholder",
      }),
    );
    expect(html).toMatch(/^<section aria-labelledby="home-cta-title" data-surface="dark"/);
    expect(html).toContain("Ready to begin your journey?");
    expect(html).toContain('href="#home-enquiry"');
    expect(html).toContain("Enquire Now");
    expect(html).toMatch(new RegExp(`<a href="tel:${contact!.phone.tel.replace("+", "\\+")}"[^>]*>.*?Call Us</a>`));
    expect(count(html, /href="tel:/g)).toBe(1);
    expect(html).toContain(esc(contact!.phone.display));
    expect(html).toContain(esc(contact!.hours!));
    expect(html).toMatch(/>Demo</);
    const slogan = html.match(/<p aria-hidden="true"[^>]*>(.*?)<\/p>/)?.[1] ?? "";
    expect(textOf(slogan)).toMatch(/Dream\s+·\s+Prepare\s+·\s+Achieve/);
    // Decorative strip: the hero's photo (same file and sizes → cached), alt="", lazy.
    expect(html).toContain("himalaya-dhauladhar-ridge-hero.jpg");
    expect(html).toMatch(/<img alt=""[^>]*loading="lazy"/);
  });
});

describe("homepage sections II without placeholder content (production)", () => {
  beforeEach(() => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
  });

  it("sections without verified records render nothing", async () => {
    const [centres, testimonials, counts, results, articles] = await Promise.all([
      getCentres(),
      getTestimonials(),
      getRankerYearCounts({ from: 2020, to: 2024 }),
      getStats("results"),
      getArticles(),
    ]);
    const rankerStat = results.find((s) => s.id === "stat-verified-rankers");
    expect(render(createElement(CentresShowcase, { centres, locale: "en" }))).toBe("");
    expect(render(createElement(TestimonialsSection, { testimonials, locale: "en" }))).toBe("");
    expect(render(createElement(ImpactChart, { counts, rankerStat, locale: "en" }))).toBe("");
    expect(render(createElement(ResourcesTeaser, { articles, locale: "en" }))).toBe("");
  });

  it("CampusLifeTiles falls back to stock tiles with generic captions and an /about link", async () => {
    const [hostel, centres] = await Promise.all([getHostelInfo(), getCentres()]);
    expect(hostel).toBeNull();
    const html = render(createElement(CampusLifeTiles, { hostel, centres, locale: "en" }));
    expect(count(html, /<figure/g)).toBe(5); // photo band + four tiles
    expect(html).toContain('href="/about"');
    expect(html).not.toContain('href="/hostels"');
    expect(textOf(html)).toContain("Campus life A place to focus");
    expect(textOf(html)).not.toMatch(/hostel/i);
    expect(html).not.toMatch(/>Demo/);
    expectNoImportedStrings(html);
  });

  it("CtaBand photo without a phone shows only the enquiry button", async () => {
    const contact = await getContactDetails();
    expect(contact).toBeNull();
    const html = render(
      createElement(CtaBand, {
        variant: "photo",
        headingId: "home-cta-title",
        title: "Ready to begin your journey?",
        description: "Talk to our team about programs and admissions.",
        phone: contact?.phone ?? null,
      }),
    );
    expect(html).toContain('href="#home-enquiry"');
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("Call Us");
    expect(html).not.toMatch(/>Demo/);
    expectNoImportedStrings(html);
  });

  it("CtaBand default variant keeps its original markup (no photo, no dark surface)", () => {
    const html = render(
      createElement(CtaBand, {
        headingId: "x-title",
        title: "Planning to stay on campus?",
        description: "Ask a counsellor.",
        primary: { label: "Book counselling", href: "/admissions#enquiry" },
        secondary: { label: "Find a campus", href: "/centres" },
        phone: { display: "+91 00000 00000", tel: "+910000000000" },
      }),
    );
    expect(html).toMatch(
      /^<div class="flex flex-col items-start justify-between gap-5 rounded-card bg-linear-to-r from-\[#eaf3ff\] to-\[#fff7dd\] p-6 md:flex-row md:items-center md:p-8"><div><h2 id="x-title" class="text-\[clamp\(1\.5rem,3vw,1\.875rem\)\] font-extrabold leading-tight text-navy">/,
    );
    expect(html).toContain('href="/admissions#enquiry"');
    expect(html).not.toMatch(/data-surface|<section|<img|tel:|Dream/);
  });

  it("no output names a mockup-only place or an imported record", async () => {
    const outputs = [
      render(createElement(CentresShowcase, { centres: await getCentres(), locale: "en" })),
      render(createElement(CampusLifeTiles, { hostel: await getHostelInfo(), centres: await getCentres(), locale: "en" })),
      render(createElement(TestimonialsSection, { testimonials: await getTestimonials(), locale: "en" })),
      render(createElement(ImpactChart, { counts: await getRankerYearCounts({ from: 2020, to: 2024 }), locale: "en" })),
      render(createElement(ResourcesTeaser, { articles: await getArticles(), locale: "en" })),
    ].join("\n");
    expect(outputs).not.toMatch(MOCKUP_ONLY_PLACES);
    expect(outputs).not.toContain(">715<");
    expectNoImportedStrings(outputs);
  });
});

describe("homepage sections II use colour tokens (D-026)", () => {
  const FILES = [
    "CampusLifeTiles.tsx",
    "CentrePicker.tsx",
    "CentresShowcase.tsx",
    "CtaBand.tsx",
    "HimachalMap.tsx",
    "ImpactChart.tsx",
    "ResourcesTeaser.tsx",
    "TestimonialsSection.tsx",
  ];
  // Navy, gold and section-background values — current tokens and the pre-D-026 ones.
  const TOKEN_HEXES = /#(0b2d5b|123a73|08223f|f4c44e|e9b431|eef5ff|09284b|123e70|061e39|ffc629|f5b900|f3f7fc|eef4fb)\b/i;

  it.each(FILES)("%s has no hex literal for a navy / gold / surface token", (file) => {
    const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
    expect(source).not.toMatch(TOKEN_HEXES);
  });
});
