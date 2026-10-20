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
import type { ReactNode } from "react";
import { ApproachGrid } from "@/components/about/ApproachGrid";
import { Art } from "@/components/about/Art";
import { CtaBand } from "@/components/about/CtaBand";
import { ExploreLinks } from "@/components/about/ExploreLinks";
import { FillMediaSplit } from "@/components/about/FillMediaSplit";
import { PhotoMosaic } from "@/components/about/PhotoMosaic";
import { MilestoneTimeline } from "@/components/about/MilestoneTimeline";
import { PrinciplesList } from "@/components/about/PrinciplesList";
import {
  ButtonLink,
  Card,
  DemoBadge,
  Notice,
  PageHero,
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
import { getInstituteProfile, isPlaceholder, localizeImage } from "@/lib/data";
import type { InstituteProfile } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("about");
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: await localeAlternates("/about"),
  };
}

/** A page section that takes its background tone from its position, so white/surface always alternate. */
type ToneSection = (tone: SectionTone) => ReactNode;

/** What every section renderer needs: locale, both namespaces and the stock-photo label. */
type Ctx = {
  locale: Locale;
  t: Messages<"about">;
  tc: Messages<"common">;
  /** Visible label on every stock photo ("Illustrative stock photo"). */
  photoLabel: string;
};

export default async function AboutPage() {
  const [locale, t, tc] = await Promise.all([getLocale(), getMessages("about"), getMessages("common")]);
  const profile = await getInstituteProfile(locale);
  const ctx: Ctx = { locale, t, tc, photoLabel: tc.labels.illustrativeStockPhoto };

  const sections: ToneSection[] = [
    ...(profile ? profileSections(profile, ctx) : pendingSections(ctx)),
    (tone) => <SpacesSection key="spaces" tone={tone} ctx={ctx} />,
    (tone) => (
      <Section key="explore" tone={tone} aria-labelledby="explore-heading">
        <SectionHeading
          id="explore-heading"
          eyebrow={t.explore.eyebrow}
          title={t.explore.title}
          description={t.explore.description}
        />
        <ExploreLinks messages={t.explore} locale={locale} photoLabel={ctx.photoLabel} />
      </Section>
    ),
    (tone) => (
      <Section key="cta" tone={tone} aria-labelledby="about-cta-heading">
        <CtaBand
          id="about-cta-heading"
          title={t.cta.title}
          description={t.cta.description}
          primary={{ label: t.cta.enquire, href: localePath("/admissions#enquiry", locale) }}
          secondary={{ label: t.cta.contact, href: localePath("/contact", locale) }}
          image={localizeImage(stockImages.himalayaBlueRidge, locale)}
          imageLabel={ctx.photoLabel}
        />
      </Section>
    ),
  ];

  return (
    <>
      <PageHero
        title={t.hero.title}
        lead={t.hero.lead}
        crumbs={[{ label: t.hero.crumb }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        image={localizeImage(stockImages.shimlaPanorama, locale)}
        imageLabel={ctx.photoLabel}
      />
      {sections.map((render, index) => render(index % 2 === 0 ? "white" : "surface"))}
    </>
  );
}

/**
 * Institute profile sections. The profile is an imported placeholder (D-020): visible
 * with DEMO badges in development / preview; getInstituteProfile() returns null in
 * production until Aspire verifies it, and the page falls back to pendingSections().
 * Faculty / founder names, credentials and the founder message are not shown (owner instruction 2026-10-20).
 */
function profileSections(profile: InstituteProfile, { locale, t, tc, photoLabel }: Ctx): ToneSection[] {
  const demoLabel = isPlaceholder(profile) ? tc.labels.demoPending : undefined;
  const demo = demoLabel ? <DemoBadge label={demoLabel} /> : null;
  const facts = [
    { label: t.profile.factFounded, value: String(profile.foundedYear) },
    { label: t.profile.factWhere, value: profile.foundedIn },
  ];

  const sections: (ToneSection | false)[] = [
    (tone) => (
      <Section key="story" tone={tone} aria-labelledby="story-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.seminarFromBehind, locale)}
          imageSide="right"
          imageLabel={photoLabel}
        >
          <SectionHeading id="story-heading" title={t.profile.storyTitle} action={demo} className="mb-0" />
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

    (tone) => (
      <Section key="mission" tone={tone} aria-labelledby="mission-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.teacherChalkboard, locale)}
          imageSide="left"
          imageLabel={photoLabel}
        >
          <SectionHeading
            id="mission-heading"
            title={t.profile.missionTitle}
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

    profile.approach.length > 0 &&
      ((tone) => (
        <Section key="approach" tone={tone} aria-labelledby="approach-heading">
          <FillMediaSplit
            image={localizeImage(stockImages.physicsWhiteboard, locale)}
            imageSide="right"
            imageLabel={photoLabel}
          >
            <SectionHeading
              id="approach-heading"
              eyebrow={t.profile.approachEyebrow}
              title={t.profile.approachTitle}
              description={t.profile.approachDescription}
              action={demo}
            />
            <ApproachGrid points={profile.approach} columns={1} />
          </FillMediaSplit>
        </Section>
      )),

    profile.pedagogyPrinciples.length > 0 &&
      ((tone) => (
        <Section key="values" tone={tone} aria-labelledby="values-heading">
          <FillMediaSplit
            image={localizeImage(stockImages.tableDiscussion, locale)}
            imageSide="left"
            imageLabel={photoLabel}
          >
            <SectionHeading
              id="values-heading"
              eyebrow={t.profile.valuesEyebrow}
              title={t.profile.valuesTitle}
              action={demo}
              className="mb-5"
            />
            <PrinciplesList principles={profile.pedagogyPrinciples} columns={1} />
          </FillMediaSplit>
        </Section>
      )),

    profile.milestones.length > 0 &&
      ((tone) => (
        <Section key="journey" tone={tone} aria-labelledby="journey-heading">
          <MilestoneTimeline
            headingId="journey-heading"
            milestones={profile.milestones}
            eyebrow={t.profile.journeyEyebrow}
            title={t.profile.journeyTitle}
            description={t.profile.journeyDescription}
            demoLabel={demoLabel}
            image={localizeImage(stockImages.mountainTrail, locale)}
            imageLabel={photoLabel}
          />
        </Section>
      )),
  ];

  return sections.filter((section): section is ToneSection => section !== false);
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

function pendingSections({ locale, t, photoLabel }: Ctx): ToneSection[] {
  const p = t.pending;
  return [
    (tone) => (
      <Section key="story" tone={tone} aria-labelledby="story-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.seminarFromBehind, locale)}
          imageSide="right"
          imageLabel={photoLabel}
        >
          <SectionHeading id="story-heading" title={p.storyTitle} className="mb-0" />
          <p className="mt-3 text-muted">{p.storyBody}</p>
        </FillMediaSplit>
      </Section>
    ),
    (tone) => (
      <Section key="approach" tone={tone} aria-labelledby="approach-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.teacherChalkboard, locale)}
          imageSide="left"
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
    (tone) => (
      <Section key="values" tone={tone} aria-labelledby="values-heading">
        <FillMediaSplit
          image={localizeImage(stockImages.tableDiscussion, locale)}
          imageSide="right"
          imageLabel={photoLabel}
        >
          <SectionHeading
            id="values-heading"
            eyebrow={p.valuesEyebrow}
            title={p.valuesTitle}
            description={p.valuesDescription}
          />
          <ul className="grid gap-4 sm:grid-cols-2">
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
  ];
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
