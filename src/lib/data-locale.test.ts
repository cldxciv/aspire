import { isDeepStrictEqual } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import { articles } from "@/content/articles";
import { centres } from "@/content/centres";
import { contactDetails } from "@/content/contact";
import { faqs } from "@/content/faqs";
import { hiOverlays } from "@/content/hi";
import { PROTECTED_KEYS } from "@/content/hi/overlay";
import { hostelInfo } from "@/content/hostels";
import { stockImages } from "@/content/images";
import { instituteProfile } from "@/content/institute";
import { programs } from "@/content/programs";
import { rankers, results } from "@/content/results";
import { stats } from "@/content/stats";
import { testimonials } from "@/content/testimonials";
import {
  type ContentLocale,
  getArticle,
  getArticles,
  getCentre,
  getCentres,
  getContactDetails,
  getDownloadCategoryLabel,
  getDownloads,
  getFaqs,
  getFeaturedResults,
  getHostelInfo,
  getInstituteProfile,
  getProgram,
  getPrograms,
  getRankers,
  getResults,
  getStats,
  getTestimonials,
  localizeImage,
} from "@/lib/data";

afterEach(() => {
  vi.unstubAllEnvs();
});

const preview = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
const production = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");

const DEVANAGARI = /[ऀ-ॿ]/;
const DEVANAGARI_DIGIT = /[०-९]/;
const PROTECTED = new Set<string>(PROTECTED_KEYS);
const IMAGE_KEYS = new Set(["image", "coverImage"]);

/** Every locale-aware accessor, called with an explicit locale or none (English default). */
const accessors: Record<string, (locale?: ContentLocale) => Promise<unknown>> = {
  getPrograms: (l) => getPrograms(undefined, l),
  getProgram: (l) => getProgram(programs[0].slug, l),
  getCentres: (l) => getCentres(undefined, l),
  getCentre: (l) => getCentre(centres[0].slug, l),
  getResults: (l) => getResults(undefined, l),
  getFeaturedResults: (l) => getFeaturedResults(l),
  getRankers: (l) => getRankers(undefined, l),
  getTestimonials: (l) => getTestimonials(undefined, l),
  getStats: (l) => getStats(undefined, l),
  getHostelInfo: (l) => getHostelInfo(l),
  getInstituteProfile: (l) => getInstituteProfile(l),
  getDownloads: (l) => getDownloads(l),
  getContactDetails: (l) => getContactDetails(l),
  getArticles: (l) => getArticles(l),
  getArticle: (l) => getArticle(articles[0].slug, l),
  getFaqs: (l) => getFaqs(undefined, l),
};

const digits = (s: string) => (s.match(/\d+/g) ?? []).sort();
const latinWords = (s: string) => s.match(/[A-Za-z]+/g) ?? [];

/**
 * Walks an English value and its Hindi counterpart and reports every place the
 * Hindi version changes something other than free text: structure, protected
 * keys, numbers, booleans, image src/size, digits inside text, Devanagari
 * numerals, or Latin words that are not in the English text.
 */
