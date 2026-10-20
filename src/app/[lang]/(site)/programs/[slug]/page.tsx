import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BleedSplit } from "@/components/home/BleedSplit";
import { CtaBleedSplit } from "@/components/home/CtaSplit";
import { EXAM_META, programTracks, trackLabel } from "@/components/programs/exam-meta";
import { ProgramGrid } from "@/components/programs/ProgramGrid";
import { programCardMessages, trackPhotos } from "@/components/programs/program-view";
import { ScheduleFees } from "@/components/programs/ScheduleFees";
import { interleaveCards, resultMosaicMedia } from "@/components/results/ResultMosaicMedia";
import { AspireImage, ButtonLink, DemoBadge, Notice, PageHero, Section, SectionHeading } from "@/components/ui";
import { format } from "@/i18n/format";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localePath } from "@/i18n/paths";
import { getProgram, getPrograms, getProgramSlugs, getResultCards, isPlaceholder } from "@/lib/data";
import type { ExamTrack } from "@/lib/types";

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

export async function generateMetadata({ params }: PageProps<"/[lang]/programs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [locale, t] = await Promise.all([getLocale(), getMessages("programs")]);
  const program = await getProgram(slug, locale);
  if (!program) return { title: t.detail.notFoundTitle };
  return {
    title: program.title,
    description: program.shortDescription,
    alternates: await localeAlternates(`/programs/${program.slug}`),
  };
}

const subheading = "text-[clamp(1.35rem,2.4vw,1.625rem)] font-extrabold tracking-tight text-navy";

export default async function ProgramPage({ params }: PageProps<"/[lang]/programs/[slug]">) {
  const { slug } = await params;
  const [locale, t, common] = await Promise.all([getLocale(), getMessages("programs"), getMessages("common")]);
  const program = await getProgram(slug, locale);
  if (!program) notFound();

  const otherPrograms = (await getPrograms(undefined, locale)).filter((p) => p.id !== program.id);
  const placeholder = isPlaceholder(program);
  const { illustration } = EXAM_META[program.exam];
  const tracks = programTracks(program);
  // Other programs' card photos are on this page too: never repeat one (D-030).
  const photos = trackPhotos(program.exam, locale, program.image, otherPrograms.map((p) => p.image));
  const stockLabel = common.labels.illustrativeStockPhoto;
  const td = t.detail;
  // D-031: the closing split shows previous result cards for the program's exam track (JEE or
  // NEET; an integrated program's JEE and NEET tracks mixed). They are Aspire-wide results, not
  // this program's, and the caption says so. Foundation (no result cards) keeps the CTA photo, as
  // does production (no visible cards).
  const resultExams: ExamTrack[] =
    program.exam === "JEE" || program.exam === "NEET"
      ? [program.exam]
      : tracks.filter((track) => track === "JEE" || track === "NEET");
  const examCards = await Promise.all(resultExams.map((exam) => getResultCards({ exam, limit: 8 }, locale)));
  const ctaMedia = await resultMosaicMedia({ locale, cards: interleaveCards(...examCards) });
  // White / surface alternate over the sections actually rendered.
  const order = ["overview", "schedule", otherPrograms.length > 0 && "other", "cta"].filter(Boolean);
  const tone = (key: string) => (order.indexOf(key) % 2 === 0 ? "white" : "surface");
  const audienceFacts = [
    { label: td.facts.classLevel, value: program.classLevel },
    { label: td.facts.cohort, value: program.cohortName },
    { label: td.facts.preparesFor, value: tracks.map((track) => trackLabel(track, t.tracks)).join(" · ") },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value?.trim()));

  return (
    <>
      <PageHero
        title={program.title}
        lead={
          <>
            <p>{program.shortDescription}</p>
            {placeholder && <DemoBadge label={common.labels.demoPending} className="mt-3" />}
          </>
        }
        crumbs={[{ label: t.list.crumb, href: localePath("/programs", locale) }, { label: program.title }]}
        homeLabel={common.labels.home}
        homeHref={localePath("/", locale)}
        image={photos.hero}
        imageLabel={stockLabel}
      >
        <ButtonLink href={localePath("/admissions#enquiry", locale)}>{td.enquire}</ButtonLink>
        <ButtonLink href={localePath("/programs", locale)} variant="outline">
          {td.allPrograms}
        </ButtonLink>
      </PageHero>

      {/* D-030: half-bleed photo splits — overview beside a track photo, then highlights and
          "Schedule & fees" beside another. */}
      <BleedSplit
        aria-labelledby="program-overview"
        tone={tone("overview")}
        image={photos.aside}
        imageSide="right"
        imageFirstOnMobile={false}
        imageLabel={photos.aside.src.startsWith("/images/stock/") ? stockLabel : undefined}
      >
        <div className="space-y-9">
          {placeholder && (
            <Notice variant="warning" title={td.draftTitle}>
              {td.draftBody}
            </Notice>
          )}
          <div>
            <div className="flex items-center gap-4">
              {/* Decorative track illustration, 64px (asset maxWidth ≥ 335px). */}
              <span className="block w-16 shrink-0 overflow-hidden rounded-xl bg-blue-soft">
                <AspireImage asset={illustration} />
              </span>
              <h2 id="program-overview" className={subheading}>
                {td.overview}
              </h2>
            </div>
            <p className="mt-3 text-ink">{program.description}</p>
          </div>
          <div>
            <h2 id="program-audience" className={subheading}>
              {td.audience}
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
        </div>
      </BleedSplit>

      <BleedSplit
        aria-labelledby={program.highlights.length > 0 ? "program-highlights" : "program-schedule"}
        tone={tone("schedule")}
        image={photos.highlights}
        imageSide="left"
        imageLabel={stockLabel}
      >
        {program.highlights.length > 0 && (
          <div className="mb-9">
            <h2 id="program-highlights" className={subheading}>
              {td.highlights}
            </h2>
            <p className="mt-2 text-muted">{td.highlightsLead}</p>
            <ul className="mt-5 grid gap-3">
              {program.highlights.map((highlight) => (
                <li
                  key={highlight}
                  className="flex items-start gap-2.5 rounded-control border border-line bg-white p-3.5 text-sm text-ink"
                >
                  <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  {highlight}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ScheduleFees program={program} headingId="program-schedule" locale={locale} />
      </BleedSplit>

      {otherPrograms.length > 0 && (
        <Section tone={tone("other")} aria-labelledby="other-programs-title">
          <SectionHeading id="other-programs-title" title={td.otherTitle} description={td.otherLead} />
          <ProgramGrid
            programs={otherPrograms}
            t={programCardMessages(locale)}
            locale={locale}
            columns={otherPrograms.length >= 4 ? 4 : 3}
          />
        </Section>
      )}

      <CtaBleedSplit
        tone={tone("cta")}
        headingId="program-cta-title"
        title={format(td.ctaTitle, { title: program.title })}
        description={td.ctaBody}
        primary={{ label: td.ctaPrimary, href: localePath("/admissions#enquiry", locale) }}
        secondary={{ label: td.ctaSecondary, href: localePath("/contact", locale) }}
        image={photos.cta}
        media={ctaMedia}
        caption={
          ctaMedia
            ? format(td.resultsCaption, { exams: resultExams.map((exam) => trackLabel(exam, t.tracks)).join(" · ") })
            : undefined
        }
        imageLabel={stockLabel}
      />
    </>
  );
}
