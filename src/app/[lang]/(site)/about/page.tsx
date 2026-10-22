import {
  ArrowRight,
  Compass,
  HeartHandshake,
  Lightbulb,
  ListChecks,
  MapPin,
  MessageCircle,
  Repeat,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { ApproachGrid } from "@/components/about/ApproachGrid";
import { Art } from "@/components/about/Art";
import { CtaBand } from "@/components/about/CtaBand";
import { ExploreLinks } from "@/components/about/ExploreLinks";
import { FillMediaSplit } from "@/components/about/FillMediaSplit";
import {
  ABOUT_HERO_PHOTOS,
  ABOUT_PROOF_STAT_IDS,
  heroCollagePhotos,
  heroProofStats,
} from "@/components/about/hero-images";
import { PhotoMosaic } from "@/components/about/PhotoMosaic";
import { MilestoneTimeline } from "@/components/about/MilestoneTimeline";
import { PrinciplesList } from "@/components/about/PrinciplesList";
import { mixedResultCards } from "@/components/about/result-cards";
import { ResultsBand } from "@/components/about/ResultsBand";
import { HeroAction, HeroCollage, HeroFrame, ProofStats, RanchoChip } from "@/components/hero";
import { layoutPreviewBanner } from "@/components/page-layout/preview-banner";
import { PageLayoutFrame, type LayoutSlots } from "@/components/page-layout/render";
import { ResultCardMosaic } from "@/components/results/ResultCardMosaic";
import {
  ButtonLink,
  Card,
  DemoBadge,
  Notice,
  Section,
  SectionHeading,
  type CardTint,
  type SectionTone,
} from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getInstituteProfile, getStats, isPlaceholder, localizeImage } from "@/lib/data";
import { getPageLayout } from "@/lib/page-layout/loader";
import type { InstituteProfile } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("about");
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: await localeAlternates("/about"),
  };
}

/** The sections whose content depends on the institute profile (verified profile or honest fallback). */
type ContentSlots = Pick<LayoutSlots<"about">, "story" | "mission" | "approach" | "values" | "journey">;

/** Cards per 6×2 band: every cell is a card (the section heading links to /results). */
const MOSAIC_CARDS = 12;

/** What every section renderer needs: locale, both namespaces and the stock-photo label. */
type Ctx = {
  locale: Locale;
  t: Messages<"about">;
  tc: Messages<"common">;
  /** Visible label on every stock photo ("Illustrative stock photo"). */
  photoLabel: string;
};

/**
 * About. Page layout (docs/page-layout-plan.md §12.3): the sections after the hero follow the
 * published layout (`getPageLayout("about")`, editable by a super admin; the closing band stays
 * last). Each section is a slot that takes its background tone from its position (white / surface
 * alternate over the sections that render) and, for the photo splits, its photo side too (D8), so
 * the default layout looks exactly as before.
 */
