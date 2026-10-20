import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { CampusLifeTiles } from "@/components/home/CampusLifeTiles";
import { CentresShowcase } from "@/components/home/CentresShowcase";
import { CtaBand } from "@/components/home/CtaBand";
import { HOME_CTA_SLIDES, homeSlides } from "@/components/home/home-carousels";
import { HomeHero } from "@/components/home/HomeHero";
import { ImpactChart } from "@/components/home/ImpactChart";
import { ProgramPaths } from "@/components/home/ProgramPaths";
import { ResourcesTeaser } from "@/components/home/ResourcesTeaser";
import { ResultsShowcase } from "@/components/home/ResultsShowcase";
import { StatsBand } from "@/components/home/StatsBand";
import { pickHomeTestimonials, TestimonialsSection } from "@/components/home/TestimonialsSection";
import { WhyAspire } from "@/components/home/WhyAspire";
import { ResultCardMarquee } from "@/components/results/ResultCardMarquee";
import { interleaveCards, resultMosaicMedia } from "@/components/results/ResultMosaicMedia";
import type { SectionTone } from "@/components/ui";
import { format } from "@/i18n/format";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import {
  getArticles,
  getCentres,
  getContactDetails,
  getFeaturedResults,
  getHostelInfo,
  getInstituteProfile,
  getPrograms,
  getRankerYearCounts,
  getResultCards,
  getResults,
  getStats,
  getTestimonials,
  isPlaceholder,
} from "@/lib/data";
import { getEnquiryDeliveryStatus } from "@/lib/server/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("home");
  return {
    title: { absolute: t.meta.title },
    description: t.meta.description,
    alternates: await localeAlternates("/"),
  };
}

/**
 * Homepage showcase (docs/homepage-implementation-plan.md, D-021–D-026).
 * Every fact comes from a data accessor: imported placeholder records render only in
 * preview builds (DEMO-labelled) and each section falls back or disappears in production.
 * Localised (D-028): copy from the `home` / `forms` messages, records in the page's language;
 * caption and testimonial filters run on the English records (their patterns are English).
 * D-031: the only landscape is the hero's. The results, "why" and closing sections show Aspire's
 * previous result cards (three disjoint sets, newest JEE and NEET mixed); without visible cards
 * (production today) each falls back to labelled non-nature stock photos (the closing band to a
 * carousel). Programs and student life carry stock-photo carousels in both modes; no photo is used
 * twice on the page (home-carousels.ts).
 */
