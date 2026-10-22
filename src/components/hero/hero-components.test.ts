import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageHero } from "@/components/ui/PageHero";
import { stockImages } from "@/content/images";
import { RESULT_CARD_PATH } from "@/content/results";
import enCommon from "@/i18n/messages/en/common";
import hiCommon from "@/i18n/messages/hi/common";
import { messagesFor } from "@/i18n/messages";
import { getCentres, getContactDetails, getPrograms, getResultCards, localizeImage } from "@/lib/data";
import type { Locale } from "@/i18n/config";
import { CentreFinder, type FinderLabels } from "./CentreFinder";
import { HeroAction } from "./HeroAction";
import { HeroCollage } from "./HeroCollage";
import { HeroCopy, HeroFrame, HeroPanel } from "./HeroFrame";
import { HeroProgramCard } from "./HeroProgramCard";
import { HeroFactsStrip, ProofStats } from "./HeroStats";
import { NextBatchCard } from "./NextBatchCard";
import { ProgramPicker, type PickerLabels } from "./ProgramPicker";
import { RanchoChip } from "./RanchoChip";
import { ResultsRibbon, type RibbonLabels } from "./ResultsRibbon";
import { defaultDistrictId, finderCentres, finderDistricts } from "./finder-data";
import { pickerProgram } from "./program-picker-data";
import { pickRibbonCards } from "./ribbon-data";

afterEach(() => {
  vi.unstubAllEnvs();
});

const preview = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
const production = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");

const render = (type: unknown, props: object) =>
  renderToStaticMarkup(createElement(type as never, props as never));
const count = (html: string, needle: string | RegExp) =>
  typeof needle === "string" ? html.split(needle).length - 1 : (html.match(new RegExp(needle, "g")) ?? []).length;
/** Visible text only (tags and attributes removed), so Tailwind's `text-[13px]` never looks like a "[…]" slot. */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
const expectNoSlots = (html: string) => expect(text(html)).not.toMatch(/\[[^\]]*\]/);

const ribbonLabels: Record<Locale, RibbonLabels> = {
  en: {
    listLabel: "Results from Aspire's previous batches",
    yearGroup: "Show results from",
    allYears: "All years",
    pause: "Pause the results",
    play: "Play the results",
    previous: "Previous results",
    next: "Next results",
    position: "{current} of {total}",
    hint: "A new card every 5 seconds",
    demo: enCommon.labels.demo,
  },
  hi: {
    listLabel: "Aspire के पिछले बैचों के परिणाम",
    yearGroup: "किस साल के परिणाम देखें",
    allYears: "सभी साल",
    pause: "परिणाम रोकें",
    play: "परिणाम चलाएँ",
    previous: "पिछले परिणाम",
    next: "अगले परिणाम",
    position: "{total} में से {current}",
    hint: "हर 5 सेकंड में नया कार्ड",
    demo: hiCommon.labels.demo,
  },
};

const pickerLabels: Record<Locale, PickerLabels> = {
  en: { group: "Choose a program", seeProgram: "See the full program", selected: "Showing {title}", demo: enCommon.labels.demo },
  hi: { group: "प्रोग्राम चुनें", seeProgram: "पूरा प्रोग्राम देखें", selected: "दिखाया जा रहा है: {title}", demo: hiCommon.labels.demo },
};

const finderLabels: Record<Locale, FinderLabels> = {
  en: {
    district: "Your district",
    centreFor: "Aspire centre for {district}",
    mapLabel: "Illustrative map of Aspire's {count} centres in Himachal Pradesh: {names}",
    mapNote: "Illustrative map, not to scale",
    headCampus: "Head campus",
    page: "View centre",
    call: "Call",
    whatsapp: "WhatsApp",
    directions: "Directions",
    opensInNewTab: enCommon.labels.opensInNewTab,
    demo: enCommon.labels.demo,
    listTitle: "Our centres",
  },
  hi: {
    district: "आपका ज़िला",
    centreFor: "{district} के लिए Aspire केंद्र",
    mapLabel: "हिमाचल प्रदेश में Aspire के {count} केंद्रों का सांकेतिक नक्शा: {names}",
    mapNote: "सांकेतिक नक्शा, पैमाने के अनुसार नहीं",
    headCampus: "मुख्य कैंपस",
    page: "केंद्र देखें",
    call: "कॉल करें",
    whatsapp: "व्हाट्सऐप",
    directions: "रास्ता देखें",
    opensInNewTab: hiCommon.labels.opensInNewTab,
    demo: hiCommon.labels.demo,
    listTitle: "हमारे केंद्र",
  },
};