function structuralDiffs(en: unknown, hi: unknown, path = "$", out: string[] = []): string[] {
  if (typeof en === "string") {
    if (typeof hi !== "string") out.push(`${path}: not a string`);
    else if (hi !== en) {
      if (!isDeepStrictEqual(digits(en), digits(hi))) out.push(`${path}: digits ${digits(en)} → ${digits(hi)}`);
      if (DEVANAGARI_DIGIT.test(hi)) out.push(`${path}: Devanagari numerals`);
      const lowerEn = en.toLowerCase();
      for (const word of latinWords(hi)) {
        if (!lowerEn.includes(word.toLowerCase())) out.push(`${path}: Latin word "${word}" not in English`);
      }
    }
    return out;
  }
  if (Array.isArray(en)) {
    if (!Array.isArray(hi) || hi.length !== en.length) out.push(`${path}: array shape differs`);
    else en.forEach((item, i) => structuralDiffs(item, hi[i], `${path}[${i}]`, out));
    return out;
  }
  if (typeof en === "object" && en !== null) {
    if (typeof hi !== "object" || hi === null) return [...out, `${path}: not an object`];
    const hiRecord = hi as Record<string, unknown>;
    const enRecord = en as Record<string, unknown>;
    const hiKeys = Object.keys(hiRecord).filter((k) => k !== "quoteLang");
    if (!isDeepStrictEqual(hiKeys, Object.keys(enRecord))) out.push(`${path}: keys differ`);
    for (const key of Object.keys(enRecord)) {
      const at = `${path}.${key}`;
      if (IMAGE_KEYS.has(key)) {
        const strip = (img: unknown) => (img ? { ...(img as object), alt: undefined } : img);
        if (!isDeepStrictEqual(strip(enRecord[key]), strip(hiRecord[key]))) out.push(`${at}: image changed`);
      } else if (PROTECTED.has(key)) {
        if (!isDeepStrictEqual(enRecord[key], hiRecord[key])) out.push(`${at}: protected value changed`);
      } else {
        structuralDiffs(enRecord[key], hiRecord[key], at, out);
      }
    }
    return out;
  }
  if (!Object.is(en, hi)) out.push(`${path}: ${String(en)} → ${String(hi)}`);
  return out;
}

/**
 * Checks an overlay against the English record it overlays: no protected
 * keys, no fields the English record lacks, arrays of the English length.
 */
function overlayMisfits(en: unknown, overlay: unknown, path = "$", out: string[] = []): string[] {
  if (overlay === undefined) return out;
  if (typeof overlay === "string") {
    if (typeof en !== "string") out.push(`${path}: English is not text`);
    return out;
  }
  if (Array.isArray(overlay)) {
    if (!Array.isArray(en) || en.length !== overlay.length) out.push(`${path}: length differs from English`);
    else overlay.forEach((item, i) => overlayMisfits(en[i], item, `${path}[${i}]`, out));
    return out;
  }
  if (typeof overlay === "object" && overlay !== null) {
    if (typeof en !== "object" || en === null) return [...out, `${path}: English is not an object`];
    for (const [key, value] of Object.entries(overlay)) {
      if (PROTECTED.has(key)) out.push(`${path}.${key}: protected key`);
      else if (!Object.hasOwn(en, key)) out.push(`${path}.${key}: not in English`);
      else overlayMisfits((en as Record<string, unknown>)[key], value, `${path}.${key}`, out);
    }
    return out;
  }
  return [...out, `${path}: unexpected overlay value`];
}

const byId = <T extends { id: string }>(items: readonly T[]) => new Map(items.map((i) => [i.id, i]));

describe("English default (D-028)", () => {
  it("returns exactly what the accessor returns without a locale", async () => {
    preview();
    for (const [name, call] of Object.entries(accessors)) {
      expect(await call("en"), name).toEqual(await call());
    }
  });

  it("returns the English source records themselves, without quoteLang", async () => {
    preview();
    const englishPrograms = await getPrograms();
    englishPrograms.forEach((p, i) => expect(p).toBe(programs[i]));
    expect(await getFaqs()).toEqual(faqs);
    expect((await getCentres()).map((c) => c.name)).toEqual(centres.map((c) => c.name));
    expect((await getTestimonials()).some((t) => "quoteLang" in t)).toBe(false);
    expect((await getResults()).some((r) => "quoteLang" in r)).toBe(false);
  });

  it("treats an unknown locale value as English", async () => {
    preview();
    expect(await getPrograms(undefined, "fr" as ContentLocale)).toEqual(await getPrograms());
  });
});

