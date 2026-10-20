import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { FillMediaSplit } from "@/components/about/FillMediaSplit";
import { PhotoPanel } from "@/components/about/PhotoPanel";
import { mixedResultCards } from "@/components/about/result-cards";
import { ResultsBand } from "@/components/about/ResultsBand";
import { ADMISSIONS_HERO_IMAGES } from "@/components/admissions/hero-images";
import { NextSteps } from "@/components/admissions/NextSteps";
import { ScholarshipPanel } from "@/components/admissions/ScholarshipPanel";
import { FaqList } from "@/components/faq/FaqList";
import { EnquiryForm } from "@/components/forms/EnquiryForm";
import { DownloadList } from "@/components/resources/DownloadList";
import { ResultCardMosaic } from "@/components/results/ResultCardMosaic";
import {
  ButtonLink,
  Card,
  DemoBadge,
  EmptyState,
  Notice,
  PageHero,
  Section,
  SectionHeading,
  type SectionTone,
} from "@/components/ui";
import { heroSlides } from "@/components/ui/hero-slides";
import { stockImages } from "@/content/images";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getCentres, getFaqs, getInstituteProfile, isPlaceholder, localizeImage } from "@/lib/data";
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

export default async function AdmissionsPage() {
  const [locale, t, tc, tr, tForms] = await Promise.all([
    getLocale(),
    getMessages("admissions"),
    getMessages("common"),
    getMessages("resources"),
    getMessages("forms"),
  ]);
  const [centres, faqs, profile] = await Promise.all([
    getCentres(undefined, locale),
    getFaqs("admissions", locale),
    getInstituteProfile(locale),
  ]);
  const photoLabel = tc.labels.illustrativeStockPhoto;

  // D-031: a band of previous results (alternating JEE / NEET, 6 × 2 cards; the heading links to
  // /results). In production there are no visible cards and the band shows a labelled stock photo.
  const resultsMedia = await ResultCardMosaic({
    locale,
    variant: "6x2",
    cards: await mixedResultCards(locale, 12),
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

  const profileDemoLabel = profile !== null && isPlaceholder(profile) ? tc.labels.demoPending : undefined;
  const scholarships = scholarshipMilestones(profile?.milestones ?? []);
  const downloads = admissionDownloads(profile?.downloads ?? []);

  // Alternate white / surface backgrounds over the sections actually rendered.
  const order = [
    "enquiry",
    "next",
    "results",
    scholarships.length > 0 && "scholarships",
    downloads.length > 0 && "downloads",
    "faqs",
  ].filter(Boolean);
  const tone = (key: string): SectionTone => (order.indexOf(key) % 2 === 0 ? "white" : "surface");

  return (
    <>
      <PageHero
        title={t.hero.title}
        lead={t.hero.lead}
        crumbs={[{ label: t.hero.crumb }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        // Stock only (no landscapes or result cards), so preview and production share the first fold.
        slides={heroSlides(
          ADMISSIONS_HERO_IMAGES.map((key) => stockImages[key]),
          photoLabel,
          locale,
        )}
      />

      {/* D-030: the form beside a tall photo (after the form on small screens, so the form stays near the top). */}
      <Section tone={tone("enquiry")}>
        <FillMediaSplit
          image={localizeImage(stockImages.studentsWalkingPath, locale)}
          imageSide="right"
          imageLabel={photoLabel}
          imageFirstOnMobile={false}
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

      <Section tone={tone("next")} aria-labelledby="next-steps-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.tableDiscussion, locale)}
          imageSide="left"
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

      {/* General section (not beside a centre): previous results, then scholarships. */}
      <Section tone={tone("results")} aria-labelledby="admissions-results-heading">
        <ResultsBand
          headingId="admissions-results-heading"
          eyebrow={t.results.eyebrow}
          title={t.results.title}
          description={t.results.description}
          link={{ label: t.results.link, href: localePath("/results", locale) }}
          media={resultsMedia}
        />
      </Section>

      {scholarships.length > 0 && (
        <Section tone={tone("scholarships")} aria-labelledby="scholarships-heading">
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
      )}

      {downloads.length > 0 && (
        <Section tone={tone("downloads")} aria-labelledby="admission-downloads-heading">
          <PhotoPanel image={localizeImage(stockImages.libraryAisle, locale)} imageLabel={photoLabel} minHeight="lg" className="mb-8">
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
      )}

      <Section tone={tone("faqs")} id="faqs" aria-labelledby="admissions-faqs-heading" className="scroll-mt-24">
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
    </>
  );
}
