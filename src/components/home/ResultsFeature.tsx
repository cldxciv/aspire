import { ArrowRight } from "lucide-react";
import { AspireImage, Badge, ButtonLink, DemoBadge, Section } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { canShowStudentName } from "@/lib/data";
import type { ResultRecord } from "@/lib/types";
import { TRACK_META } from "./track-meta";

/** Honest stand-ins while no result can be shown (mockup "awaiting approved record" cards). */
const AWAITING = [
  {
    tag: "JEE · Result story",
    title: "Student achievement",
    description: "Student name, exam year, rank and destination will be published only after verification.",
    status: "Awaiting approved result record",
  },
  {
    tag: "NEET · Result story",
    title: "Student achievement",
    description: "A student's preparation journey and verified outcome, shared with consent.",
    status: "Awaiting approved result record",
  },
  {
    tag: "Foundation",
    title: "Academic progress",
    description: "Approved stories about growth, confidence and learning.",
    status: "Awaiting approved story",
  },
];

/**
 * One success story. The name renders only when canShowStudentName() allows it; no
 * person image is ever shown here (D-019) — the laurel is decorative.
 */
function FeaturedResultCard({ result }: { result: ResultRecord }) {
  const name = canShowStudentName(result) ? result.studentDisplayName?.trim() : undefined;
  const exam = result.examLabel ?? TRACK_META[result.exam].label;

  return (
    <article className="flex h-full flex-col rounded-card border border-line bg-white p-5 text-ink shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>
          {exam} · {result.year}
        </Badge>
        {result.status === "placeholder" && <DemoBadge label="Demo" />}
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <AspireImage asset={aspireAssets.laurelWreath} className="w-14 shrink-0" />
        <h3 className="text-xl font-extrabold leading-tight text-navy">{result.rankOrOutcome}</h3>
      </div>
      {name && <p className="mt-2 font-bold text-ink">{name}</p>}
      {result.destination && <p className="mt-0.5 text-sm font-semibold text-[#354b66]">{result.destination}</p>}
      {result.school && <p className="mt-0.5 text-xs text-muted">{result.school}</p>}
      {result.quote && (
        <blockquote className="mt-3 border-l-3 border-gold pl-3 text-sm italic text-[#43556d]">
          <p>&ldquo;{result.quote}&rdquo;</p>
        </blockquote>
      )}
    </article>
  );
}

/**
 * Navy results feature (mockup `.results-section`). Shows up to four success stories;
 * with none publishable, shows the "awaiting approved record" cards. Links to /results.
 */
export function ResultsFeature({ results }: { results: ResultRecord[] }) {
  const stories = results.slice(0, 4);

  return (
    <Section tone="navy" aria-labelledby="home-results-title">
      <div className="grid items-center gap-7 lg:grid-cols-[0.8fr_2fr]">
        <div>
          <AspireImage asset={aspireAssets.trophySuccess} rounded className="mb-5 w-28 ring-1 ring-white/20" />
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">Built one student at a time</p>
          <h2
            id="home-results-title"
            className="mt-2 text-[clamp(1.6rem,3vw,2.25rem)] font-extrabold leading-tight tracking-tight"
          >
            Our Results.
            <br />
            A story of effort.
          </h2>
          <p className="mt-3 text-[#d5e3f4]">
            {stories.length > 0
              ? "Celebrating the students, teachers and families behind every milestone."
              : "Celebrating the students, teachers and families behind every milestone. Verified results will be published here from Aspire's official records."}
          </p>
          <ButtonLink href="/results" className="mt-5">
            Explore results <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </div>
        {stories.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {stories.map((result) => (
              <li key={result.id}>
                <FeaturedResultCard result={result} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {AWAITING.map((item) => (
              <li key={item.tag}>
                <div className="flex h-full flex-col rounded-[13px] border border-line bg-white p-[18px] text-ink shadow-soft">
                  <Badge className="self-start">{item.tag}</Badge>
                  <h3 className="mt-3 text-[15px] font-bold text-navy">{item.title}</h3>
                  <p className="mt-1 flex-1 text-xs text-muted">{item.description}</p>
                  <p className="mt-3 rounded-lg border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-2.5 text-[11px] font-semibold text-[#53657a]">
                    {item.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