describe("Hindi content", () => {
  it("returns Devanagari text for translated fields", async () => {
    preview();
    for (const p of await getPrograms(undefined, "hi")) {
      for (const text of [p.title, p.shortDescription, p.description, p.targetAudience, ...p.highlights]) {
        expect(text, p.id).toMatch(DEVANAGARI);
      }
      expect(p.image?.alt, p.id).toMatch(DEVANAGARI);
    }
    for (const c of await getCentres(undefined, "hi")) {
      for (const text of [c.name, c.district, c.summary, c.address, c.openingHours, ...(c.servesDistricts ?? [])]) {
        expect(text, c.id).toMatch(DEVANAGARI);
      }
    }
    for (const f of await getFaqs(undefined, "hi")) {
      expect(f.question, f.id).toMatch(DEVANAGARI);
      expect(f.answer, f.id).toMatch(DEVANAGARI);
    }
    for (const a of await getArticles("hi")) {
      for (const text of [a.title, a.summary, ...a.body, a.coverImage?.alt]) expect(text, a.id).toMatch(DEVANAGARI);
    }
    const hostel = await getHostelInfo("hi");
    expect(hostel?.headline).toMatch(DEVANAGARI);
    expect(hostel?.dailyRoutine.every((r) => DEVANAGARI.test(r.title) && DEVANAGARI.test(r.time))).toBe(true);
    expect(hostel?.campuses.every((c) => DEVANAGARI.test(c.note))).toBe(true);
    const profile = await getInstituteProfile("hi");
    expect(profile?.summary).toMatch(DEVANAGARI);
    expect(profile?.milestones.every((m) => DEVANAGARI.test(m.title))).toBe(true);
    expect((await getDownloads("hi")).every((d) => DEVANAGARI.test(d.title))).toBe(true);
    const contact = await getContactDetails("hi");
    expect(contact?.phoneLabel).toMatch(DEVANAGARI);
    expect(contact?.address).toMatch(DEVANAGARI);
    expect(contact?.campusContacts.every((c) => DEVANAGARI.test(c.name) && DEVANAGARI.test(c.hours ?? ""))).toBe(true);
    expect((await getStats(undefined, "hi")).filter((s) => DEVANAGARI.test(s.label)).length).toBe(stats.length - 1);
  });

  it("falls back to English field by field", async () => {
    preview();
    const hiStats = byId(await getStats(undefined, "hi"));
    expect(hiStats.get("stat-igmc-2025")?.label).toBe("IGMC Shimla '25");
    expect(hiStats.get("stat-igmc-2025")?.context).toMatch(DEVANAGARI);
    const boh = (await getInstituteProfile("hi"))?.milestones.find((m) => m.year === 2019);
    expect(boh?.tag).toBe("BOH");
    expect(boh?.title).toMatch(DEVANAGARI);
    const hiTestimonials = byId(await getTestimonials(undefined, "hi"));
    expect(hiTestimonials.get("tst-karthik-sharma")?.context).toBe(
      testimonials.find((t) => t.id === "tst-karthik-sharma")?.context,
    );
    const planner = (await getDownloads("hi")).find((d) => d.id === "dl-revision-planner");
    expect(planner?.size).toBe("14.2 MB PDF");
    expect(planner?.category).toBe("Vault Kit");
  });

  it("changes only free text: ids, slugs, status, consent, numbers, dates, links and images are identical", async () => {
    preview();
    for (const [name, call] of Object.entries(accessors)) {
      expect(structuralDiffs(await call("en"), await call("hi")), name).toEqual([]);
    }
  });

  it("keeps quotes, headlines and names in the original words and marks the quote language", async () => {
    preview();
    const en = byId(await getTestimonials());
    for (const t of await getTestimonials(undefined, "hi")) {
      const original = en.get(t.id);
      expect(t.quote).toBe(original?.quote);
      expect(t.headline).toBe(original?.headline);
      expect(t.author).toBe(original?.author);
      expect(t.quoteLang).toBe("en");
    }
    const featured = await getFeaturedResults("hi");
    expect(featured.length).toBeGreaterThan(0);
    for (const r of featured) {
      expect(r.quote).toBe(results.find((x) => x.id === r.id)?.quote);
      expect(r.quoteLang).toBe("en");
    }
    const enRankers = byId(await getRankers());
    for (const r of await getRankers(undefined, "hi")) {
      expect(r.studentDisplayName).toBe(enRankers.get(r.id)?.studentDisplayName);
      expect(r.institution).toBe(enRankers.get(r.id)?.institution);
    }
    expect((await getRankers({ year: 2026 }, "hi")).find((r) => r.id === "ranker-50")?.note).toMatch(DEVANAGARI);
  });

  it("does not mutate the English source content", async () => {
    preview();
    const snapshot = structuredClone({ programs, centres, faqs, articles, stats, testimonials, hostelInfo, instituteProfile, contactDetails, results, stockImages });
    for (const call of Object.values(accessors)) await call("hi");
    expect({ programs, centres, faqs, articles, stats, testimonials, hostelInfo, instituteProfile, contactDetails, results, stockImages }).toEqual(snapshot);
  });
});

