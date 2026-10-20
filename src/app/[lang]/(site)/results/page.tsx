import { BadgeCheck, FileSearch, ShieldCheck, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import { BleedSplit } from "@/components/home/BleedSplit";
import { CtaBleedSplit } from "@/components/home/CtaSplit";
import { archiveAwaiting, AwaitingRecordCard } from "@/components/results/AwaitingRecordCard";
import { RankersTable } from "@/components/results/RankersTable";
import { ResultStoryCard } from "@/components/results/ResultStoryCard";
import { ResultsArchive } from "@/components/results/ResultsArchive";
import { centreNameMap, distinctSources, toRankerRows, withPermittedName } from "@/components/results/server-view";
import {
  AspireImage,
  DemoBadge,
  Notice,
  PageHero,
  Section,
  SectionHeading,
  StickyMediaLayout,
} from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localePath } from "@/i18n/paths";
import {
  canShowStudentName,
  getCentres,
  getFeaturedResults,
  getRankers,
  getResults,
  getResultYears,
  isPlaceholder,
  localizeImage,
} from "@/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("results");
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: await localeAlternates("/results"),
  };
}

/** How entries reach the archive — mirrors the data contract (sourceReference, consentStatus, verification). */
const STANDARD_ICONS = { sourced: FileSearch, consent: UserCheck, verified: ShieldCheck, context: BadgeCheck } as const;

/**
 * Results (D-030 image-rich). Stories, the archive and the rankers list carry student names, so
 * the photos beside them are landscapes and objects only (sticky photo columns: library aisle,
 * books, pocket watch, maths notebook, Himalayan ridges, stethoscope) — never a person. The hero
 * (mountain trail), the methodology split (graduate silhouette, no face, no names) and the closing
 * CTA (notebook) are half-bleed photos. Every photo is labelled; none repeats on the page.
 */
