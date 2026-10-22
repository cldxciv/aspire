import { ArrowRight, BadgeCheck, FileSearch, ShieldCheck, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import {
  HeroAction,
  HeroCollage,
  HeroFrame,
  pickRibbonCards,
  ResultsRibbon,
  ribbonYears,
  type RibbonLabels,
} from "@/components/hero";
import { BleedSplit } from "@/components/home/BleedSplit";
import { CtaBleedSplit } from "@/components/home/CtaSplit";
import { layoutPreviewBanner } from "@/components/page-layout/preview-banner";
import { PageLayoutFrame, type LayoutSlots } from "@/components/page-layout/render";
import { archiveAwaiting, AwaitingRecordCard } from "@/components/results/AwaitingRecordCard";
import { RankersTable } from "@/components/results/RankersTable";
import { resultMosaicMedia } from "@/components/results/ResultMosaicMedia";
import { ResultStoryCard } from "@/components/results/ResultStoryCard";
import { ResultsArchive } from "@/components/results/ResultsArchive";
import { centreNameMap, distinctSources, toRankerRows, withPermittedName } from "@/components/results/server-view";
import { StickyResultsLayout } from "@/components/results/StickyResultsLayout";
import {
  AspireImage,
  DemoBadge,
  Notice,
  Section,
  SectionHeading,
  StickyMediaLayout,
} from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import { format } from "@/i18n/format";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localePath } from "@/i18n/paths";
import {
  canShowStudentName,
  getCentres,
  getFeaturedResults,
  getRankers,
  getRankerYearCounts,
  getResultCards,
  getResults,
  getResultYears,
  isPlaceholder,
  localizeImage,
  type RankerYearCount,
} from "@/lib/data";
import { getPageLayout } from "@/lib/page-layout/loader";

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

type HeroCounts = { both: string; one: string; single: string };

/**
 * The hero's count sentence for one year of the rankers list (getRankerYearCounts(): list
 * entries, not ranks), or null when that year has no entries. Only the exams with entries are
 * named; nothing is estimated.
 */
function countsSentence(row: RankerYearCount | undefined, t: HeroCounts): string | null {
  if (!row) return null;
  const { year, jee, neet } = row;
  if (jee > 0 && neet > 0) return format(t.both, { year, jee, neet });
  const [exam, count] = jee > 0 ? (["JEE", jee] as const) : (["NEET", neet] as const);
  if (count <= 0) return null;
  return count === 1 ? format(t.single, { year, exam }) : format(t.one, { year, exam, count });
}

/**
 * The section that carries the page's demo / verified notice (D9): whichever of the student stories
 * and the archive renders first. The archive can never be hidden, so there is always a host.
 */
function noticeHost(rendered: readonly string[]): string | undefined {
  return rendered.find((key) => key === "stories" || key === "archive");
}

/**
 * Results (D-030 image-rich, D-031 result cards, 2026-10-22 hero C · results ribbon).
 *
 * Hero: the gold-phrase headline (true in both modes: it makes no claim about who the unverified
 * DEMO entries are), the newest year's count of rankers-list entries (DEMO-labelled while
 * placeholder) and one call to action; under it the `ResultsRibbon` client island: year pills over
 * the newest years' result cards, one card every 5 s with a visible Pause. Its cards come only
 * from getResultCards() (consent rule built in), so in production builds (placeholder content
 * off) the ribbon and the count are absent and the hero shows the labelled graduate-silhouette
 * photo instead. The live demo site (placeholder content on) shows the ribbon. The ribbon
 * replaces the moving strip that used to follow the hero.
 *
 * Below: the rankers list beside exam-filtered mosaics (JEE, then NEET on tall screens). No card
 * appears twice (the ribbon's cards, every year, are kept out of the mosaics). Stories, the
 * archive and the rankers list carry student names, so every stock photo here shows objects only
 * (never a stock person, never a landscape): hero fallback (graduate silhouette, no face), sticky
 * columns (library aisle, books, pocket watch, maths notebook), methodology (a form being signed),
 * CTA (notebook). Without visible result cards the rankers mosaics fall back to photos (physics
 * whiteboard, stethoscope). Every photo is labelled; none repeats on the page.
 *
 * Page layout (docs/page-layout-plan.md §12.3): the sections after the hero follow the published
 * layout (`getPageLayout("results")`, editable by a super admin; the archive can move but never
 * hide, the closing CTA stays last). Background tones and photo sides come from position (white /
 * surface, right / left alternate over the sections that render, D8); the demo / verified notice
 * sits in the first of stories / archive (D9); the laurel shows only on a white rankers section.
 */