describe("HeroFrame / HeroCopy / HeroPanel", () => {
  it("renders the navy panel, breadcrumb, pill eyebrow, gold phrase, lead, actions, stats and aside (en)", () => {
    const html = render(HeroFrame, {
      title: "Coaching built by IITians, right here in Himachal",
      highlight: "Himachal",
      eyebrow: "An initiative by IITians",
      lead: "JEE, NEET and Foundation programs.",
      crumbs: [{ label: "About" }],
      // Hook-free server components: called directly (typed `children` without the no-children-prop lint).
      actions: HeroAction({ href: "/admissions", children: "Book a free counselling call" }),
      below: createElement(ProofStats, { stats: [{ value: "13+", label: "Years" }], label: "Aspire in numbers", demoLabel: "Demo" }),
      aside: createElement("p", null, "ASIDE"),
    });
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain('data-surface="dark"');
    expect(html).toContain('data-hero="rich"');
    expect(html).toContain("rounded-b-2xl");
    expect(html).toContain('<nav aria-label="Breadcrumb"');
    expect(html).toContain('<span aria-current="page">About</span>');
    expect(html).toMatch(/<h1[^>]*>Coaching built by IITians, right here in <span class="text-gold">Himachal<\/span><\/h1>/);
    expect(html).toContain("bg-gold-soft");
    expect(html).toContain(">An initiative by IITians</p>");
    expect(html).toContain('href="/admissions"');
    expect(html).toContain("min-h-12");
    expect(html).toContain('aria-label="Aspire in numbers"');
    expect(html).toContain("ASIDE");
    expect(html).toContain("lg:grid-cols-2");
    expect(html).not.toContain("data-hero-art");
  });

  it("B: ridge art (aria-hidden), gold capitals eyebrow, underlined phrase that follows wrapping (hi)", () => {
    const html = render(HeroFrame, {
      title: "कक्षा 8 से IIT और AIIMS तक, एक साफ़ रास्ता",
      highlight: "एक साफ़ रास्ता",
      highlightStyle: "underline",
      eyebrow: "JEE · NEET · फ़ाउंडेशन",
      eyebrowStyle: "caps",
      art: "ridges",
      layout: "editorial",
      crumbs: [{ label: "प्रोग्राम" }],
      homeLabel: "होम",
      homeHref: "/hi",
      aside: createElement("p", null, "CARD"),
    });
    expect(html).toContain(`<nav aria-label="${hiCommon.labels.breadcrumb}"`);
    expect(html).toContain('href="/hi"');
    expect(html).toMatch(/<div aria-hidden="true" data-hero-art="ridges"/);
    expect(html).toContain('preserveAspectRatio="none"');
    expect(html).toContain("tracking-[0.16em] text-gold uppercase");
    expect(html).toContain("box-decoration-break:clone");
    expect(html).toContain("background-image:url(&quot;data:image/svg+xml,");
    expect(html).toContain(">एक साफ़ रास्ता</span>");
    expect(html).toContain("supports-[width:1cqi]:text-[clamp(2.125rem,10cqi,3.625rem)]"); // xl headline with the art
    expect(html).toContain("@container");
    expect(html).toContain("lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]");
    expect(html).toContain("pb-32"); // room for the art on phones
  });

  it("a phrase missing from the title renders a plain headline; no aside keeps a readable width; no empty eyebrow", () => {
    const html = render(HeroFrame, { title: "Hostels", highlight: "Residences", eyebrow: "  ", footer: createElement("p", null, "FOOT") });
    expect(html).toMatch(/<h1[^>]*>Hostels<\/h1>/);
    expect(html).toContain('class="max-w-3xl"');
    expect(html).not.toContain("bg-gold-soft");
    expect(html).toContain("FOOT");
  });

  it("HeroPanel + HeroCopy compose for islands", () => {
    const html = render(HeroPanel, { art: "ridges", children: createElement(HeroCopy, { title: "Programs" }) });
    expect(html).toContain("data-hero-art");
    expect(count(html, "<h1")).toBe(1);
  });
});

