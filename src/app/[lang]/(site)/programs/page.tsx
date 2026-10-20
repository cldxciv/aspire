import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { BleedSplit } from "@/components/home/BleedSplit";
import { CtaBleedSplit } from "@/components/home/CtaSplit";
import { ProgramDirectory } from "@/components/programs/ProgramDirectory";
import { programCardMessages } from "@/components/programs/program-view";
import { TrackTiles } from "@/components/programs/TrackTiles";
import { interleaveCards, resultMosaicMedia } from "@/components/results/ResultMosaicMedia";
import { ButtonLink, EmptyState, Notice, PageHero, PhotoBand, Section, SectionHeading } from "@/components/ui";
import { stockImages } from "@/content/images";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localePath } from "@/i18n/paths";
import { getPrograms, getResultCards, isPlaceholder, localizeImage } from "@/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("programs");
  return {
    title: t.list.metaTitle,
    description: t.list.metaDescription,
    alternates: await localeAlternates("/programs"),
  };
}

/**
 * Programs (D-030 image-rich, D-031): hero, directory, a tracks band with one photo per track, the
 * page-guide split beside a mosaic of Aspire's previous JEE and NEET result cards (a general
 * section: the cards are not tied to any one program; fallback photo without visible cards), and
 * the closing CTA. No landscapes; no photo repeats on the page.
 */
export default async function ProgramsPage() {
  const [locale, t, common] = await Promise.all([getLocale(), getMessages("programs"), getMessages("common")]);
  const [programs, jeeCards, neetCards] = await Promise.all([
    getPrograms(undefined, locale),
    getResultCards({ exam: "JEE", limit: 4 }, locale),
    getResultCards({ exam: "NEET", limit: 4 }, locale),
  ]);
  const resultsMedia = await resultMosaicMedia({ locale, cards: interleaveCards(jeeCards, neetCards) });
  const hasPlaceholders = programs.some(isPlaceholder);
  const stockLabel = common.labels.illustrativeStockPhoto;
  const photo = (image: (typeof stockImages)[keyof typeof stockImages]) => localizeImage(image, locale);
  const tl = t.list;

  return (
    <>
      <PageHero
        title={tl.heroTitle}
        lead={tl.heroLead}
        crumbs={[{ label: tl.crumb }]}
        homeLabel={common.labels.home}
        homeHref={localePath("/", locale)}
        image={photo(stockImages.seminarFromBehind)}
        imageLabel={stockLabel}
      />

      <Section aria-labelledby="programs-title">
        <SectionHeading
          id="programs-title"
          title={tl.directoryTitle}
          description={programs.length > 0 ? tl.directoryLead : undefined}
        />
        {hasPlaceholders && <Notice className="mb-6">{tl.demoNotice}</Notice>}
        {programs.length > 0 ? (
          <ProgramDirectory programs={programs} messages={programCardMessages(locale)} />
        ) : (
          <EmptyState
            title={tl.emptyTitle}
            description={tl.emptyBody}
            action={<ButtonLink href={localePath("/admissions#enquiry", locale)}>{tl.emptyCta}</ButtonLink>}
          />
        )}
        <Notice variant="warning" className="mt-8">
          {tl.availabilityNotice}
        </Notice>
      </Section>

      {/* D-030: a wide photo band carries the tracks heading, then one tall photo per track.
          Program cards above show their own photos, so none of these repeats a card photo. */}
      <Section tone="surface" aria-labelledby="programs-tracks-title">
        <PhotoBand image={photo(stockImages.tableDiscussion)} imageLabel={stockLabel} aspect="3/1">
          <h2
            id="programs-tracks-title"
            className="font-serif text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-tight text-white [&:lang(hi)]:leading-snug"
          >
            {tl.tracksTitle}
          </h2>
          <p className="mt-2 text-[#dbe8f7]">{tl.tracksLead}</p>
        </PhotoBand>
        <div className="mt-6">
          <TrackTiles
            label={stockLabel}
            items={[
              { image: photo(stockImages.teacherChalkboard), caption: t.tracks.JEE },
              { image: photo(stockImages.stethoscopeTextbooks), caption: t.tracks.NEET },
              { image: photo(stockImages.youngStudentNotebook), caption: t.tracks.Foundation },
            ]}
          />
        </div>
      </Section>

      <BleedSplit
        aria-labelledby="programs-guide-title"
        image={photo(stockImages.pocketWatchWorksheet)}
        media={resultsMedia}
        imageSide="left"
        imageLabel={stockLabel}
      >
        <h2
          id="programs-guide-title"
          className="font-serif text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-tight text-navy"
        >
          {tl.pageGuideTitle}
        </h2>
        <p className="mt-3 text-muted">{tl.pageGuideLead}</p>
        <ul className="mt-5 space-y-3">
          {Object.values(tl.pageGuidePoints).map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-ink">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </BleedSplit>

      <CtaBleedSplit
        tone="surface"
        headingId="programs-cta-title"
        title={tl.ctaTitle}
        description={tl.ctaBody}
        primary={{ label: tl.ctaPrimary, href: localePath("/admissions#enquiry", locale) }}
        secondary={{ label: tl.ctaSecondary, href: localePath("/contact", locale) }}
        image={photo(stockImages.mentoringConversation)}
        imageLabel={stockLabel}
      />
    </>
  );
}