export default async function AboutPage() {
  const [locale, t, tc, layout] = await Promise.all([
    getLocale(),
    getMessages("about"),
    getMessages("common"),
    getPageLayout("about"),
  ]);
  const [profile, stats, resultCards] = await Promise.all([
    getInstituteProfile(locale),
    getStats(undefined, locale),
    // D-031: previous results (alternating JEE / NEET) instead of landscapes, in general slots only —
    // the hero collage and two mosaics, never beside a specific centre or campus (so not in the
    // journey timeline, which names campuses). Each card appears once on the page. Production has
    // no visible cards: the collage then shows its photos alone and each mosaic its stock photo.
    mixedResultCards(locale, 1 + 2 * MOSAIC_CARDS),
  ]);
  const ctx: Ctx = { locale, t, tc, photoLabel: tc.labels.illustrativeStockPhoto };
  const [heroCard] = resultCards;
  const sectionCards = resultCards.slice(1, 1 + MOSAIC_CARDS);
  const ctaCards = resultCards.slice(1 + MOSAIC_CARDS);
  const [resultsMedia, ctaMedia] = await Promise.all([
    ResultCardMosaic({
      locale,
      variant: "6x2",
      cards: sectionCards,
      seeAllHref: null,
      fallbackImage: localizeImage(stockImages.graduateSilhouette, locale),
      fallbackImageLabel: ctx.photoLabel,
    }),
    ResultCardMosaic({
      locale,
      variant: "6x2",
      cards: ctaCards,
      seeAllHref: null,
      fallbackImage: localizeImage(stockImages.notebookPlanning, locale),
      fallbackImageLabel: ctx.photoLabel,
    }),
  ]);

  // One slot per section, rendered in layout order. A slot is null exactly when its section would
  // render nothing, so empty sections never take a tone.
  const slots: LayoutSlots<"about"> = {
    ...(profile ? profileSlots(profile, ctx) : pendingSlots(ctx)),
    // General results band (default: before the journey, whose milestones name campuses: no cards there).
    results: ({ tone }) => (
      <Section tone={tone} aria-labelledby="about-results-heading">
        <ResultsBand
          headingId="about-results-heading"
          eyebrow={t.results.eyebrow}
          title={t.results.title}
          description={t.results.description}
          link={{ label: t.results.link, href: localePath("/results", locale) }}
          media={resultsMedia}
        />
      </Section>
    ),
    explore: ({ tone }) => (
      <Section tone={tone} aria-labelledby="explore-heading">
        <SectionHeading
          id="explore-heading"
          eyebrow={t.explore.eyebrow}
          title={t.explore.title}
          description={t.explore.description}
        />
        <ExploreLinks messages={t.explore} locale={locale} photoLabel={ctx.photoLabel} />
      </Section>
    ),
    // Default: between the hostel / campus links and the results band in the CTA (D-031: no cards beside them).
    spaces: ({ tone }) => <SpacesSection tone={tone} ctx={ctx} />,
    cta: ({ tone }) => (
      <Section tone={tone} aria-labelledby="about-cta-heading">
        <CtaBand
          id="about-cta-heading"
          title={t.cta.title}
          description={t.cta.description}
          primary={{ label: t.cta.enquire, href: localePath("/admissions#enquiry", locale) }}
          secondary={{ label: t.cta.contact, href: localePath("/contact", locale) }}
          media={ctaMedia}
        />
      </Section>
    ),
  };

  return (
    <PageLayoutFrame
      layout={layout}
      banner={await layoutPreviewBanner(layout)}
      hero={
        // Design A · proof up front (2026-10-22). Every figure comes from getStats() and the result card
        // from getResultCards() (both DEMO-badged placeholders; production shows neither).
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
              <HeroAction href={localePath("/admissions#enquiry", locale)}>{t.hero.primaryCta}</HeroAction>
              <HeroAction href={localePath("/results", locale)} variant="secondary">
                {t.hero.secondaryCta}
              </HeroAction>
            </>
          }
          below={
            <ProofStats stats={heroProofStats(stats, ABOUT_PROOF_STAT_IDS)} label={t.hero.statsLabel} demoLabel={tc.labels.demo} />
          }
          aside={
            <HeroCollage
              photos={heroCollagePhotos(ABOUT_HERO_PHOTOS, ctx.photoLabel, locale)}
              result={heroCard}
              resultBadge={t.hero.resultBadge}
              demoLabel={tc.labels.demo}
              chip={<RanchoChip href={localePath("/tools/ask", locale)} title={t.hero.rancho.title} action={t.hero.rancho.action} />}
            />
          }
        />
      }
      slots={slots}
    />
  );
}

/**
 * Institute profile sections. The profile is an imported placeholder (D-020): visible
 * with DEMO badges in development / preview; getInstituteProfile() returns null in
 * production until Aspire verifies it, and the page falls back to pendingSlots().
 * Faculty / founder names, credentials and the founder message are not shown (owner instruction 2026-10-20).
 * Photo sides follow position (D8): at the default layout story, mission, approach and values
 * alternate right / left as before.
 */