describe("PageHero variants", () => {
  it("quiet (default) is today's hero; rich delegates to HeroFrame", () => {
    const quiet = render(PageHero, { title: "Privacy", crumbs: [{ label: "Privacy" }] });
    expect(quiet).toContain("bg-linear-to-r from-navy to-navy-2");
    expect(quiet).toContain('<nav aria-label="Breadcrumb" class="mb-3 text-xs text-[#b9d3f3]">');
    expect(quiet).not.toContain("data-hero");
    const rich = render(PageHero, { variant: "rich", title: "Hostels", art: "ridges", crumbs: [{ label: "Hostels" }] });
    expect(rich).toContain('data-hero="rich"');
    expect(rich).toContain("data-hero-art");
    expect(rich).not.toContain('variant="rich"');
  });
});

describe("ProofStats / HeroFactsStrip", () => {
  it("shows only figures that exist, with DEMO badges; nothing when none exists", () => {
    const html = render(ProofStats, {
      stats: [
        { value: "[N]+", label: "Selections" },
        { value: "4", label: "Centres", placeholder: true },
        { value: null, label: "Years" },
        { value: "13+", label: "Years in Himachal" },
      ],
      label: "Aspire in numbers",
      demoLabel: "Demo",
    });
    expect(count(html, /<li[ >]/)).toBe(2);
    expect(html).toContain("grid-cols-2");
    expect(count(html, ">Demo<")).toBe(1);
    expectNoSlots(html);
    expect(render(ProofStats, { stats: [{ value: "[N]", label: "x" }], label: "x", demoLabel: "Demo" })).toBe("");
  });

  it("Hindi stats from the data (preview), each placeholder figure with its DEMO badge", async () => {
    preview();
    const { getStats } = await import("@/lib/data");
    const stats = (await getStats("headline", "hi")).map((s) => ({ value: s.value, label: s.label, placeholder: s.status === "placeholder" }));
    const html = render(ProofStats, { stats, label: "Aspire आँकड़ों में", demoLabel: hiCommon.labels.demo });
    expect(html).toMatch(/^<ul aria-label="Aspire आँकड़ों में"/);
    expect(count(html, /<li[ >]/)).toBe(3);
    expect(count(html, `>${hiCommon.labels.demo}<`)).toBe(3);
    expect(text(html)).toContain(stats[0].label);
    production();
    const none = (await getStats("headline", "hi")).map((s) => ({ value: s.value, label: s.label }));
    expect(render(ProofStats, { stats: none, label: "x", demoLabel: "Demo" })).toBe("");
  });

  it("facts strip: a labelled <dl>, missing facts disappear", () => {
    const html = render(HeroFactsStrip, {
      facts: [
        { label: "कक्षा", value: "कक्षा XI" },
        { label: "अवधि", value: undefined },
        { label: "अगला बैच", value: "[Start date]" },
        { label: "बैच का आकार", value: "35 तक" },
      ],
      label: "प्रोग्राम",
    });
    expect(html).toMatch(/^<dl aria-label="प्रोग्राम"/);
    expect(count(html, "<dt")).toBe(2);
    expect(html).toContain("<dt");
    expectNoSlots(html);
    expect(render(HeroFactsStrip, { facts: [] })).toBe("");
  });
});

