import type { Metadata } from "next";
import { CtaBand } from "@/components/about/CtaBand";
import { FillMediaSplit } from "@/components/about/FillMediaSplit";
import { PhotoPanel } from "@/components/about/PhotoPanel";
import { mixedResultCards } from "@/components/about/result-cards";
import { ArticleCard } from "@/components/resources/ArticleCard";
import { DownloadList } from "@/components/resources/DownloadList";
import { resourcesHeroSlides } from "@/components/resources/hero-slides";
import { ResourceCategories } from "@/components/resources/ResourceCategories";
import { ResultCardMarquee } from "@/components/results/ResultCardMarquee";
import { ButtonLink, EmptyState, PageHero, Section, SectionHeading } from "@/components/ui";
import { stockImages } from "@/content/images";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { getArticles, getInstituteProfile, isPlaceholder, localizeImage } from "@/lib/data";

/** Download cards shown before the "Show all" disclosure (one row of three). */
const DOWNLOADS_SHOWN = 3;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("resources");
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: await localeAlternates("/resources"),
  };
}

export default async function ResourcesPage() {
  const [locale, t, tc] = await Promise.all([getLocale(), getMessages("resources"), getMessages("common")]);
  const [articles, profile] = await Promise.all([getArticles(locale), getInstituteProfile(locale)]);
  // Downloads belong to the institute profile (placeholder until Aspire verifies it; null in production).
  const downloads = profile?.downloads ?? [];
  const hasDownloads = downloads.length > 0;
  const photoLabel = tc.labels.illustrativeStockPhoto;

  // D-031: one band of previous results (alternating JEE / NEET). In production there are no visible
  // cards and the band shows a labelled, non-nature stock photo instead.
  const resultsBand = await ResultCardMarquee({
    locale,
    cards: await mixedResultCards(locale, 16),
    fallbackImage: localizeImage(stockImages.graduateSilhouette, locale),
    fallbackImageLabel: photoLabel,
  });

  return (
    <>
      <PageHero
        title={t.hero.title}
        lead={t.hero.lead}
        crumbs={[{ label: t.hero.crumb }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        slides={resourcesHeroSlides(photoLabel, locale)}
        carouselLabels={tc.carousel}
      />

      <Section aria-labelledby="resource-types-heading">
        <FillMediaSplit image={localizeImage(stockImages.laptopStudy, locale)} imageSide="left" imageLabel={photoLabel}>
          <SectionHeading id="resource-types-heading" title={t.types.title} description={t.types.description} />
          <ResourceCategories
            articleCount={articles.length}
            downloadCount={downloads.length}
            messages={t.categories}
            locale={locale}
            columns={2}
          />
        </FillMediaSplit>
      </Section>

      {profile && hasDownloads && (
        <Section tone="surface" id="downloads" aria-labelledby="downloads-heading" className="scroll-mt-24">
          <PhotoPanel
            image={localizeImage(stockImages.libraryAisle, locale)}
            imageLabel={photoLabel}
            minHeight="lg"
            className="mb-8"
          >
            <SectionHeading
              id="downloads-heading"
              eyebrow={t.downloads.eyebrow}
              title={t.downloads.title}
              description={t.downloads.description}
              tone="dark"
              className="mb-0"
            />
          </PhotoPanel>
          <DownloadList
            downloads={downloads}
            locale={locale}
            labels={t.downloadCard}
            demoLabel={isPlaceholder(profile) ? tc.labels.demoPending : undefined}
            initialCount={DOWNLOADS_SHOWN}
            columns="3md"
            more={t.downloads}
          />
        </Section>
      )}

      <Section
        tone={hasDownloads ? "white" : "surface"}
        id="articles"
        aria-labelledby="articles-heading"
        className="scroll-mt-24"
      >
        <SectionHeading
          id="articles-heading"
          eyebrow={t.articles.eyebrow}
          title={t.articles.title}
          description={t.articles.description}
        />
        {articles.length > 0 ? (
          <ul
            className={cn(
              "grid gap-4 sm:grid-cols-2",
              articles.length > 2 && articles.length !== 4 && "lg:grid-cols-3",
            )}
          >
            {articles.map((article) => (
              <li key={article.id}>
                <ArticleCard
                  article={article}
                  locale={locale}
                  messages={t.card}
                  demoLabel={tc.labels.demoPending}
                  imageLabel={photoLabel}
                  wide={articles.length <= 2 || articles.length === 4}
                />
              </li>
            ))}
          </ul>
        ) : (
          <FillMediaSplit
            image={localizeImage(stockImages.studyThroughWindow, locale)}
            imageSide="right"
            imageLabel={photoLabel}
          >
            <EmptyState
              title={t.articles.emptyTitle}
              description={t.articles.emptyDescription}
              action={
                <ButtonLink href={localePath("/contact", locale)} variant="outline">
                  {t.articles.emptyAction}
                </ButtonLink>
              }
            />
          </FillMediaSplit>
        )}
      </Section>

      <Section tone={hasDownloads ? "surface" : "white"} aria-labelledby="resources-results-heading">
        <SectionHeading
          id="resources-results-heading"
          eyebrow={t.results.eyebrow}
          title={t.results.title}
          description={t.results.description}
        />
        {resultsBand}
      </Section>

      <Section tone={hasDownloads ? "white" : "surface"} aria-labelledby="resources-cta-heading">
        <CtaBand
          id="resources-cta-heading"
          title={t.cta.title}
          description={t.cta.description}
          primary={{ label: t.cta.enquire, href: localePath("/admissions#enquiry", locale) }}
          secondary={{ label: t.cta.contact, href: localePath("/contact", locale) }}
          image={localizeImage(stockImages.mentoringConversation, locale)}
          imageLabel={photoLabel}
        />
      </Section>
    </>
  );
}
