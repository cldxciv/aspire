import type { Metadata } from "next";
import { CtaBand } from "@/components/about/CtaBand";
import { FillMediaSplit } from "@/components/about/FillMediaSplit";
import { PhotoPanel } from "@/components/about/PhotoPanel";
import { mixedResultCards } from "@/components/about/result-cards";
import { HeroAction, HeroFrame, NextBatchCard } from "@/components/hero";
import { layoutPreviewBanner } from "@/components/page-layout/preview-banner";
import { PageLayoutFrame, type LayoutSlots } from "@/components/page-layout/render";
import { ArticleCard } from "@/components/resources/ArticleCard";
import { DownloadList } from "@/components/resources/DownloadList";
import { formatIsoDate } from "@/components/resources/format";
import { ResourceCategories } from "@/components/resources/ResourceCategories";
import { ResultCardMarquee } from "@/components/results/ResultCardMarquee";
import { ButtonLink, EmptyState, Section, SectionHeading } from "@/components/ui";
import { stockImages } from "@/content/images";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { getArticles, getInstituteProfile, isPlaceholder, localizeImage } from "@/lib/data";
import { getPageLayout } from "@/lib/page-layout/loader";

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

/**
 * Resources. Hero (B · Himalayan editorial, 2026-10-22 hero redesign): ridge art, the headline
 * with a gold underline, the main action (read the articles; with no published article, the
 * downloads or else "ask a question") and, beside the articles, "see downloads" when there are
 * downloads. Beside it a white card with the newest visible article (title, category, date and a
 * link), DEMO-labelled while it is a placeholder; no article (production today), no card.
 * Page layout (docs/page-layout-plan.md): the sections after the hero follow the published layout
 * (`getPageLayout("resources")`, editable by a super admin; the closing band stays last, and the
 * downloads and articles that the hero links to can't be hidden). Each section is a slot; tones
 * alternate over the sections that render (PageLayoutFrame), so the default layout looks exactly
 * as before. Photo sides stay fixed.
 */
export default async function ResourcesPage() {
  const [locale, t, tc, layout] = await Promise.all([
    getLocale(),
    getMessages("resources"),
    getMessages("common"),
    getPageLayout("resources"),
  ]);
  const [articles, profile] = await Promise.all([getArticles(locale), getInstituteProfile(locale)]);
  // Downloads belong to the institute profile (placeholder until Aspire verifies it; null in production).
  const downloads = profile?.downloads ?? [];
  const hasDownloads = downloads.length > 0;
  const photoLabel = tc.labels.illustrativeStockPhoto;
  // getArticles() is newest first.
  const latest = articles[0];

  // D-031: one band of previous results (alternating JEE / NEET). In production there are no visible
  // cards and the band shows a labelled, non-nature stock photo instead.
  const resultsBand = await ResultCardMarquee({
    locale,
    cards: await mixedResultCards(locale, 16),
    fallbackImage: localizeImage(stockImages.graduateSilhouette, locale),
    fallbackImageLabel: photoLabel,
  });

  // One slot per section, rendered in layout order. The downloads slot is null exactly when the
  // section would render nothing (no published downloads), so it never takes a tone.
  const slots: LayoutSlots<"resources"> = {
    types: ({ tone }) => (
      <Section tone={tone} aria-labelledby="resource-types-heading">
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
    ),

    downloads:
      profile && hasDownloads
        ? ({ tone }) => (
            <Section tone={tone} id="downloads" aria-labelledby="downloads-heading" className="scroll-mt-24">
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
          )
        : null,

    articles: ({ tone }) => (
      <Section tone={tone} id="articles" aria-labelledby="articles-heading" className="scroll-mt-24">
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
    ),

    results: ({ tone }) => (
      <Section tone={tone} aria-labelledby="resources-results-heading">
        <SectionHeading
          id="resources-results-heading"
          eyebrow={t.results.eyebrow}
          title={t.results.title}
          description={t.results.description}
        />
        {resultsBand}
      </Section>
    ),

    cta: ({ tone }) => (
      <Section tone={tone} aria-labelledby="resources-cta-heading">
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
    ),
  };

  return (
    <PageLayoutFrame
      layout={layout}
      banner={await layoutPreviewBanner(layout)}
      hero={
        <HeroFrame
          art="ridges"
          layout="editorial"
          eyebrow={t.hero.eyebrow}
          eyebrowStyle="caps"
          title={t.hero.title}
          highlight={t.hero.highlight}
          highlightStyle="underline"
          lead={t.hero.lead}
          crumbs={[{ label: t.hero.crumb }]}
          homeLabel={tc.labels.home}
          homeHref={localePath("/", locale)}
          actions={
            // The main action leads to something real: the articles; else the downloads; else (no
            // published resources, production today) the same "ask a question" as the empty state.
            articles.length > 0 ? (
              <>
                <HeroAction href="#articles">{t.hero.articles}</HeroAction>
                {hasDownloads && (
                  <HeroAction href="#downloads" variant="secondary">
                    {t.categories.downloads.action}
                  </HeroAction>
                )}
              </>
            ) : hasDownloads ? (
              <HeroAction href="#downloads">{t.categories.downloads.action}</HeroAction>
            ) : (
              <HeroAction href={localePath("/contact", locale)}>{t.articles.emptyAction}</HeroAction>
            )
          }
          aside={
            latest && (
              <NextBatchCard
                eyebrow={t.latest.eyebrow}
                title={latest.title}
                rows={[
                  { label: t.latest.category, value: t.card.categories[latest.category] },
                  { label: t.latest.published, value: formatIsoDate(latest.publishedAt, t.card.months) },
                ]}
                action={{ label: t.latest.read, href: localePath(`/resources/${latest.slug}`, locale) }}
                demoLabel={tc.labels.demo}
                placeholder={isPlaceholder(latest)}
              />
            )
          }
          asideAlign="start"
        />
      }
      slots={slots}
    />
  );
}
