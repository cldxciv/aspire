import { BadgeCheck, FileSearch, ShieldCheck, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import { CtaBand } from "@/components/home/CtaBand";
import { ARCHIVE_AWAITING, AwaitingRecordCard } from "@/components/results/AwaitingRecordCard";
import { RankersTable } from "@/components/results/RankersTable";
import { ResultStoryCard } from "@/components/results/ResultStoryCard";
import { ResultsArchive } from "@/components/results/ResultsArchive";
import { centreNameMap, distinctSources, toRankerRows, withPermittedName } from "@/components/results/server-view";
import { AspireImage, DemoBadge, Notice, PageHero, Section, SectionHeading } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import {
  canShowStudentName,
  getCentres,
  getFeaturedResults,
  getRankers,
  getResults,
  getResultYears,
  isPlaceholder,
} from "@/lib/data";

export const metadata: Metadata = {
  title: "Results",
  description:
    "Aspire's results archive publishes only verified, consent-aware records by exam and year, with the source of every entry.",
  alternates: { canonical: "/results" },
};

/** How entries reach the archive — mirrors the data contract (sourceReference, consentStatus, verification). */
const STANDARDS = [
  {
    Icon: FileSearch,
    title: "Sourced",
    text: "Each entry records where the outcome comes from, and that source is shown with the result.",
  },
  {
    Icon: UserCheck,
    title: "Consent-aware",
    text: "A student's name appears only when the student or guardian has approved publication.",
  },
  {
    Icon: ShieldCheck,
    title: "Verified first",
    text: "Results are checked against Aspire's official records before they are published.",
  },
  {
    Icon: BadgeCheck,
    title: "In context",
    text: "Outcomes are listed by exam and year, without combined counts or unsupported superlatives.",
  },
];

export default async function ResultsPage() {
  const [results, years, featured, rankers, centres] = await Promise.all([
    getResults(),
    getResultYears(),
    getFeaturedResults(),
    getRankers(),
    getCentres(),
  ]);

  const centreNames = centreNameMap(centres);
  // Names are stripped on the server wherever canShowStudentName() is false.
  const archive = results.map(withPermittedName);
  const rankerRows = toRankerRows(rankers);
  const rankerSources = distinctSources(rankers);
  const hasDemo = [...results, ...rankers].some(isPlaceholder);

  // Alternate white / surface backgrounds over the sections actually rendered.
  const order = [
    featured.length > 0 && "stories",
    "archive",
    rankerRows.length > 0 && "rankers",
    "method",
    "cta",
  ].filter(Boolean);
  const tone = (key: string) => (order.indexOf(key) % 2 === 0 ? "white" : "surface");

  const notice = hasDemo ? (
    <Notice variant="warning" title="Demo data — pending verification">
      The names, ranks and colleges on this page were imported from Aspire&apos;s demo site for review. They are marked
      DEMO, have not been verified against Aspire&apos;s official records, and publication consent has not been
      confirmed. They are hidden on the live site until both are in place.
    </Notice>
  ) : (
    <Notice title="Only verified records are published">
      This archive contains no unverified student names, ranks, selection counts or testimonials. Entries are added
      from Aspire&apos;s official records, with documented consent.
    </Notice>
  );

  return (
    <>
      <PageHero
        title="Student success deserves to be documented accurately."
        lead="A transparent archive of achievements by exam and year, with the source of every entry."
        crumbs={[{ label: "Results" }]}
      />

      {featured.length > 0 && (
        <Section tone={tone("stories")} aria-labelledby="results-stories-title">
          {notice}
          <SectionHeading
            id="results-stories-title"
            eyebrow="Success stories"
            title="Students in their own words"
            description="Outcomes, destinations and a few words from students about their preparation."
            className="mt-10"
            action={
              // Decorative: 128px, below the asset's 190px maxWidth.
              <span className="hidden w-32 overflow-hidden rounded-card md:block">
                <AspireImage asset={aspireAssets.trophySuccess} />
              </span>
            }
          />
          <ul className="grid gap-4 md:grid-cols-2">
            {featured.map((result) => (
              <li key={result.id}>
                <ResultStoryCard
                  result={result}
                  showName={canShowStudentName(result)}
                  centreName={result.centreSlug ? centreNames[result.centreSlug] : undefined}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section tone={tone("archive")} aria-labelledby="results-archive-title">
        {featured.length === 0 && <div className="mb-8">{notice}</div>}
        <SectionHeading
          id="results-archive-title"
          title="Results archive"
          description={
            archive.length > 0
              ? "Ranks, scores and allotted colleges by exam and year."
              : "Browse verified results by exam and year."
          }
        />
        <ResultsArchive results={archive} years={years} centreNames={centreNames} />
        {archive.length === 0 && (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ARCHIVE_AWAITING.map((category) => (
              <li key={category.tag}>
                <AwaitingRecordCard category={category} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {rankerRows.length > 0 && (
        <Section tone={tone("rankers")} aria-labelledby="results-rankers-title">
          <SectionHeading
            id="results-rankers-title"
            title="Rankers list"
            description="Search by name or college, or filter by exam and year. The newest results are listed first."
            action={
              <div className="flex items-center gap-3">
                {/* Decorative laurel (white background, so only on white sections): 96px, under its maxWidth. */}
                {tone("rankers") === "white" && (
                  <span className="hidden w-24 sm:block">
                    <AspireImage asset={aspireAssets.laurelWreath} />
                  </span>
                )}
                {rankerRows.some((row) => row.placeholder) && <DemoBadge />}
              </div>
            }
          />
          <RankersTable rows={rankerRows} sources={rankerSources} />
        </Section>
      )}

      <Section tone={tone("method")} aria-labelledby="results-method-title">
        <SectionHeading
          id="results-method-title"
          eyebrow="Methodology"
          title="How results are published"
          description="Results matter to families making important decisions, so every entry follows the same standard."
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STANDARDS.map(({ Icon, title, text }) => (
            <li key={title} className="rounded-card border border-line bg-white p-5 shadow-soft">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-soft text-blue">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="mt-3 font-bold text-navy">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-3xl text-sm text-muted">
          Individual results reflect each student&apos;s own effort and circumstances and are not a guarantee of future
          outcomes. If you believe an entry is inaccurate, please contact Aspire so it can be reviewed.
        </p>
      </Section>

      <Section tone={tone("cta")} aria-labelledby="results-cta-title">
        <CtaBand
          headingId="results-cta-title"
          title="Plan your own preparation journey"
          description="Talk to a counsellor about the program and support that suit the learner's goals."
          primary={{ label: "Book counselling", href: "/admissions#enquiry" }}
          secondary={{ label: "Explore programs", href: "/programs" }}
        />
      </Section>
    </>
  );
}