describe("NextBatchCard", () => {
  it("renders rows only for facts that exist, never a slot, with its calls to action", () => {
    const html = render(NextBatchCard, {
      eyebrow: "Next batch",
      title: "[Start date]",
      rows: [
        { label: "Centres", value: "Shimla · Hamirpur", placeholder: true },
        { label: "Seats left", value: "[N]" },
        { label: "Scholarship test", value: undefined },
      ],
      action: { label: "Reserve a seat", href: "/admissions#enquiry" },
      secondary: { label: "Talk to a counsellor", href: "/contact" },
      demoLabel: "Demo",
    });
    expect(html).toContain('data-surface="light"');
    expect(count(html, "<dt")).toBe(1);
    expect(html).toContain(">Demo<");
    expect(html).toContain('href="/admissions#enquiry"');
    expect(html).toContain('href="/contact"');
    expect(html).not.toContain("font-serif");
    expectNoSlots(html);
  });

  it("Hindi, no facts at all: the eyebrow and the action only", () => {
    const html = render(NextBatchCard, { eyebrow: "अगला बैच", action: { label: "काउंसलिंग बुक करें", href: "/hi/admissions" } });
    expect(html).toContain("अगला बैच");
    expect(html).not.toContain("<dl");
    expect(html).not.toContain(">डेमो<");
  });
});

describe("HeroCollage + RanchoChip", () => {
  const photos = (locale: Locale) => [
    { image: localizeImage(stockImages.studentsTakingNotes, locale), label: locale === "hi" ? hiCommon.labels.illustrativeStockPhoto : "Illustrative stock photo" },
    { image: localizeImage(stockImages.notebookSolutions, locale), label: locale === "hi" ? hiCommon.labels.illustrativeStockPhoto : "Illustrative stock photo" },
  ];

  it("labelled photos, the main one preloaded; a real result card only when passed (preview)", async () => {
    preview();
    const [card] = await getResultCards({ limit: 1 }, "hi");
    const html = render(HeroCollage, {
      photos: photos("hi"),
      result: card,
      resultBadge: "Aspire का परिणाम",
      demoLabel: hiCommon.labels.demo,
      chip: createElement(RanchoChip, { href: "/hi/tools/ask", title: "किसी डाउट में अटके हैं?", action: "Rancho से पूछें" }),
    });
    expect(count(html, hiCommon.labels.illustrativeStockPhoto)).toBe(2);
    expect(count(html, /<img /)).toBe(3);
    expect(html).toMatch(/fetchPriority="high"/i);
    expect(html).toContain(`src="${RESULT_CARD_PATH}`);
    expect(html).toContain(card.name);
    expect(html).toContain(">Aspire का परिणाम<");
    expect(html).toContain(`>${hiCommon.labels.demo}<`);
    expect(html).toContain('href="/hi/tools/ask"');
    expect(html).toContain('data-rancho="head"');
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-rancho="head"/);
  });

  it("production: no result card exists, so none renders; nothing at all without content", async () => {
    production();
    const cards = await getResultCards({ limit: 1 });
    expect(cards).toEqual([]);
    const html = render(HeroCollage, { photos: photos("en"), result: cards[0], resultBadge: "Aspire result", demoLabel: "Demo" });
    expect(html).not.toContain(RESULT_CARD_PATH);
    expect(html).not.toContain("Aspire result");
    expect(render(HeroCollage, { photos: [], resultBadge: "x", demoLabel: "Demo" })).toBe("");
  });
});

describe("HeroProgramCard", () => {
  it("title, summary, highlights with decorative checks, DEMO, calls to action", () => {
    const html = render(HeroProgramCard, {
      program: { eyebrow: "JEE · NEET", title: "Test", summary: "Short.", highlights: ["One", "Two"], placeholder: true },
      action: { label: "See the full program", href: "/programs/test" },
      demoLabel: "Demo",
    });
    expect(count(html, /<li[ >]/)).toBe(2);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*><svg/);
    expect(html).toContain(">Demo<");
    expect(html).toContain('href="/programs/test"');
    const hi = render(HeroProgramCard, {
      program: { eyebrow: "JEE · NEET", title: "परीक्षण", highlights: [], placeholder: false },
      demoLabel: hiCommon.labels.demo,
    });
    expect(hi).toContain(">परीक्षण<");
    expect(hi).not.toContain("<ul");
    expect(hi).not.toContain("<a ");
    expect(hi).not.toContain(hiCommon.labels.demo);
  });
});

