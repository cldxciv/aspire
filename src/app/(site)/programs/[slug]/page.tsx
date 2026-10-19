import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/home/CtaBand";
import { EXAM_META, programTracks } from "@/components/programs/exam-meta";
import { ProgramGrid } from "@/components/programs/ProgramGrid";
import { ScheduleFees } from "@/components/programs/ScheduleFees";
import {
  AspireImage,
  ButtonLink,
  DemoBadge,
  ImagePlaceholder,
  Notice,
  PageHero,
  Section,
  SectionHeading,
} from "@/components/ui";
import { getProgram, getPrograms, getProgramSlugs, isPlaceholder } from "@/lib/data";

/**
 * D-017: the slug check must finish before anything streams so unknown/unpublished
 * slugs return a real 404 (with server-rendered HTML) on the first request.
 * `ensureStatic = "navigation"` makes Next wait for the complete static render of an
 * unlisted slug instead of streaming the fallback shell; `instant = false` silences
 * the instant-navigation check for the top-level `await params`.
 */
export const ensureStatic = "navigation";
export const instant = false;

/** Every known slug (any status); unpublished ones resolve to notFound() below. */
export function generateStaticParams() {
  return getProgramSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/programs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const program = await getProgram(slug);
  if (!program) return { title: "Program not found" };
  return {
    title: program.title,
    description: program.shortDescription,
    alternates: { canonical: `/programs/${program.slug}` },
  };
}

const subheading = "text-[clamp(1.35rem,2.4vw,1.625rem)] font-extrabold tracking-tight text-navy";

export default async function ProgramPage({ params }: PageProps<"/programs/[slug]">) {
  const { slug } = await params;
  const program = await getProgram(slug);
  if (!program) notFound();

  const otherPrograms = (await getPrograms()).filter((p) => p.id !== program.id);
  const placeholder = isPlaceholder(program);
  const { label: examLabel, illustration } = EXAM_META[program.exam];
  const tracks = programTracks(program);
  const audienceFacts = [
    { label: "Class level", value: program.classLevel },
    { label: "Batch / cohort", value: program.cohortName },
    { label: "Prepares for", value: tracks.map((track) => EXAM_META[track].label).join(" · ") },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value?.trim()));

  return (
    <>
      <PageHero
        title={program.title}
        lead={
          <>
            <p>{program.shortDescription}</p>
            {placeholder && <DemoBadge className="mt-3" />}
          </>
        }
        crumbs={[{ label: "Programs", href: "/programs" }, { label: program.title }]}
      >
        <ButtonLink href="/admissions#enquiry">Enquire about this program</ButtonLink>
        <ButtonLink href="/programs" variant="outline">
          All programs
        </ButtonLink>
      </PageHero>

      <Section>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10">
          <div className="space-y-9">
            {placeholder && (
              <Notice variant="warning" title="Draft program information">
                This description is a placeholder pending verification by Aspire&apos;s academic team. Please confirm
                details with a counsellor.
              </Notice>
            )}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <h2 id="program-overview" className={subheading}>
                  Overview
                </h2>
                <p className="mt-3 text-ink">{program.description}</p>
              </div>
              {/* Decorative track illustration, 160px max (asset maxWidth 335px). */}
              <span className="block w-28 shrink-0 overflow-hidden rounded-card bg-blue-soft sm:w-40">
                <AspireImage asset={illustration} />
              </span>
            </div>
            <div>
              <h2 id="program-audience" className={subheading}>
                Who it&apos;s for
              </h2>
              <p className="mt-3 text-ink">{program.targetAudience}</p>
              {audienceFacts.length > 0 && (
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  {audienceFacts.map((fact) => (
                    <div key={fact.label} className="rounded-control border border-line bg-surface p-3.5">
                      <dt className="text-xs font-bold text-muted">{fact.label}</dt>
                      <dd className="mt-1 text-sm font-bold text-navy">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {program.highlights.length > 0 && (
              <div>
                <h2 id="program-highlights" className={subheading}>
                  Program highlights
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {program.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="flex items-start gap-2.5 rounded-control border border-line bg-surface p-3.5 text-sm text-ink"
                    >
                      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <aside aria-labelledby="program-schedule" className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <ScheduleFees program={program} headingId="program-schedule" />
            {program.image ? (
              <Image
                src={program.image.src}
                alt={program.image.alt}
                width={program.image.width}
                height={program.image.height}
                sizes="(min-width: 1024px) 420px, 100vw"
                className="h-auto w-full rounded-card"
              />
            ) : (
              <ImagePlaceholder label={`Students in an Aspire ${examLabel} class`} />
            )}
          </aside>
        </div>
      </Section>

      {otherPrograms.length > 0 && (
        <Section tone="surface" aria-labelledby="other-programs-title">
          <SectionHeading
            id="other-programs-title"
            title="Other programs"
            description="Compare pathways before speaking with a counsellor."
          />
          <ProgramGrid programs={otherPrograms} columns={otherPrograms.length >= 4 ? 4 : 3} />
        </Section>
      )}

      <Section aria-labelledby="program-cta-title">
        <CtaBand
          headingId="program-cta-title"
          title={`Interested in the ${program.title}?`}
          description="Share a few details and Aspire's admissions team can guide you on batches, centres and next steps."
          primary={{ label: "Enquire now", href: "/admissions#enquiry" }}
          secondary={{ label: "Contact Aspire", href: "/contact" }}
        />
      </Section>
    </>
  );
}
