import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { FillMediaSplit } from "@/components/about/FillMediaSplit";
import {
  ADMISSIONS_HERO_PHOTOS,
  ADMISSIONS_PROOF_STAT_IDS,
  heroCollagePhotos,
  heroProofStats,
} from "@/components/about/hero-images";
import { PhotoPanel } from "@/components/about/PhotoPanel";
import { mixedResultCards } from "@/components/about/result-cards";
import { ResultsBand } from "@/components/about/ResultsBand";
import { NextSteps } from "@/components/admissions/NextSteps";
import { ScholarshipPanel } from "@/components/admissions/ScholarshipPanel";
import { FaqList } from "@/components/faq/FaqList";
import { EnquiryForm } from "@/components/forms/EnquiryForm";
import { HeroAction, HeroCollage, HeroFrame, NextBatchCard, ProofStats } from "@/components/hero";
import { layoutPreviewBanner } from "@/components/page-layout/preview-banner";
import { PageLayoutFrame, type LayoutSlots } from "@/components/page-layout/render";
import { DownloadList } from "@/components/resources/DownloadList";
import { ResultCardMosaic } from "@/components/results/ResultCardMosaic";
import { ButtonLink, Card, DemoBadge, EmptyState, Notice, Section, SectionHeading } from "@/components/ui";
import { stockImages } from "@/content/images";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getCentres, getFaqs, getInstituteProfile, getStats, isPlaceholder, localizeImage } from "@/lib/data";
import { getPageLayout } from "@/lib/page-layout/loader";
import type { DownloadItem, Milestone } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("admissions");
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: await localeAlternates("/admissions"),
  };
}

// Downloads relevant to admissions, in display order: the prospectus, then the
// Brain of Himachal (BOH) scholarship-test papers. The full list is on /resources.
// `category` is a filter key and stays English in every locale (getDownloadCategoryLabel() for display).
const ADMISSION_DOWNLOAD_CATEGORIES = ["Brochure", "BOH Paper"];

/** Result cards in the band under the enquiry form (6 × 2). */
const MOSAIC_CARDS = 12;

function admissionDownloads(downloads: DownloadItem[]): DownloadItem[] {
  return ADMISSION_DOWNLOAD_CATEGORIES.flatMap((category) => downloads.filter((d) => d.category === category));
}

/**
 * Scholarship milestones: the Brain of Himachal (BOH) scholarship test. Selected by its `tag`,
 * which is never translated, so the Hindi page finds the same records as the English one.
 */
function scholarshipMilestones(milestones: Milestone[]): Milestone[] {
  return milestones.filter((milestone) => milestone.tag === "BOH");
}

/**
 * Admissions. Page layout (docs/page-layout-plan.md §12.3): the sections after the hero follow the
 * published layout (`getPageLayout("admissions")`, editable by a super admin; there is no closing
 * band, so every section can move). The enquiry form, "what happens next" and the FAQs can move but
 * never hide (links across the site point to #enquiry, #next-steps and #faqs). Each section is a
 * slot that takes its background tone from its position (white / surface alternate over the
 * sections that render) and, for the photo splits, its photo side too (D8), so the default layout
 * looks exactly as before.
 */