export default async function ResultsPage() {
  const [locale, t, tPrograms, common, layout] = await Promise.all([
    getLocale(),
    getMessages("results"),
    getMessages("programs"),
    getMessages("common"),
    getPageLayout("results"),
  ]);
  const [results, years, featured, rankers, centres, cards, yearCounts] = await Promise.all([
    getResults(undefined, locale),
    getResultYears(),
    getFeaturedResults(locale),
    getRankers(undefined, locale),
    getCentres(undefined, locale),
    getResultCards(undefined, locale),
    getRankerYearCounts(),
  ]);
  // D-031 result cards (none in production): the newest years in the hero ribbon, the next JEE /
  // NEET ones beside the rankers list. Every ribbon card stays out of the mosaics (any year pill
  // can show it). This page is /results, so no "See all results" tile or link.
  // The ribbon prints each card's name, college and exam beside its image, so there the image is
  // decorative (alt="", like ResultCardTile `decorative`): screen readers hear each card once.
  const ribbonCards = pickRibbonCards(cards).map((card) => ({ ...card, photo: { ...card.photo, alt: "" } }));
  const ribbonYear = ribbonYears(ribbonCards).at(0);
  const inRibbon = new Set(ribbonCards.map((card) => card.id));
  const rest = cards.filter((card) => !inRibbon.has(card.id));
  const jeeCards = rest.filter((card) => card.exam === "JEE").slice(0, 9);
  const neetCards = rest.filter((card) => card.exam === "NEET").slice(0, 8);
  const [jeeMedia, neetMedia] = await Promise.all([
    resultMosaicMedia({ locale, cards: jeeCards, base: "4x2", lg: "3x3", seeAllHref: null }),
    resultMosaicMedia({ locale, cards: neetCards, base: "4x2", lg: "4x2", seeAllHref: null }),
  ]);

  const centreNames = centreNameMap(centres);
  // Names are stripped on the server wherever canShowStudentName() is false.
  const archive = results.map(withPermittedName);
  const rankerRows = toRankerRows(rankers);
  const rankerSources = distinctSources(rankers);
  const hasDemo = [...results, ...rankers].some(isPlaceholder);
  const stockLabel = common.labels.illustrativeStockPhoto;
  const cardMessages = { card: t.card, tracks: tPrograms.tracks, demo: common.labels.demo };

  // Hero count: the ribbon's year (else the newest year listed), only when that year has entries.
  const countYear = ribbonYear ?? yearCounts.at(-1)?.year;
  const countRow = yearCounts.find((row) => row.year === countYear);
  const counts = countsSentence(countRow, t.hero.counts);
  const ribbonLabels: RibbonLabels = {
    ...t.hero.ribbon,
    // The ribbon holds only its newest years, so the last pill says how many ("All 3 years").
    allYears: format(t.hero.ribbon.allYears, { count: ribbonYears(ribbonCards).length }),
    demo: common.labels.demo,
  };
  // Over the ribbon the action is white, as in the design: the pressed year pill is the gold
  // control there. It is the wide layout's aside, so it is made full width on phones here (as
  // HeroCopy `actions` are). `!` because cn() does not resolve competing utilities.
  const heroAction = (onRibbon: boolean) => (
    <HeroAction
      href={localePath("/admissions#enquiry", locale)}
      icon={<ArrowRight aria-hidden="true" className="size-4 shrink-0" />}
      className={onRibbon ? "w-full bg-white! shadow-none! hover:bg-blue-soft! sm:w-auto" : undefined}
    >
      {t.hero.cta}
    </HeroAction>
  );
  const heroCopy = {
    title: t.hero.title,
    highlight: t.hero.highlight,
    lead: counts ? (
      <>
        <p className="m-0">
          {counts}
          {countRow?.placeholder && (
            <>
              {" "}
              <DemoBadge label={common.labels.demo} className="align-middle" />
            </>
          )}
        </p>
        <p className="m-0 mt-2">{t.hero.lead}</p>
      </>
    ) : (
      t.hero.lead
    ),
    crumbs: [{ label: t.crumb }],
    homeLabel: common.labels.home,
    homeHref: localePath("/", locale),
  };

  const photo = (image: (typeof stockImages)[keyof typeof stockImages]) => localizeImage(image, locale);

  const notice = hasDemo ? (
    <Notice variant="warning" title={t.notices.demoTitle}>
      {t.notices.demoBody}
    </Notice>
  ) : (
    <Notice title={t.notices.verifiedTitle}>{t.notices.verifiedBody}</Notice>
  );

  // One slot per section, rendered in layout order. A slot is null exactly when its section would
  // render nothing, so empty sections never take a tone or a photo side.
  const slots: LayoutSlots<"results"> = {
    stories:
      featured.length > 0
        ? ({ tone, side, rendered }) => {
            const withNotice = noticeHost(rendered) === "stories";
            return (
              <Section tone={tone} aria-labelledby="results-stories-title">
                {withNotice && notice}
                <StickyMediaLayout
                  // The gap separates the notice from the stories; without the notice (custom layout,
                  // archive above stories) there is nothing above to separate, so no gap.
                  className={withNotice ? "mt-12 md:mt-14" : undefined}
                  image={photo(stockImages.libraryAisle)}
                  secondaryImage={photo(stockImages.booksAndNotebook)}
                  imageLabel={stockLabel}
                  imageSide={side}
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
                  <ul className="grid gap-6">
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
            );
          }
        : null,

    archive: ({ tone, side, rendered }) => (
      <Section tone={tone} aria-labelledby="results-archive-title">
        {noticeHost(rendered) === "archive" && <div className="mb-10 md:mb-12">{notice}</div>}
        <StickyMediaLayout
          image={photo(stockImages.pocketWatchWorksheet)}
          secondaryImage={photo(stockImages.mathsNotebook)}
          imageLabel={stockLabel}
          imageSide={side}
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
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 md:gap-6">
              {archiveAwaiting(t.awaiting).map((category) => (
                <li key={category.tag}>
                  <AwaitingRecordCard category={category} />
                </li>
              ))}
            </ul>
          )}
        </StickyMediaLayout>
      </Section>
    ),

    rankers:
      rankerRows.length > 0
        ? ({ tone, side }) => (
            <Section tone={tone} aria-labelledby="results-rankers-title">
              <StickyResultsLayout
                primary={{ media: jeeMedia, image: photo(stockImages.physicsWhiteboard), imageLabel: stockLabel }}
                secondary={{ media: neetMedia, image: photo(stockImages.stethoscopeTextbooks), imageLabel: stockLabel }}
                imageSide={side}
              >
                <SectionHeading
                  id="results-rankers-title"
                  title={t.rankers.title}
                  description={t.rankers.lead}
                  action={
                    <div className="flex items-center gap-3">
                      {/* Decorative laurel (white background, so only on white sections): 96px, under its maxWidth. */}
                      {tone === "white" && (
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
              </StickyResultsLayout>
            </Section>
          )
        : null,

    method: ({ tone, side }) => (
      <BleedSplit
        aria-labelledby="results-method-title"
        tone={tone}
        image={photo(stockImages.signingForm)}
        imageSide={side}
        imageLabel={stockLabel}
      >
        <SectionHeading
          id="results-method-title"
          eyebrow={t.method.eyebrow}
          title={t.method.title}
          description={t.method.lead}
        />
        <ul className="grid gap-5 sm:grid-cols-2 md:gap-6">
          {(Object.keys(STANDARD_ICONS) as (keyof typeof STANDARD_ICONS)[]).map((key) => {
            const Icon = STANDARD_ICONS[key];
            const standard = t.method.standards[key];
            return (
              <li key={key} className="rounded-card border border-line bg-white p-6 shadow-soft">
                <span className="grid size-10 place-items-center rounded-xl bg-blue-soft text-blue">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 font-bold text-navy">{standard.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{standard.text}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-8 max-w-prose text-sm leading-relaxed text-muted">{t.method.disclaimer}</p>
      </BleedSplit>
    ),

    cta: ({ tone, side }) => (
      <CtaBleedSplit
        tone={tone}
        imageSide={side}
        headingId="results-cta-title"
        title={t.cta.title}
        description={t.cta.body}
        primary={{ label: t.cta.primary, href: localePath("/admissions#enquiry", locale) }}
        secondary={{ label: t.cta.secondary, href: localePath("/programs", locale) }}
        image={photo(stockImages.notebookSolutions)}
        imageLabel={stockLabel}
      />
    ),
  };

  return (
    <PageLayoutFrame
      layout={layout}
      banner={await layoutPreviewBanner(layout)}
      hero={
        ribbonCards.length > 0 ? (
          // C · results ribbon: one call to action at the end of the headline row, the ribbon under it.
          <HeroFrame
            {...heroCopy}
            layout="wide"
            aside={heroAction(true)}
            footer={<ResultsRibbon cards={ribbonCards} labels={ribbonLabels} defaultYear={ribbonYear} />}
          />
        ) : (
          // No visible result card (production builds, placeholder content off): the same copy beside
          // the labelled stock photo.
          <HeroFrame
            {...heroCopy}
            layout="split"
            actions={heroAction(false)}
            aside={
              <HeroCollage
                photos={[{ image: photo(stockImages.graduateSilhouette), label: stockLabel }]}
                // There is no result card to show in this branch, so this badge never renders.
                resultBadge=""
                demoLabel={common.labels.demo}
              />
            }
          />
        )
      }
      slots={slots}
    />
  );
}