export default async function HomePage() {
  const [locale, t, tForms, common] = await Promise.all([
    getLocale(),
    getMessages("home"),
    getMessages("forms"),
    getMessages("common"),
  ]);
  const [stats, featured, programs, profile, centres, hostel, testimonials, yearCounts, articles, contact, jeeCards, neetCards] =
    await Promise.all([
      getStats(undefined, locale),
      getFeaturedResults(locale),
      getPrograms(undefined, locale),
      getInstituteProfile(locale),
      getCentres(undefined, locale),
      getHostelInfo(locale),
      getTestimonials(undefined, locale),
      getRankerYearCounts({ from: 2020, to: 2024 }),
      getArticles(locale),
      getContactDetails(locale),
      getResultCards({ exam: "JEE", limit: 16 }, locale),
      getResultCards({ exam: "NEET", limit: 16 }, locale),
    ]);
  // No card twice on the page: 8 beside the results intro, 8 in "why", the rest in the closing strip.
  const cards = interleaveCards(jeeCards, neetCards);
  const [resultsMedia, whyMedia, ctaStrip] = await Promise.all([
    resultMosaicMedia({ locale, cards: cards.slice(0, 8) }),
    resultMosaicMedia({ locale, cards: cards.slice(8, 16) }),
    cards.length > 16 ? ResultCardMarquee({ locale, cards: cards.slice(16), seeAllHref: null }) : null,
  ]);
  // English records for the English-language caption / claim filters (same as above for "en").
  const [centresEn, hostelEn, testimonialsEn] =
    locale === "en" ? [centres, hostel, testimonials] : await Promise.all([getCentres(), getHostelInfo(), getTestimonials()]);
  // Fall back to the newest visible results when none is marked as featured.
  const results = featured.length > 0 ? featured : (await getResults(undefined, locale)).slice(0, 4);
  const rankerStat = stats.find((stat) => stat.id === "stat-verified-rankers");

  // Same option rule as /admissions (D-016): visible campuses only; empty in production → field hidden.
  const centreOptions = centres.map((centre) => ({
    value: centre.slug,
    label: isPlaceholder(centre) ? format(tForms.shared.centreUnverified, { name: centre.name }) : centre.name,
  }));

  // White / surface alternate over the sections that actually render. Stats (blue band), centres
  // (navy split) and the photo CTA bring their own backgrounds and sit outside the rhythm.
  const toned: { key: string; show: boolean; render: (tone: SectionTone) => ReactNode }[] = [
    {
      key: "results",
      show: true,
      render: (tone) => <ResultsShowcase results={results} locale={locale} tone={tone} media={resultsMedia} />,
    },
    { key: "programs", show: true, render: (tone) => <ProgramPaths programs={programs} locale={locale} tone={tone} /> },
    {
      key: "why",
      show: true,
      render: (tone) => <WhyAspire profile={profile} locale={locale} tone={tone} media={whyMedia} />,
    },
  ];
  const tonedAfterCentres: typeof toned = [
    {
      key: "life",
      show: true,
      render: (tone) => (
        <CampusLifeTiles
          hostel={hostel}
          centres={centres}
          match={{ hostel: hostelEn, centres: centresEn }}
          locale={locale}
          tone={tone}
        />
      ),
    },
    {
      key: "voices",
      show: pickHomeTestimonials(testimonialsEn).length > 0,
      render: (tone) => (
        <TestimonialsSection testimonials={testimonials} match={testimonialsEn} locale={locale} tone={tone} />
      ),
    },
    {
      key: "impact",
      show: yearCounts.length > 0,
      render: (tone) => <ImpactChart counts={yearCounts} rankerStat={rankerStat} locale={locale} tone={tone} />,
    },
    {
      key: "resources",
      show: articles.length > 0,
      render: (tone) => <ResourcesTeaser articles={articles} locale={locale} tone={tone} />,
    },
  ];
  const renderSections = (sections: typeof toned, start: SectionTone) => {
    let next = start;
    return sections
      .filter((section) => section.show)
      .map((section) => {
        const tone = next;
        next = tone === "white" ? "surface" : "white";
        return <Fragment key={section.key}>{section.render(tone)}</Fragment>;
      });
  };

  return (
    <>
      <HomeHero centreOptions={centreOptions} deliveryStatus={getEnquiryDeliveryStatus()} locale={locale} />
      <StatsBand stats={stats} locale={locale} />
      {renderSections(toned, "white")}
      <CentresShowcase centres={centres} locale={locale} />
      {renderSections(tonedAfterCentres, "white")}
      <CtaBand
        variant="photo"
        headingId="home-cta-title"
        title={t.cta.title}
        description={t.cta.description}
        primary={{ label: t.cta.primary, href: "#home-enquiry" }}
        phone={contact?.phone ?? null}
        hours={contact?.hours}
        demo={contact ? isPlaceholder(contact) : false}
        strip={ctaStrip}
        slides={ctaStrip ? undefined : homeSlides(HOME_CTA_SLIDES, common.labels.illustrativeStockPhoto, locale)}
        carouselLabels={common.carousel}
        labels={{
          callUs: t.cta.callUs,
          demo: common.labels.demo,
          slogan: [t.cta.sloganDream, t.cta.sloganPrepare, t.cta.sloganAchieve],
          stockPhoto: common.labels.illustrativeStockPhoto,
        }}
      />
    </>
  );
}
