import { ArrowRight, Compass, HeartHandshake, Lightbulb, ListChecks, MapPin, MessageCircle, Repeat, Users } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ApproachGrid } from "@/components/about/ApproachGrid";
import { Art } from "@/components/about/Art";
import { CtaBand } from "@/components/about/CtaBand";
import { ExploreLinks } from "@/components/about/ExploreLinks";
import { FounderMessage } from "@/components/about/FounderMessage";
import { IllustrativeFigure } from "@/components/about/IllustrativeFigure";
import { MilestoneTimeline } from "@/components/about/MilestoneTimeline";
import { PhotoGrid, type CaptionedPhoto } from "@/components/about/PhotoGrid";
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
import { siteConfig } from "@/config/site";
import { aspireAssets } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import { getInstituteProfile, isPlaceholder } from "@/lib/data";
import type { InstituteProfile } from "@/lib/types";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Aspire IIT & Medical: our approach to IIT JEE, NEET and Foundation preparation and what we value in supporting students and families.",
  alternates: { canonical: "/about" },
};

/** A page section that takes its background tone from its position, so white/surface always alternate. */
type ToneSection = (tone: SectionTone) => ReactNode;

const CAMPUS_CAPTION = "An illustration of a hill-style campus building — not a photograph of an Aspire campus.";

export default async function AboutPage() {
  const profile = await getInstituteProfile();

  const sections: ToneSection[] = [
    ...(profile ? profileSections(profile) : pendingSections()),
    (tone) => (
      <Section key="explore" tone={tone} aria-labelledby="explore-heading">
        <SectionHeading
          id="explore-heading"
          eyebrow="Explore"
          title="The people and places behind Aspire"
          description="Meet the teaching team, see how residential life works and find a campus near you."
        />
        <ExploreLinks />
      </Section>
    ),
    (tone) => (
      <Section key="cta" tone={tone} aria-labelledby="about-cta-heading">
        <CtaBand id="about-cta-heading" art={aspireAssets.successJourney} />
      </Section>
    ),
  ];

  return (
    <>
      <PageHero title="About Aspire" lead={siteConfig.description} crumbs={[{ label: "About" }]} />
      {sections.map((render, index) => render(index % 2 === 0 ? "white" : "surface"))}
    </>
  );
}

/**
 * Institute profile sections. The profile is an imported placeholder (D-020): visible
 * with DEMO badges in development / preview; getInstituteProfile() returns null in
 * production until Aspire verifies it, and the page falls back to pendingSections().
 */