function profileSlots(profile: InstituteProfile, { locale, t, tc, photoLabel }: Ctx): ContentSlots {
  const demoLabel = isPlaceholder(profile) ? tc.labels.demoPending : undefined;
  const demo = demoLabel ? <DemoBadge label={demoLabel} /> : null;
  const facts = [
    { label: t.profile.factFounded, value: String(profile.foundedYear) },
    { label: t.profile.factWhere, value: profile.foundedIn },
  ];

  return {
    story: ({ tone, side }) => (
      <Section tone={tone} aria-labelledby="story-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.seminarFromBehind, locale)}
          imageSide={side}
          imageLabel={photoLabel}
        >
          <SectionHeading id="story-heading" title={t.profile.storyTitle} action={demo} stack className="mb-0" />
          <p className="mt-3 font-bold text-blue">{profile.tagline}</p>
          <p className="mt-3 text-muted">{profile.foundingStory}</p>
          <p className="mt-3 text-muted">{profile.summary}</p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-control bg-surface px-4 py-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-muted">{fact.label}</dt>
                <dd className="mt-0.5 font-bold text-navy">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </FillMediaSplit>
      </Section>
    ),

    mission: ({ tone, side }) => (
      <Section tone={tone} aria-labelledby="mission-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.teacherChalkboard, locale)}
          imageSide={side}
          imageLabel={photoLabel}
        >
          <SectionHeading
            id="mission-heading"
            title={t.profile.missionTitle}
            stack
            className="mb-0"
            action={
              <div className="flex items-end gap-4">
                {demo}
                {/* Mountain-and-flag art (no people). */}
                <Art asset={aspireAssets.illustrationJourney} className="hidden w-24 sm:block" rounded />
              </div>
            }
          />
          <p className="mt-4 text-lg font-bold text-navy">{profile.mission.title}</p>
          {profile.mission.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-3 text-muted">
              {paragraph}
            </p>
          ))}
        </FillMediaSplit>
      </Section>
    ),

    approach:
      profile.approach.length > 0
        ? ({ tone, side }) => (
            <Section tone={tone} aria-labelledby="approach-heading">
              <FillMediaSplit
                image={localizeImage(stockImages.physicsWhiteboard, locale)}
                imageSide={side}
                imageLabel={photoLabel}
              >
                <SectionHeading
                  id="approach-heading"
                  eyebrow={t.profile.approachEyebrow}
                  title={t.profile.approachTitle}
                  description={t.profile.approachDescription}
                  action={demo}
                  stack
                />
                <ApproachGrid points={profile.approach} columns={1} />
              </FillMediaSplit>
            </Section>
          )
        : null,

    values:
      profile.pedagogyPrinciples.length > 0
        ? ({ tone, side }) => (
            <Section tone={tone} aria-labelledby="values-heading">
              <FillMediaSplit
                image={localizeImage(stockImages.tableDiscussion, locale)}
                imageSide={side}
                imageLabel={photoLabel}
              >
                <SectionHeading
                  id="values-heading"
                  eyebrow={t.profile.valuesEyebrow}
                  title={t.profile.valuesTitle}
                  action={demo}
                  stack
                  className="mb-5"
                />
                <PrinciplesList principles={profile.pedagogyPrinciples} columns={1} />
              </FillMediaSplit>
            </Section>
          )
        : null,

    journey:
      profile.milestones.length > 0
        ? ({ tone }) => (
            <Section tone={tone} aria-labelledby="journey-heading">
              <MilestoneTimeline
                headingId="journey-heading"
                milestones={profile.milestones}
                eyebrow={t.profile.journeyEyebrow}
                title={t.profile.journeyTitle}
                description={t.profile.journeyDescription}
                demoLabel={demoLabel}
                image={localizeImage(stockImages.pocketWatchWorksheet, locale)}
                imageLabel={photoLabel}
              />
            </Section>
          )
        : null,
  };
}

// ---------------------------------------------------------------------------
// Honest fallback while no institute profile is publishable (production today).