export default async function ResultsPage() {
  const [locale, t, tPrograms, common] = await Promise.all([
    getLocale(),
    getMessages("results"),
    getMessages("programs"),
    getMessages("common"),
  ]);
  const [results, years, featured, rankers, centres] = await Promise.all([
    getResults(undefined, locale),
    getResultYears(),
    getFeaturedResults(locale),
    getRankers(undefined, locale),
    getCentres(undefined, locale),
  ]);

  const centreNames = centreNameMap(centres);
  // Names are stripped on the server wherever canShowStudentName() is false.
  const archive = results.map(withPermittedName);
  const rankerRows = toRankerRows(rankers);
  const rankerSources = distinctSources(rankers);
  const hasDemo = [...results, ...rankers].some(isPlaceholder);
  const stockLabel = common.labels.illustrativeStockPhoto;
  const cardMessages = { card: t.card, tracks: tPrograms.tracks, demo: common.labels.demo };

  // Alternate white / surface backgrounds over the sections actually rendered.
  const order = [
    featured.length > 0 && "stories",
    "archive",
    rankerRows.length > 0 && "rankers",
    "method",
    "cta",
  ].filter(Boolean);
  const tone = (key: string) => (order.indexOf(key) % 2 === 0 ? "white" : "surface");
  // Photo side alternates over the sections actually rendered.
  const side = (key: string) => (order.indexOf(key) % 2 === 0 ? "right" : "left");
  const photo = (image: (typeof stockImages)[keyof typeof stockImages]) => localizeImage(image, locale);

  const notice = hasDemo ? (
    <Notice variant="warning" title={t.notices.demoTitle}>
      {t.notices.demoBody}
    </Notice>
  ) : (
    <Notice title={t.notices.verifiedTitle}>{t.notices.verifiedBody}</Notice>
  );

  return (
    <>
      <PageHero
        title={t.hero.title}
        lead={t.hero.lead}
        crumbs={[{ label: t.crumb }]}
        homeLabel={common.labels.home}
        homeHref={localePath("/", locale)}
        image={photo(stockImages.mountainTrail)}
        imageLabel={stockLabel}
      />

      {featured.length > 0 && (
        <Section tone={tone("stories")} aria-labelledby="results-stories-title">
          {notice}
          <StickyMediaLayout
            className="mt-10"
            image={photo(stockImages.libraryAisle)}
            secondaryImage={photo(stockImages.booksAndNotebook)}
            imageLabel={stockLabel}
            imageSide={side("stories")}
          >
            <SectionHeading
              id="results-stories-title"
              eyebrow={t.stories.eyebrow}
              title={t.stories.title}
              description={t.stories.lead}
              action={
                // Decorative: 128px, below the asset's 190px maxWidth.
                <span className="hidden w-32 overflow-hidden rounded-card md:block">
                  <AspireImage asset={aspireAssets.trophySuccess} />
                </span>
              }
            />
            <ul className="grid gap-4">
              {featured.map((result) => (
                <li key={result.id}>
                  <ResultStoryCard
                    result={result}
                    showName={canShowStudentName(result)}
                    centreName={result.centreSlug ? centreNames[result.centreSlug] : undefined}
                    locale={locale}
                  />
                </li>
              ))}
            </ul>
          </StickyMediaLayout>
        </Section>
      )}

      <Section tone={tone("archive")} aria-labelledby="results-archive-title">
        {featured.length === 0 && <div className="mb-8">{notice}</div>}
        <StickyMediaLayout
          image={photo(stockImages.pocketWatchWorksheet)}
          secondaryImage={photo(stockImages.mathsNotebook)}
          imageLabel={stockLabel}
          imageSide={side("archive")}
        >
          <SectionHeading
            id="results-archive-title"
            title={t.archive.title}
            description={archive.length > 0 ? t.archive.leadWithRecords : t.archive.leadEmpty}
          />
          <ResultsArchive
            results={archive}
            years={years}
            centreNames={centreNames}
            messages={{ ...cardMessages, archive: t.archive }}
            listClassName="sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
          />
          {archive.length === 0 && (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {archiveAwaiting(t.awaiting).map((category) => (
                <li key={category.tag}>
                  <AwaitingRecordCard category={category} />
                </li>
              ))}
            </ul>
          )}
        </StickyMediaLayout>
      </Section>

      {rankerRows.length > 0 && (
        <Section tone={tone("rankers")} aria-labelledby="results-rankers-title">
          <StickyMediaLayout
            image={photo(stockImages.himalayaBlueRidge)}
            secondaryImage={photo(stockImages.stethoscopeTextbooks)}
            imageLabel={stockLabel}
            imageSide={side("rankers")}
          >
            <SectionHeading
              id="results-rankers-title"
              title={t.rankers.title}
              description={t.rankers.lead}
              action={
                <div className="flex items-center gap-3">
                  {/* Decorative laurel (white background, so only on white sections): 96px, under its maxWidth. */}
                  {tone("rankers") === "white" && (
                    <span className="hidden w-24 sm:block">
                      <AspireImage asset={aspireAssets.laurelWreath} />
                    </span>
                  )}
                  {rankerRows.some((row) => row.placeholder) && <DemoBadge label={common.labels.demoPending} />}
                </div>
              }
            />
            <RankersTable
              rows={rankerRows}
              sources={rankerSources}
              messages={{
                rankers: t.rankers,
                tracks: tPrograms.tracks,
                demo: common.labels.demo,
                nameWithheld: t.card.nameWithheld,
              }}
            />
          </StickyMediaLayout>
        </Section>
      )}

      <BleedSplit
        aria-labelledby="results-method-title"
        tone={tone("method")}
        image={photo(stockImages.graduateSilhouette)}
        imageSide={side("method")}
        imageLabel={stockLabel}
      >
        <SectionHeading
          id="results-method-title"
          eyebrow={t.method.eyebrow}
          title={t.method.title}
          description={t.method.lead}
        />
        <ul className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(STANDARD_ICONS) as (keyof typeof STANDARD_ICONS)[]).map((key) => {
            const Icon = STANDARD_ICONS[key];
            const standard = t.method.standards[key];
            return (
              <li key={key} className="rounded-card border border-line bg-white p-5 shadow-soft">
                <span className="grid size-10 place-items-center rounded-xl bg-blue-soft text-blue">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-3 font-bold text-navy">{standard.title}</h3>
                <p className="mt-1 text-sm text-muted">{standard.text}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 text-sm text-muted">{t.method.disclaimer}</p>
      </BleedSplit>

      <CtaBleedSplit
        tone={tone("cta")}
        imageSide={side("cta")}
        headingId="results-cta-title"
        title={t.cta.title}
        description={t.cta.body}
        primary={{ label: t.cta.primary, href: localePath("/admissions#enquiry", locale) }}
        secondary={{ label: t.cta.secondary, href: localePath("/programs", locale) }}
        image={photo(stockImages.notebookSolutions)}
        imageLabel={stockLabel}
      />
    </>
  );
}
