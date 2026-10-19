import { ArrowRight } from "lucide-react";
import { Art } from "@/components/about/Art";
import { ButtonLink, Card, DemoBadge, Notice } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import type { Milestone } from "@/lib/types";

/**
 * Scholarship information taken from the institute profile (its scholarship milestones).
 * Always paired with the reminder that eligibility and amounts are confirmed by Aspire.
 */
export function ScholarshipPanel({
  headingId,
  items,
  demo,
}: {
  headingId: string;
  items: Milestone[];
  demo: boolean;
}) {
  return (
    <Card tint="gold" className="p-5 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-2xl font-extrabold tracking-tight text-navy">
            Scholarships
          </h2>
          {demo && <DemoBadge className="mt-2" />}
        </div>
        <Art asset={aspireAssets.medalAchievement} className="block w-24 shrink-0" rounded />
      </div>
      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li key={`${item.year}-${item.title}`}>
            <span className="text-sm font-extrabold text-blue">{item.year}</span>
            <h3 className="font-extrabold leading-snug text-navy">{item.title}</h3>
            <p className="mt-1 text-sm text-muted">{item.description}</p>
          </li>
        ))}
      </ul>
      <Notice variant="warning" className="mt-5">
        Eligibility, test dates and scholarship amounts are confirmed by Aspire directly. Please check them with the
        admissions team before relying on them.
      </Notice>
      <ButtonLink href="#enquiry" variant="dark" className="mt-5">
        Ask about scholarships <ArrowRight aria-hidden="true" className="size-4" />
      </ButtonLink>
    </Card>
  );
}