describe("ResultsRibbon (client island, server render)", () => {
  it.each(["en", "hi"] as const)("%s: newest year's cards, pressed year pill, labelled region, no controls before hydration", async (locale) => {
    preview();
    const cards = pickRibbonCards(await getResultCards(undefined, locale));
    const newest = Math.max(...cards.map((c) => c.year));
    const html = render(ResultsRibbon, { cards, labels: ribbonLabels[locale] });
    const t = ribbonLabels[locale];
    expect(html).toContain(`role="group" aria-label="${t.yearGroup.replace(/'/g, "&#x27;")}"`);
    expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*>${newest}<`));
    expect(html).toContain(`>${t.allYears}<`);
    expect(html).toContain("noscript:hidden");
    expect(html).toContain(`role="region" aria-label="${t.listLabel.replace(/'/g, "&#x27;")}" tabindex="0"`);
    expect(count(html, /<li[ >]/)).toBe(cards.filter((c) => c.year === newest).length);
    expect(html).toContain(`src="${RESULT_CARD_PATH}`);
    expect(html).toContain(">" + t.demo + "<");
    // Nothing moves or can be pressed before hydration (no dead Pause button).
    expect(html).not.toContain("data-carousel-toggle");
    expect(html).not.toContain(`aria-label="${t.pause}"`);
    expect(html).toContain(t.hint ?? "");
    // The floating Ask Rancho button steps aside over the controls row (it covered Previous / Next at 1280 x 900).
    expect(html).toContain('<div data-rancho-avoid="" class="order-last');
  });

  it("renders nothing without cards (production)", async () => {
    production();
    const cards = pickRibbonCards(await getResultCards());
    expect(render(ResultsRibbon, { cards, labels: ribbonLabels.en })).toBe("");
  });

  it("honours defaultYear 'all'", async () => {
    preview();
    const cards = pickRibbonCards(await getResultCards());
    const html = render(ResultsRibbon, { cards, labels: ribbonLabels.en, defaultYear: "all" });
    expect(count(html, /<li[ >]/)).toBe(cards.length);
    expect(html).toMatch(/aria-pressed="true"[^>]*>All years</);
  });
});