function profileSections(profile: InstituteProfile): ToneSection[] {
  const demo = isPlaceholder(profile);
  const founder = [profile.founder.honorific, profile.founder.name].filter(Boolean).join(" ");
  const facts = [
    { label: "Founded", value: String(profile.foundedYear) },
    { label: "Where", value: profile.foundedIn },
    { label: "Founder", value: [founder, profile.founder.credentials].filter(Boolean).join(", ") },
  ];
  const founderMessage = profile.founderMessage;

  const sections: (ToneSection | false)[] = [
    (tone) => (
      <Section key="story" tone={tone} aria-labelledby="story-heading">
        <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="p-5 md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="story-heading" className="text-2xl font-extrabold tracking-tight text-navy">
                Our story
              </h2>
              {demo && <DemoBadge />}
            </div>
            <p className="mt-3 font-bold text-blue">{profile.tagline}</p>
            <p className="mt-3 text-muted">{profile.foundingStory}</p>
            <p className="mt-3 text-muted">{profile.summary}</p>
            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              {facts.map((fact) => (
                <div key={fact.label} className="rounded-control bg-surface px-4 py-3">
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted">{fact.label}</dt>
                  <dd className="mt-0.5 font-bold text-navy">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="space-y-5">
            <IllustrativeFigure asset={aspireAssets.campusBuilding} caption={CAMPUS_CAPTION} />
            <Card tint="blue" className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-extrabold text-navy">Our mission</h3>
                  {demo && <DemoBadge className="mt-2" />}
                </div>
                {/* Mountain-and-flag art (no people): this column sits beside the founder's name. */}
                <Art asset={aspireAssets.illustrationJourney} className="block w-24 shrink-0" rounded />
              </div>
              <p className="mt-3 font-bold text-navy">{profile.mission.title}</p>
              {profile.mission.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-2 text-sm text-muted">
                  {paragraph}
                </p>
              ))}
            </Card>
          </div>
        </div>
      </Section>
    ),

    profile.approach.length > 0 &&
      ((tone) => (
        <Section key="approach" tone={tone} aria-labelledby="approach-heading">
          <SectionHeading
            id="approach-heading"
            eyebrow="Our approach"
            title="How learning is organised"
            description="Small batches, resident teachers and daily support, so questions don't wait."
            action={
              <div className="flex items-end gap-4">
                {demo && <DemoBadge />}
                <Art asset={aspireAssets.illustrationGoal} className="hidden w-28 md:block" rounded />
              </div>
            }
          />
          <ApproachGrid points={profile.approach} />
        </Section>
      )),

    profile.pedagogyPrinciples.length > 0 &&
      ((tone) => (
        <Section key="values" tone={tone} aria-labelledby="values-heading">
          <div className="grid items-start gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <SectionHeading id="values-heading" eyebrow="What we value" title="Principles behind every class" />
              {demo && <DemoBadge />}
              <Art asset={aspireAssets.illustrationGrowth} className="mt-6 hidden w-44 lg:block" rounded />
            </div>
            <PrinciplesList principles={profile.pedagogyPrinciples} />
          </div>
        </Section>
      )),

    profile.milestones.length > 0 &&
      ((tone) => (
        <Section key="journey" tone={tone} aria-labelledby="journey-heading">
          <MilestoneTimeline headingId="journey-heading" milestones={profile.milestones} demo={demo} />
        </Section>
      )),

    founderMessage !== undefined &&
      ((tone) => (
        <Section key="founder" tone={tone} aria-labelledby="founder-heading">
          <SectionHeading
            id="founder-heading"
            eyebrow="From the founder"
            title="Why Aspire exists"
            action={demo ? <DemoBadge /> : undefined}
          />
          <FounderMessage message={founderMessage} />
        </Section>
      )),
  ];

  return sections.filter((section): section is ToneSection => section !== false);
}

// ---------------------------------------------------------------------------
// Honest fallback while no institute profile is publishable (production today).

// Approach pillars from the mockup's About copy. Wording needs Aspire's approval.
const APPROACH = [
  { icon: Lightbulb, title: "Conceptual clarity", detail: "Understanding the ideas behind each topic before speed." },
  { icon: Repeat, title: "Structured practice", detail: "Planned practice and revision that build exam readiness." },
  { icon: ListChecks, title: "Consistent feedback", detail: "Regular checks that show students where to focus next." },
  { icon: MessageCircle, title: "Accessible guidance", detail: "Academic help students and families can reach." },
];

// Values drawn from the mockup's qualitative highlights (no numeric claims).
const VALUES: { icon: typeof Users; title: string; detail: string; tint: CardTint }[] = [
  { icon: Users, title: "Student-first", detail: "Guidance beyond the classroom.", tint: "blue" },
  { icon: Compass, title: "Structured learning", detail: "Clear plans for learning, practice and revision.", tint: "gold" },
  { icon: HeartHandshake, title: "Personal support", detail: "Attention to each learner's goals and progress.", tint: "green" },
  { icon: MapPin, title: "Close to home", detail: `Local learning and guidance in ${siteConfig.region}.`, tint: "violet" },
];

// Temporary stock photos (docs/asset-manifest.md). Captions describe the activity only:
// these are not Aspire's centres, students or staff.
const PHOTOS: CaptionedPhoto[] = [
  { image: stockImages.classroomDesks, caption: "Classroom learning" },
  { image: stockImages.labPipette, caption: "Hands-on science practice" },
  { image: stockImages.libraryReading, caption: "Reading and revision" },
];

function pendingSections(): ToneSection[] {
  return [
    (tone) => (
      <Section key="story" tone={tone} aria-labelledby="story-heading">
        <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <Card className="p-5 md:p-7">
              <h2 id="story-heading" className="text-2xl font-extrabold tracking-tight text-navy">
                Our story
              </h2>
              <p className="mt-3 text-muted">
                Aspire&apos;s story — how the institute began, how it has grown and the students it has guided — will
                be published here once it has been written and verified with the institute&apos;s leadership.
              </p>
            </Card>
            <IllustrativeFigure asset={aspireAssets.campusBuilding} caption={CAMPUS_CAPTION} />
          </div>

          <Card className="p-5 md:p-7">
            <h2 className="text-2xl font-extrabold tracking-tight text-navy">Our approach</h2>
            <p className="mt-3 text-muted">
              Conceptual clarity, structured practice, consistent feedback and accessible academic guidance.
            </p>
            <ul className="mt-4 space-y-3">
              {APPROACH.map(({ icon: Icon, title, detail }) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-control bg-blue-soft text-blue">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span>
                    <span className="block font-bold text-navy">{title}</span>
                    <span className="block text-sm text-muted">{detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Notice variant="warning" className="mt-5">
              Faculty profiles, years of operation, centre details and results will be added only after Aspire has
              verified them.
            </Notice>
            <ButtonLink href="/admissions#enquiry" className="mt-5">
              Speak with Aspire <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>
          </Card>
        </div>
      </Section>
    ),
    (tone) => (
      <Section key="values" tone={tone} aria-labelledby="values-heading">
        <SectionHeading
          id="values-heading"
          eyebrow="What we value"
          title="Guided by students and families"
          description="The principles behind how Aspire supports each learner."
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map(({ icon: Icon, title, detail, tint }) => (
            <li key={title}>
              <Card tint={tint} className="h-full p-5">
                <span className="grid size-11 place-items-center rounded-xl bg-blue-soft text-blue">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-3 text-lg font-extrabold text-navy">{title}</h3>
                <p className="mt-1 text-sm text-muted">{detail}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Section>
    ),
    (tone) => (
      <Section key="spaces" tone={tone} aria-labelledby="spaces-heading">
        <SectionHeading
          id="spaces-heading"
          title="Learning, practice and revision"
          description="Photographs of Aspire's own centres and classrooms will replace these once they are approved for use."
        />
        <PhotoGrid
          photos={PHOTOS}
          note="Illustrative stock photos. They do not show Aspire's centres, students or staff."
        />
      </Section>
    ),
  ];
}
