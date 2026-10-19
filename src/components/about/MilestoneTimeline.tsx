import { Badge, DemoBadge } from "@/components/ui";
import type { Milestone } from "@/lib/types";

/**
 * "Our journey" block (mockup `.history`): navy intro panel + milestone timeline.
 * Deliberately no illustration: milestones name real people, and imagery with
 * figures must never sit beside a name.
 */
export function MilestoneTimeline({
  headingId,
  milestones,
  demo,
}: {
  headingId: string;
  milestones: Milestone[];
  demo: boolean;
}) {
  const ordered = [...milestones].sort((a, b) => a.year - b.year);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="flex flex-col gap-4 rounded-card bg-linear-to-br from-navy to-navy-2 p-6 text-white md:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">Our journey</p>
        <h2 id={headingId} className="text-[clamp(1.6rem,3vw,2.25rem)] font-extrabold leading-tight tracking-tight">
          Every milestone starts with a student.
        </h2>
        <p className="text-[#d9e6f6]">
          Key moments in how Aspire grew — its first classroom, new programs, campuses and the tools families use
          today.
        </p>
        {demo && <DemoBadge className="self-start" />}
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map((milestone) => (
          <li
            key={`${milestone.year}-${milestone.title}`}
            className="rounded-r-control border-l-[3px] border-gold bg-white p-4 shadow-soft"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-extrabold text-blue">{milestone.year}</span>
              {milestone.tag && <Badge variant="info">{milestone.tag}</Badge>}
            </div>
            <h3 className="mt-1.5 font-bold leading-snug text-navy">{milestone.title}</h3>
            <p className="mt-1 text-sm text-muted">{milestone.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