describe("visibility is identical in both locales (D-005)", () => {
  it("hides every placeholder record in production for Hindi too", async () => {
    production();
    for (const [name, call] of Object.entries(accessors)) {
      const [en, hi] = [await call("en"), await call("hi")];
      expect(hi, name).toEqual(en);
      expect(Array.isArray(hi) ? hi.length : hi, name).toEqual(Array.isArray(en) ? 0 : null);
    }
  });

  it("shows the same records (same ids, same order) in preview", async () => {
    preview();
    for (const [name, call] of Object.entries(accessors)) {
      const [en, hi] = [await call("en"), await call("hi")];
      const ids = (v: unknown) =>
        Array.isArray(v) ? v.map((r: { id?: string; slug?: string }) => r.id ?? r.slug) : (v as { id?: string } | null)?.id;
      expect(ids(hi), name).toEqual(ids(en));
    }
  });
});

describe("centre search", () => {
  it("matches English and Hindi text in Hindi, English text only in English", async () => {
    preview();
    expect((await getCentres({ query: "mandi" }, "hi")).map((c) => c.slug)).toEqual(["kullu"]);
    expect((await getCentres({ query: "मंडी" }, "hi")).map((c) => c.slug)).toEqual(["kullu"]);
    expect((await getCentres({ query: "शिमला" }, "hi")).map((c) => c.slug)).toEqual(["shimla"]);
    expect(await getCentres({ query: "मंडी" })).toEqual([]);
    const [kullu] = await getCentres({ query: "mandi" }, "hi");
    expect(kullu.name).toMatch(DEVANAGARI);
  });
});

describe("helpers", () => {
  it("labels download categories without changing the category value", async () => {
    preview();
    expect(getDownloadCategoryLabel("Brochure")).toBe("Brochure");
    expect(getDownloadCategoryLabel("Brochure", "hi")).toMatch(DEVANAGARI);
    expect(getDownloadCategoryLabel("Unknown category", "hi")).toBe("Unknown category");
    for (const d of await getDownloads("hi")) {
      expect(hiOverlays.downloadCategories[d.category], d.category).toBeDefined();
    }
  });

  it("localises image alt text only", () => {
    const image = stockImages.studentsTakingNotes;
    expect(localizeImage(image)).toBe(image);
    const hi = localizeImage(image, "hi");
    expect(hi.alt).toMatch(DEVANAGARI);
    expect({ ...hi, alt: image.alt }).toEqual(image);
  });
});

