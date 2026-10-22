import { afterEach, describe, expect, it, vi } from "vitest";

import { messagesFor } from "@/i18n/messages";
import { getCentres, getContactDetails, getProgram, getPrograms, getResultCards } from "@/lib/data";
import type { Centre, Program } from "@/lib/types";
import {
  CENTRE_MAP_SIZE,
  HIMACHAL_OUTLINE_PATH,
  HP_DISTRICTS,
  districtName,
  districtPoint,
  findDistrict,
  isDistrict,
  projectLatLon,
} from "./districts";
import { centreForDistrict, centrePoint, defaultDistrictId, finderCentres, finderDistricts } from "./finder-data";
import { isFilled, splitHighlight } from "./hero-text";
import { defaultProgramSlug, pickerProgram, programHeroFacts } from "./program-picker-data";
import { cardsForYear, initialRibbonYear, pickRibbonCards, ribbonYears } from "./ribbon-data";

afterEach(() => {
  vi.unstubAllEnvs();
});

const preview = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
const production = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");

const district = (id: string) => {
  const found = HP_DISTRICTS.find((d) => d.id === id);
  if (!found) throw new Error(`no district ${id}`);
  return found;
};

describe("hero-text", () => {
  it("isFilled: only real values pass; owner-to-fill slots and blanks never do", () => {
    for (const value of ["13+", "Class XI", "2 Years", 35, 0]) expect(isFilled(value), String(value)).toBe(true);
    for (const value of [undefined, null, "", "   ", "[N]", "[N]+", "Since [YEAR]", "[Start date]", Number.NaN, Infinity]) {
      expect(isFilled(value), String(value)).toBe(false);
    }
  });

  it("splitHighlight finds the phrase or returns null (plain headline)", () => {
    expect(splitHighlight("Find your nearest Aspire centre", "Aspire centre")).toEqual(["Find your nearest ", "Aspire centre", ""]);
    expect(splitHighlight("अपना नज़दीकी ऐस्पायर केंद्र खोजें", "ऐस्पायर केंद्र")).toEqual(["अपना नज़दीकी ", "ऐस्पायर केंद्र", " खोजें"]);
    expect(splitHighlight("About Aspire", "Himachal")).toBeNull();
    expect(splitHighlight("About Aspire", "  ")).toBeNull();
    expect(splitHighlight("About Aspire")).toBeNull();
  });
});

