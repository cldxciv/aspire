import { ArrowRight } from "lucide-react";
import { ButtonLink, DemoBadge, Section, type SectionTone } from "@/components/ui";
import type { Milestone } from "@/lib/types";

/** Milestone prompts from the mockup. Every entry is "to verify" — no years or facts. */
const MILESTONE_PROMPTS = [
  { title: "Founded", note: "Founding year and story to verify" },
  { title: "Growth", note: "Centre expansion to verify" },
  { title: "Programs", note: "Academic milestones to verify" },
  { title: "Students", note: "Verified impact to add" },
  { title: "Today", note: "Current offerings to confirm" },
  { title: "Next", note: "Future aspirations" },
];

/**
 * "Our story / journey" (mockup `.history`). With `milestones` (from the institute profile)
 * it lists them as stated by the source; without, it shows the mockup's "to verify" prompts.
 * Either way the content is placeholder here, so the section is DEMO-labelled: the home page
 * renders it only for a placeholder profile or when showPlaceholderContent() is on.
 */
export function StorySection({
  milestones,
  demo = true,
  tone = "surface",
}: {
  milestones?: Milestone[];
  /** False only when the milestones come from a published (verified) profile. */
  demo?: boolean;
  tone?: SectionTone;
}) {
  const items =
    milestones && milestones.length > 0
      ? milestones.slice(0, 6).map((m) => ({ key: `${m.year}-${m.title}`, title: String(m.year), note: m.title }))
      : MILESTONE_PROMPTS.map((p) => ({ key: p.title, ...p }));
  const fromProfile = Boolean(milestones && milestones.length > 0);

  return (
    <Section tone={tone} aria-labelledby="home-story-title">
      <div className="grid items-center gap-7 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="flex min-h-64 flex-col justify-center rounded-2xl bg-navy p-6 text-white md:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">Our story</p>
            {demo && <DemoBadge />}
          </div>
          <h2 id="home-story-title" className="mt-3 text-[clamp(1.6rem,3vw,2rem)] font-extrabold leading-tight">
            Every milestone starts with a student.
          </h2>
          <p className="mt-3 text-[#d9e6f6]">
            {fromProfile
              ? "Key moments in Aspire's journey so far, year by year."
              : "Aspire's timeline will be built from approved founding details, centre openings, academic milestones and documented student successes."}
          </p>
          <ButtonLink href="/about" className="mt-5 self-start">
            Discover Aspire <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </div>
        <div>
          <h3 className="text-2xl font-extrabold tracking-tight text-navy">Our journey</h3>
          <p className="mt-1 text-muted">
            {demo ? "Milestones to be confirmed by the institute." : "Milestones confirmed by the institute."}
          </p>
          <ol className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
            {items.map((item) => (
              <li key={item.key} className="rounded-r-control border-l-3 border-gold bg-white p-4">
                <p className="text-[19px] font-bold text-blue">{item.title}</p>
                <p className="text-xs text-muted">{item.note}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}