// Approach pillars and values from the mockup's About copy (no numeric claims). Wording needs Aspire's approval.
const APPROACH_ICONS = [Lightbulb, Repeat, ListChecks, MessageCircle];
const VALUE_STYLES: { icon: typeof Users; tint: CardTint }[] = [
  { icon: Users, tint: "blue" },
  { icon: Compass, tint: "gold" },
  { icon: HeartHandshake, tint: "green" },
  { icon: MapPin, tint: "violet" },
];

/** Without a profile there is no mission or milestone content: those slots are empty. */
function pendingSlots({ locale, t, photoLabel }: Ctx): ContentSlots {
  const p = t.pending;
  return {
    story: ({ tone, side }) => (
      <Section tone={tone} aria-labelledby="story-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.seminarFromBehind, locale)}
          imageSide={side}
          imageLabel={photoLabel}
        >
          <SectionHeading id="story-heading" title={p.storyTitle} className="mb-0" />
          <p className="mt-3 text-muted">{p.storyBody}</p>
        </FillMediaSplit>
      </Section>
    ),
    mission: null,
    approach: ({ tone, side }) => (
      <Section tone={tone} aria-labelledby="approach-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.teacherChalkboard, locale)}
          imageSide={side}
          imageLabel={photoLabel}
        >
          <SectionHeading id="approach-heading" title={p.approachTitle} description={p.approachLead} className="mb-0" />
          <ul className="mt-4 space-y-3">
            {p.approach.map(({ title, detail }, index) => {
              const Icon = APPROACH_ICONS[index % APPROACH_ICONS.length];
              return (
                <li key={title} className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-control bg-blue-soft text-blue">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span>
                    <span className="block font-bold text-navy">{title}</span>
                    <span className="block text-sm text-muted">{detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <Notice variant="warning" className="mt-5">
            {p.notice}
          </Notice>
          <ButtonLink href={localePath("/admissions#enquiry", locale)} className="mt-5">
            {p.speakCta} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </FillMediaSplit>
      </Section>
    ),
    values: ({ tone, side }) => (
      <Section tone={tone} aria-labelledby="values-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.tableDiscussion, locale)}
          imageSide={side}
          imageLabel={photoLabel}
        >
          <SectionHeading
            id="values-heading"
            eyebrow={p.valuesEyebrow}
            title={p.valuesTitle}
            description={p.valuesDescription}
          />
          <ul className="grid gap-4 sm:grid-cols-2 md:max-lg:grid-cols-1">
            {p.values.map(({ title, detail }, index) => {
              const { icon: Icon, tint } = VALUE_STYLES[index % VALUE_STYLES.length];
              return (
                <li key={title}>
                  <Card tint={tint} className="h-full p-5">
                    <span className="grid size-11 place-items-center rounded-xl bg-blue-soft text-blue">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <h3 className="mt-3 text-lg font-extrabold text-navy">{title}</h3>
                    <p className="mt-1 text-sm text-muted">{detail}</p>
                  </Card>
                </li>
              );
            })}
          </ul>
        </FillMediaSplit>
      </Section>
    ),
    journey: null,
  };
}

/**
 * Temporary stock photos (docs/asset-manifest.md). Captions describe the activity only:
 * these are not Aspire's centres, students or staff.
 */
function SpacesSection({ tone, ctx: { locale, t, photoLabel } }: { tone: SectionTone; ctx: Ctx }) {
  const captions = t.spaces.captions;
  const photos = [
    { image: stockImages.studentsTakingNotes, caption: captions.notes },
    { image: stockImages.classroomDesks, caption: captions.classroom },
    { image: stockImages.labPipette, caption: captions.lab },
    { image: stockImages.libraryReading, caption: captions.library },
  ].map(({ image, caption }) => ({
    image: localizeImage(image, locale),
    caption,
  }));

  return (
    <Section tone={tone} aria-labelledby="spaces-heading">
      <SectionHeading id="spaces-heading" title={t.spaces.title} description={t.spaces.description} />
      <PhotoMosaic items={photos} label={photoLabel} />
      <p className="mt-4 text-xs text-muted">{t.spaces.note}</p>
    </Section>
  );
}