describe("districts", () => {
  it("lists Himachal's 12 districts once each, with English and Hindi names", () => {
    expect(HP_DISTRICTS).toHaveLength(12);
    expect(new Set(HP_DISTRICTS.map((d) => d.id)).size).toBe(12);
    for (const d of HP_DISTRICTS) {
      expect(d.en.trim()).not.toBe("");
      expect(d.hi).toMatch(/[ऀ-ॿ]/);
      expect(districtName(d, "hi")).toBe(d.hi);
      expect(districtName(d, "en")).toBe(d.en);
    }
  });

  it("findDistrict matches English, Hindi, ids and common spellings", () => {
    expect(findDistrict("Mandi")?.id).toBe("mandi");
    expect(findDistrict("मंडी")?.id).toBe("mandi");
    expect(findDistrict("  kangra district ")?.id).toBe("kangra");
    expect(findDistrict("Lahaul")?.id).toBe("lahaul-spiti");
    expect(findDistrict("Lahaul & Spiti")?.id).toBe("lahaul-spiti");
    expect(findDistrict("Kulu")?.id).toBe("kullu");
    expect(findDistrict("Simla")?.id).toBe("shimla");
    expect(findDistrict("Dharamshala")).toBeNull();
    expect(findDistrict("")).toBeNull();
    expect(findDistrict(undefined)).toBeNull();
    expect(isDistrict("Sirmour", district("sirmaur"))).toBe(true);
    expect(isDistrict("Shimla", district("solan"))).toBe(false);
  });

  it("projects every headquarters and the outline inside the map's viewBox", () => {
    for (const d of HP_DISTRICTS) {
      const { x, y } = districtPoint(d);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(CENTRE_MAP_SIZE.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(CENTRE_MAP_SIZE.height);
    }
    expect(HIMACHAL_OUTLINE_PATH).toMatch(/^M[\d.]+ [\d.]+ (L[\d.]+ [\d.]+ )+Z$/);
    const coords = [...HIMACHAL_OUTLINE_PATH.matchAll(/([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(CENTRE_MAP_SIZE.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(CENTRE_MAP_SIZE.height);
    }
    // North is up, east is right.
    expect(projectLatLon(32, 77).y).toBeLessThan(projectLatLon(31, 77).y);
    expect(projectLatLon(31, 78).x).toBeGreaterThan(projectLatLon(31, 77).x);
  });
});

describe("district → centre mapping (centre finder)", () => {
  it("follows each centre's servesDistricts in the data for all 12 districts (preview)", async () => {
    preview();
    const centres = await getCentres();
    expect(centres.length).toBeGreaterThan(0);
    const mapped = Object.fromEntries(HP_DISTRICTS.map((d) => [d.id, centreForDistrict(d, centres)?.slug ?? null]));
    // Every district maps to a centre whose own data names it.
    for (const d of HP_DISTRICTS) {
      const centre = centres.find((c) => c.slug === mapped[d.id]);
      expect(centre, d.id).toBeDefined();
      const named = [...(centre?.servesDistricts ?? []), centre?.district ?? ""].some((name) => isDistrict(name, d));
      expect(named, `${d.id} → ${mapped[d.id]}`).toBe(true);
    }
    expect(mapped.mandi).toBe("kullu");
    expect(mapped["lahaul-spiti"]).toBe("kullu");
    expect(mapped.chamba).toBe("dharamshala");
    expect(mapped.una).toBe("hamirpur");
    expect(mapped.kinnaur).toBe("shimla");
  });

  it("the Hindi records map the same way", async () => {
    preview();
    const [en, hi] = await Promise.all([getCentres(), getCentres(undefined, "hi")]);
    for (const d of HP_DISTRICTS) expect(centreForDistrict(d, hi)?.slug).toBe(centreForDistrict(d, en)?.slug);
  });

  it("falls back to the centre in the district, then the closest one on the map; null without centres", () => {
    const base = { servesDistricts: undefined, latitude: undefined, longitude: undefined };
    const centres = [
      { slug: "a", district: "Shimla", ...base },
      { slug: "b", district: "Kangra", ...base },
    ];
    expect(centreForDistrict(district("kangra"), centres)?.slug).toBe("b");
    expect(centreForDistrict(district("chamba"), centres)?.slug).toBe("b"); // closest to Chamba
    expect(centreForDistrict(district("solan"), centres)?.slug).toBe("a"); // closest to Solan
    expect(centreForDistrict(district("mandi"), [])).toBeNull();
    // A centre with no position and no known district is never "closest".
    expect(centreForDistrict(district("mandi"), [{ slug: "x", district: "Nowhere", ...base }])).toBeNull();
  });

  it("centrePoint prefers coordinates, then the district headquarters", () => {
    expect(centrePoint({ district: "Mandi", latitude: 31.1, longitude: 77.17 })).toEqual(projectLatLon(31.1, 77.17));
    expect(centrePoint({ district: "Mandi" })).toEqual(districtPoint(district("mandi")));
    expect(centrePoint({ district: "Atlantis" })).toBeNull();
  });

  it("finderDistricts: all 12 in the page locale and alphabetical; none without centres", async () => {
    preview();
    const centres = await getCentres(undefined, "hi");
    const hi = finderDistricts(centres, "hi");
    expect(hi).toHaveLength(12);
    expect(hi.map((d) => d.name)).toEqual([...hi.map((d) => d.name)].sort((a, b) => a.localeCompare(b, "hi")));
    expect(hi.find((d) => d.id === "mandi")?.name).toBe("मंडी");
    expect(hi.every((d) => d.centreSlug !== null)).toBe(true);
    const en = finderDistricts(await getCentres(), "en");
    expect(en[0].name).toBe("Bilaspur");
    expect(finderDistricts([], "en")).toEqual([]);
  });

  it("defaultDistrictId: preferred district, else the head campus's, else the first with a centre", async () => {
    preview();
    const centres = finderCentres(await getCentres());
    const districts = finderDistricts(await getCentres(), "en");
    expect(defaultDistrictId(districts, centres, "Mandi")).toBe("mandi");
    expect(defaultDistrictId(districts, centres, "kangra")).toBe("kangra");
    expect(defaultDistrictId(districts, centres, "Atlantis")).toBe("shimla");
    expect(defaultDistrictId(districts, centres)).toBe("shimla");
    expect(defaultDistrictId(districts, centres.map((c) => ({ ...c, isHeadquarters: false })))).toBe("bilaspur");
    expect(defaultDistrictId([], [])).toBeUndefined();
  });

  it("is empty in production while the centre records are placeholders", async () => {
    production();
    const centres = await getCentres();
    expect(centres).toEqual([]);
    expect(finderDistricts(centres, "en")).toEqual([]);
    expect(finderCentres(centres)).toEqual([]);
  });
});

describe("finderCentres (honest view models)", () => {
  const centre: Centre = {
    id: "c1",
    slug: "test",
    name: "Test Valley Centre",
    district: "Kullu",
    programs: [],
    status: "placeholder",
  };

  it("omits what the record does not have", () => {
    const [view] = finderCentres([centre]);
    expect(view).toEqual({
      slug: "test",
      name: "Test Valley Centre",
      shortName: "Test",
      district: "Kullu",
      isHeadquarters: false,
      placeholder: true,
      point: districtPoint(district("kullu")),
    });
  });

  it("builds safe links only, and the page link and WhatsApp when given", () => {
    const [view] = finderCentres(
      [
        {
          ...centre,
          status: "published",
          isHeadquarters: true,
          address: " Main Road ",
          phone: "+91 98166 00000",
          directionsUrl: "https://maps.example.com/x",
        },
      ],
      {
        pageHref: (slug) => `/hi/centres/${slug}`,
        whatsapp: { url: "https://wa.me/919816600000?text=hi", display: "+91 98166 00000" },
        shortName: () => "Kullu",
      },
    );
    expect(view.address).toBe("Main Road");
    expect(view.phone).toEqual({ display: "+91 98166 00000", href: "tel:+919816600000" });
    expect(view.whatsappHref).toBe("https://wa.me/919816600000");
    expect(view.directionsHref).toBe("https://maps.example.com/x");
    expect(view.pageHref).toBe("/hi/centres/test");
    expect(view.shortName).toBe("Kullu");
    expect(view.isHeadquarters).toBe(true);
    expect(view.placeholder).toBe(false);

    const [unsafe] = finderCentres([{ ...centre, phone: "[Phone]", directionsUrl: "http://maps.example.com", address: "[Address]" }], {
      whatsapp: { url: "javascript:alert(1)", display: "call us" },
    });
    expect(unsafe.phone).toBeUndefined();
    expect(unsafe.directionsHref).toBeUndefined();
    expect(unsafe.address).toBeUndefined();
    expect(unsafe.whatsappHref).toBeUndefined();
  });

  it("uses the institute WhatsApp from the contact details in preview", async () => {
    preview();
    const contact = await getContactDetails();
    const views = finderCentres(await getCentres(), { whatsapp: contact?.whatsapp ?? null });
    expect(views).toHaveLength(4);
    expect(views.every((v) => v.whatsappHref?.startsWith("https://wa.me/"))).toBe(true);
    expect(views.every((v) => v.phone?.href.startsWith("tel:+91"))).toBe(true);
    expect(views.every((v) => v.placeholder)).toBe(true);
    expect(views.filter((v) => v.isHeadquarters).map((v) => v.slug)).toEqual(["shimla"]);
  });
});

describe("ribbon-data", () => {
  const card = (id: string, year: number, exam: string) => ({ id, year, exam });

  it("years newest first; cards of one year or all", () => {
    const cards = [card("a", 2024, "JEE"), card("b", 2026, "NEET"), card("c", 2026, "JEE"), card("d", 2025, "JEE")];
    expect(ribbonYears(cards)).toEqual([2026, 2025, 2024]);
    expect(cardsForYear(cards, 2026).map((c) => c.id)).toEqual(["b", "c"]);
    expect(cardsForYear(cards, "all")).toHaveLength(4);
    expect(cardsForYear(cards, 2020)).toEqual([]);
    expect(ribbonYears([])).toEqual([]);
  });

  it("initialRibbonYear: preferred year or all, else the newest year", () => {
    expect(initialRibbonYear([2026, 2025], 2025)).toBe(2025);
    expect(initialRibbonYear([2026, 2025], "all")).toBe("all");
    expect(initialRibbonYear([2026, 2025], 2019)).toBe(2026);
    expect(initialRibbonYear([2026, 2025])).toBe(2026);
    expect(initialRibbonYear([])).toBe("all");
  });

  it("pickRibbonCards: newest years, a few per year, exams alternating", () => {
    const cards = [
      card("j1", 2026, "JEE"),
      card("j2", 2026, "JEE"),
      card("j3", 2026, "JEE"),
      card("n1", 2026, "NEET"),
      card("n2", 2026, "NEET"),
      card("x1", 2025, "JEE"),
      card("y1", 2024, "NEET"),
      card("z1", 2023, "JEE"),
    ];
    expect(pickRibbonCards(cards, { perYear: 4, maxYears: 2 }).map((c) => c.id)).toEqual(["j1", "n1", "j2", "n2", "x1"]);
    expect(pickRibbonCards(cards).map((c) => c.year)).not.toContain(2023);
    expect(pickRibbonCards(cards, { maxYears: 0 })).toEqual([]);
    expect(pickRibbonCards([])).toEqual([]);
  });

  it("uses only consented result cards: real ones in preview, none in production (D-031)", async () => {
    preview();
    const all = await getResultCards(undefined, "hi");
    const picked = pickRibbonCards(all);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.length).toBeLessThanOrEqual(24);
    expect(new Set(picked.map((c) => c.id)).size).toBe(picked.length);
    expect(picked.every((c) => all.includes(c))).toBe(true);
    production();
    expect(pickRibbonCards(await getResultCards())).toEqual([]);
  });
});

describe("program-picker-data", () => {
  const en = messagesFor("en", "programs");
  const hi = messagesFor("hi", "programs");
  const options = (t: typeof en, slug: string) => ({
    href: `/programs/${slug}`,
    factLabels: t.card.facts,
    upTo: t.units.upTo,
    trackLabels: t.tracks,
  });

  it("builds facts only from fields the record has, and never a date, seats or fee", () => {
    const program: Program = {
      id: "p",
      slug: "p",
      title: "Test Program",
      exam: "JEE",
      shortDescription: "Short.",
      description: "Long.",
      targetAudience: "Class 11 students.",
      highlights: ["One", "", "Two", "Three", "Four"],
      feeDisplay: "₹1",
      status: "published",
      updatedAt: "2026-10-22",
    };
    const view = pickerProgram(program, options(en, "p"));
    expect(view.facts).toEqual([]);
    expect(view.chip).toBe("Test Program");
    expect(view.eyebrow).toBe(en.tracks.JEE);
    expect(view.summary).toBe("Short.");
    expect(view.highlights).toEqual(["One", "Two", "Three"]);
    expect(view.placeholder).toBe(false);
    expect(JSON.stringify(view)).not.toContain("₹");
    expect(pickerProgram(program, { ...options(en, "p"), summary: "audience" }).summary).toBe("Class 11 students.");
    expect(pickerProgram(program, { ...options(en, "p"), summary: "none" }).summary).toBeUndefined();
    expect(pickerProgram(program, { ...options(en, "p"), chip: "JEE" }).chip).toBe("JEE");
    expect(programHeroFacts({ classLevel: "[Class]", duration: "1 Year", batchSize: Number.NaN }, en.card.facts, en.units.upTo)).toEqual([
      { label: en.card.facts.duration, value: "1 Year" },
    ]);
  });

  it("real records (preview): class, duration and batch size as stated, in Hindi too", async () => {
    preview();
    const [program] = await getPrograms(undefined, "hi");
    const view = pickerProgram(program, options(hi, program.slug));
    expect(view.facts.map((f) => f.label)).toEqual([hi.card.facts.class, hi.card.facts.duration, hi.card.facts.batchSize]);
    expect(view.facts[2].value).toBe(hi.units.upTo.replace("{count}", String(program.batchSize)));
    expect(view.chip).toBe(program.classLevel);
    expect(view.eyebrow.split(" · ")).toEqual(["JEE", "NEET", "Integrated"].map((t) => hi.tracks[t as keyof typeof hi.tracks]));
    expect(view.placeholder).toBe(true);
    const single = await getProgram(program.slug, "hi");
    expect(single?.title).toBe(view.title);
  });

  it("defaultProgramSlug: preferred when listed, else the first", () => {
    const list = [{ slug: "a" }, { slug: "b" }];
    expect(defaultProgramSlug(list, "b")).toBe("b");
    expect(defaultProgramSlug(list, "z")).toBe("a");
    expect(defaultProgramSlug([])).toBeUndefined();
  });
});