describe("ProgramPicker (client island, server render)", () => {
  const views = async (locale: Locale) => {
    const t = messagesFor(locale, "programs");
    return (await getPrograms(undefined, locale)).map((p) =>
      pickerProgram(p, {
        href: locale === "hi" ? `/hi/programs/${p.slug}` : `/programs/${p.slug}`,
        factLabels: t.card.facts,
        upTo: t.units.upTo,
        trackLabels: t.tracks,
      }),
    );
  };

  it.each(["en", "hi"] as const)("%s: default program selected, its facts and card in the HTML, no-JS links", async (locale) => {
    preview();
    const programs = await views(locale);
    const t = pickerLabels[locale];
    const second = programs[1];
    const html = render(ProgramPicker, {
      copy: createElement(HeroCopy, { title: "Programs" }),
      programs,
      defaultSlug: second.slug,
      labels: t,
      secondary: { label: "Book counselling", href: "/admissions#enquiry" },
    });
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain(`role="group" aria-label="${t.group}"`);
    expect(count(html, "aria-pressed=")).toBe(programs.length);
    expect(count(html, 'aria-pressed="true"')).toBe(1);
    expect(html).toContain("min-h-11"); // 44 px chips
    expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*><span class="truncate">${second.chip}</span>`));
    expect(html).toContain(second.title);
    expect(html).toContain(`href="${second.href}"`);
    expect(html).toContain(`>${t.seeProgram}<`);
    expect(count(html, "<dt")).toBe(second.facts.length);
    expect(html).toContain("hidden list-none flex-wrap gap-2.5 p-0 noscript:flex");
    for (const p of programs) expect(html).toContain(`href="${p.href}"`);
    expect(html).toContain(">" + t.demo + "<");
    expectNoSlots(html);
  });

  it("no programs (production): the copy, and the fallback beside it", async () => {
    production();
    const programs = await views("en");
    expect(programs).toEqual([]);
    const html = render(ProgramPicker, {
      copy: createElement(HeroCopy, { title: "Programs" }),
      programs,
      labels: pickerLabels.en,
      fallback: createElement("p", null, "FALLBACK"),
    });
    expect(html).toContain("FALLBACK");
    expect(html).not.toContain("aria-pressed");
  });
});

describe("CentreFinder (client island, server render)", () => {
  const data = async (locale: Locale) => {
    const centres = await getCentres(undefined, locale);
    const contact = await getContactDetails(locale);
    return {
      centres: finderCentres(centres, {
        pageHref: (slug) => (locale === "hi" ? `/hi/centres/${slug}` : `/centres/${slug}`),
        whatsapp: contact?.whatsapp ?? null,
      }),
      districts: finderDistricts(centres, locale),
    };
  };

  it.each(["en", "hi"] as const)("%s: labelled select of 12 districts, default district's centre card and map", async (locale) => {
    preview();
    const { centres, districts } = await data(locale);
    const t = finderLabels[locale];
    const html = render(CentreFinder, {
      copy: createElement(HeroCopy, { title: "Find your nearest Aspire centre", highlight: "Aspire centre" }),
      centres,
      districts,
      defaultDistrict: locale === "hi" ? "मंडी" : defaultDistrictId(districts, centres, "Mandi"),
      labels: t,
    });
    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>[^<]+<\/label><select id="\1"/);
    expect(count(html, "<option")).toBe(12);
    expect(html).toMatch(/<option value="mandi" selected="">/);
    const mandi = districts.find((d) => d.id === "mandi");
    expect(html).toContain(t.centreFor.replace("{district}", mandi?.name ?? "?"));
    const kullu = centres.find((c) => c.slug === "kullu");
    expect(html).toContain(`href="${kullu?.pageHref}"`);
    expect(html).toContain(`href="${kullu?.phone?.href}"`);
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="[^"]*4[^"]*"/);
    expect(count(html, "data-pin=")).toBe(4);
    expect(html).toMatch(/data-pin="kullu" data-selected="true"/);
    expect(html).toContain(t.mapNote);
    expect(html).toContain("hidden noscript:block");
    expect(html).toContain(">" + t.demo + "<");
    expect(html).toContain(">" + t.headCampus + "<");
    expectNoSlots(html);
  });

  it("Contact: call / WhatsApp actions (new tab announced), no directions without a link in the data", async () => {
    preview();
    const { centres, districts } = await data("en");
    const html = render(CentreFinder, {
      copy: createElement(HeroCopy, { title: "Contact" }),
      centres,
      districts,
      labels: finderLabels.en,
      actions: ["call", "whatsapp", "directions"],
    });
    expect(html).toMatch(/<option value="shimla" selected="">/);
    expect(html).toContain('href="tel:+91');
    expect(html).toContain('href="https://wa.me/');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("(opens in a new tab)");
    expect(html).not.toContain(">Directions<");
    expect(html).not.toContain("View centre");
  });

  it("no centres (production): the copy alone, no select, no map", async () => {
    production();
    const { centres, districts } = await data("en");
    const html = render(CentreFinder, {
      copy: createElement(HeroCopy, { title: "Centres" }),
      centres,
      districts,
      labels: finderLabels.en,
    });
    expect(count(html, "<h1")).toBe(1);
    expect(html).not.toContain("<select");
    expect(html).not.toContain('role="img"');
  });
});