export default async function AdmissionsPage() {
  const [locale, t, tc, tr, tForms, layout] = await Promise.all([
    getLocale(),
    getMessages("admissions"),
    getMessages("common"),
    getMessages("resources"),
    getMessages("forms"),
    getPageLayout("admissions"),
  ]);
  const [centres, faqs, profile, stats, resultCards] = await Promise.all([
    getCentres(undefined, locale),
    getFaqs("admissions", locale),
    getInstituteProfile(locale),
    getStats(undefined, locale),
    // D-031: previous results (alternating JEE / NEET) in general slots only — one card in the hero
    // collage, then a 6 × 2 band (the heading links to /results); each card once on the page. In
    // production there are no visible cards: the collage shows its photos alone and the band a
    // labelled stock photo.
    mixedResultCards(locale, 1 + MOSAIC_CARDS),
  ]);
  const photoLabel = tc.labels.illustrativeStockPhoto;
  const [heroCard] = resultCards;

  const resultsMedia = await ResultCardMosaic({
    locale,
    variant: "6x2",
    cards: resultCards.slice(1),
    seeAllHref: null,
    fallbackImage: localizeImage(stockImages.studentsTakingNotes, locale),
    fallbackImageLabel: photoLabel,
  });

  // Preferred-centre options from the visible campuses (slug values satisfy the enquiry contract, D-016).
  const centreOptions = centres.map((centre) => ({
    value: centre.slug,
    label: isPlaceholder(centre) ? format(tForms.shared.centreUnverified, { name: centre.name }) : centre.name,
  }));
  const demoCentres = centres.some(isPlaceholder);
  // "Next batch" card: only facts the data states. No program has a start date, seat count or fee
  // yet, so the card shows where Aspire teaches (the visible centres' districts) and asks for dates.
  const centreDistricts = [...new Set(centres.map((centre) => centre.district.trim()).filter(Boolean))];

  const profileDemoLabel = profile !== null && isPlaceholder(profile) ? tc.labels.demoPending : undefined;
  const scholarships = scholarshipMilestones(profile?.milestones ?? []);
  const downloads = admissionDownloads(profile?.downloads ?? []);

  // One slot per section, rendered in layout order. A slot is null exactly when its section would
  // render nothing, so empty sections never take a tone.
  const slots: LayoutSlots<"admissions"> = {
    // D-030: the form beside a tall photo from lg (after the form below lg, so the form stays near the top
    // and keeps its full width on tablets).
    enquiry: ({ tone, side }) => (
      <Section tone={tone}>
        <FillMediaSplit
          image={localizeImage(stockImages.studentsWalkingPath, locale)}
          imageSide={side}
          imageLabel={photoLabel}
          imageFirstOnMobile={false}
          splitFrom="lg"
        >
          <Card id="enquiry" className="scroll-mt-24 p-5 md:p-7">
            <h2 className="text-2xl font-extrabold leading-snug tracking-tight text-navy">{t.enquiry.title}</h2>
            <p className="mb-5 mt-1.5 text-sm text-muted">{t.enquiry.lead}</p>
            {demoCentres && (
              <p className="-mt-2 mb-5 flex flex-wrap items-center gap-2 text-xs text-muted">
                <DemoBadge label={tc.labels.demoPending} />
                <span>{t.enquiry.demoCentres}</span>
              </p>
            )}
            <EnquiryForm variant="admissions" centreOptions={centreOptions} messages={tForms} />
          </Card>
        </FillMediaSplit>
      </Section>
    ),

    next: ({ tone, side }) => (
      <Section tone={tone} id="next-steps" aria-labelledby="next-steps-heading" className="scroll-mt-24">
        <FillMediaSplit
          image={localizeImage(stockImages.tableDiscussion, locale)}
          imageSide={side}
          imageWidth="wide"
          imageLabel={photoLabel}
        >
          <h2 id="next-steps-heading" className="mb-4 text-2xl font-extrabold leading-snug tracking-tight text-navy">
            {t.next.title}
          </h2>
          <NextSteps steps={t.next.steps} stepLabel={t.next.stepLabel} />
          <p className="mt-3 text-xs text-muted">{t.next.note}</p>
          <Notice variant="warning" title={t.next.confirmedTitle} className="mt-5">
            {t.next.confirmedBody}
          </Notice>
          <ButtonLink href={localePath("/centres", locale)} variant="outline" className="mt-5">
            {t.next.exploreCentres} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </FillMediaSplit>
      </Section>
    ),

    // General section (not beside a centre): previous results, then (by default) scholarships.
    results: ({ tone }) => (
      <Section tone={tone} aria-labelledby="admissions-results-heading">
        <ResultsBand
          headingId="admissions-results-heading"
          eyebrow={t.results.eyebrow}
          title={t.results.title}
          description={t.results.description}
          link={{ label: t.results.link, href: localePath("/results", locale) }}
          media={resultsMedia}
        />
      </Section>
    ),

    scholarships:
      scholarships.length > 0
        ? ({ tone }) => (
            <Section tone={tone} aria-labelledby="scholarships-heading">
              <PhotoPanel image={localizeImage(stockImages.pocketWatchWorksheet, locale)} imageLabel={photoLabel}>
                <ScholarshipPanel
                  headingId="scholarships-heading"
                  items={scholarships}
                  messages={t.scholarships}
                  demoLabel={profileDemoLabel}
                  surface="dark"
                />
              </PhotoPanel>
            </Section>
          )
        : null,

    downloads:
      downloads.length > 0
        ? ({ tone }) => (
            <Section tone={tone} aria-labelledby="admission-downloads-heading">
              <PhotoPanel
                image={localizeImage(stockImages.libraryAisle, locale)}
                imageLabel={photoLabel}
                minHeight="lg"
                className="mb-8"
              >
                <SectionHeading
                  id="admission-downloads-heading"
                  eyebrow={t.downloads.eyebrow}
                  title={t.downloads.title}
                  description={t.downloads.description}
                  tone="dark"
                  className="mb-0"
                />
                <ButtonLink href={localePath("/resources#downloads", locale)} variant="outline" className="mt-6">
                  {t.downloads.all} <ArrowRight aria-hidden="true" className="size-4" />
                </ButtonLink>
              </PhotoPanel>
              <DownloadList downloads={downloads} locale={locale} labels={tr.downloadCard} demoLabel={profileDemoLabel} />
            </Section>
          )
        : null,

    faqs: ({ tone }) => (
      <Section tone={tone} id="faqs" aria-labelledby="admissions-faqs-heading" className="scroll-mt-24">
        <PhotoPanel image={localizeImage(stockImages.mentoringConversation, locale)} imageLabel={photoLabel}>
          <SectionHeading
            id="admissions-faqs-heading"
            eyebrow={t.faqs.eyebrow}
            title={t.faqs.title}
            description={t.faqs.description}
            tone="dark"
          />
          {/* Light surface inside the dark panel: focus rings switch back to blue (D-024). */}
          <div data-surface="light">
            {faqs.length > 0 ? (
              <FaqList faqs={faqs} demoLabel={tc.labels.demoPending} />
            ) : (
              <EmptyState title={t.faqs.emptyTitle} description={t.faqs.emptyDescription} />
            )}
          </div>
        </PhotoPanel>
      </Section>
    ),
  };

  return (
    <PageLayoutFrame
      layout={layout}
      banner={await layoutPreviewBanner(layout)}
      hero={
        // Design A · proof up front (2026-10-22) with B's "Next batch" card in the collage's corner.
        // Figures from getStats(), the result card from getResultCards() (DEMO-badged placeholders;
        // production shows neither), the card's rows from the centres data.
        <HeroFrame
          layout="split"
          eyebrow={t.hero.eyebrow}
          title={t.hero.title}
          highlight={t.hero.highlight}
          lead={t.hero.lead}
          crumbs={[{ label: t.hero.crumb }]}
          homeLabel={tc.labels.home}
          homeHref={localePath("/", locale)}
          actions={
            <>
              <HeroAction href="#enquiry">{t.hero.primaryCta}</HeroAction>
              <HeroAction href="#next-steps" variant="secondary">
                {t.hero.secondaryCta}
              </HeroAction>
            </>
          }
          below={
            <ProofStats
              stats={heroProofStats(stats, ADMISSIONS_PROOF_STAT_IDS)}
              label={t.hero.statsLabel}
              demoLabel={tc.labels.demo}
            />
          }
          aside={
            <HeroCollage
              photos={heroCollagePhotos(ADMISSIONS_HERO_PHOTOS, photoLabel, locale)}
              result={heroCard}
              resultBadge={t.hero.resultBadge}
              demoLabel={tc.labels.demo}
              chip={
                <NextBatchCard
                  compact
                  eyebrow={t.hero.batch.eyebrow}
                  rows={[{ label: t.hero.batch.centres, value: centreDistricts.join(" · "), placeholder: demoCentres }]}
                  action={{ label: t.hero.batch.action, href: "#enquiry" }}
                  demoLabel={tc.labels.demo}
                />
              }
            />
          }
        />
      }
      slots={slots}
    />
  );
}