describe("overlay integrity", () => {
  const tables = [
    ["programs", programs, hiOverlays.programs],
    ["centres", centres, hiOverlays.centres],
    ["results", results, hiOverlays.results],
    ["rankers", rankers, hiOverlays.rankers],
    ["testimonials", testimonials, hiOverlays.testimonials],
    ["stats", stats, hiOverlays.stats],
    ["faqs", faqs, hiOverlays.faqs],
    ["articles", articles, hiOverlays.articles],
    ["downloads", instituteProfile.downloads, hiOverlays.downloads],
  ] as const;

  it("has no orphan keys: every overlay id exists in the English content", () => {
    for (const [name, english, overlay] of tables) {
      const ids = new Set<string>(english.map((r) => r.id));
      expect(Object.keys(overlay).filter((id) => !ids.has(id)), name).toEqual([]);
    }
    const categories = new Set(instituteProfile.downloads.map((d) => d.category));
    expect(Object.keys(hiOverlays.downloadCategories).filter((c) => !categories.has(c))).toEqual([]);
    const srcs = new Set<string>(Object.values(stockImages).map((i) => i.src));
    expect(Object.keys(hiOverlays.imageAlt).filter((src) => !srcs.has(src))).toEqual([]);
    const hostelSlugs = new Set(hostelInfo.campuses.map((c) => c.centreSlug));
    expect(Object.keys(hiOverlays.hostelInfo.campuses ?? {}).filter((s) => !hostelSlugs.has(s))).toEqual([]);
    const deskSlugs = new Set(contactDetails.campusContacts.map((c) => c.centreSlug));
    expect(Object.keys(hiOverlays.contactDetails.campusContacts ?? {}).filter((s) => !deskSlugs.has(s))).toEqual([]);
  });

  it("only overlays fields the English record has, never protected keys, with English array lengths", () => {
    for (const [name, english, overlay] of tables) {
      const records = byId<{ id: string }>(english);
      for (const [id, entry] of Object.entries(overlay)) {
        expect(overlayMisfits(records.get(id), entry, `${name}.${id}`)).toEqual([]);
      }
    }
    const { campuses, ...hostelRest } = hiOverlays.hostelInfo;
    expect(overlayMisfits(hostelInfo, hostelRest, "hostelInfo")).toEqual([]);
    for (const [slug, entry] of Object.entries(campuses ?? {})) {
      const campus = hostelInfo.campuses.find((c) => c.centreSlug === slug);
      expect(overlayMisfits(campus, entry, `hostelInfo.campuses.${slug}`)).toEqual([]);
    }
    expect(overlayMisfits(instituteProfile, hiOverlays.instituteProfile, "instituteProfile")).toEqual([]);
    const { campusContacts, ...contactRest } = hiOverlays.contactDetails;
    expect(overlayMisfits(contactDetails, contactRest, "contactDetails")).toEqual([]);
    for (const [slug, entry] of Object.entries(campusContacts ?? {})) {
      const desk = contactDetails.campusContacts.find((c) => c.centreSlug === slug);
      expect(overlayMisfits(desk, entry, `contactDetails.campusContacts.${slug}`)).toEqual([]);
    }
  });

  it("covers every program, centre, FAQ, article, stat and download", () => {
    const covered = [
      ["programs", programs, hiOverlays.programs],
      ["centres", centres, hiOverlays.centres],
      ["faqs", faqs, hiOverlays.faqs],
      ["articles", articles, hiOverlays.articles],
      ["stats", stats, hiOverlays.stats],
      ["downloads", instituteProfile.downloads, hiOverlays.downloads],
    ] as const;
    for (const [name, english, overlay] of covered) {
      expect(english.map((r) => r.id).filter((id) => !(id in overlay)), name).toEqual([]);
    }
    const images = [...programs.map((p) => p.image), ...articles.map((a) => a.coverImage)];
    expect(images.filter((img) => img && !hiOverlays.imageAlt[img.src])).toEqual([]);
  });

  it("covers every hostel list item and campus, and every institute list item", () => {
    const hostel = hiOverlays.hostelInfo;
    expect(Object.keys(hostel.campuses ?? {}).sort()).toEqual(hostelInfo.campuses.map((c) => c.centreSlug).sort());
    for (const campus of hostelInfo.campuses) {
      expect(hostel.campuses?.[campus.centreSlug]?.blocks?.length, campus.centreSlug).toBe(campus.blocks.length);
    }
    const lists = [
      [hostel.charter, hostelInfo.charter],
      [hostel.features, hostelInfo.features],
      [hostel.girlsResidency?.features, hostelInfo.girlsResidency.features],
      [hostel.roomTypes, hostelInfo.roomTypes],
      [hostel.roomFeatures, hostelInfo.roomFeatures],
      [hostel.dailyRoutine, hostelInfo.dailyRoutine],
      [hostel.menuHighlights, hostelInfo.menuHighlights],
      [hiOverlays.instituteProfile.approach, instituteProfile.approach],
      [hiOverlays.instituteProfile.pedagogyPrinciples, instituteProfile.pedagogyPrinciples],
      [hiOverlays.instituteProfile.milestones, instituteProfile.milestones],
    ] as const;
    for (const [overlay, english] of lists) expect(overlay?.length).toBe(english.length);
  });
});
