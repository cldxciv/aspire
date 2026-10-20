import { AspireImage, Card } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { cn } from "@/lib/cn";
import type { ApproachPoint } from "@/lib/types";

// Decorative feature icons, assigned in order (they illustrate the card, not a specific claim).
const FEATURE_ICONS = [
  aspireAssets.iconPersonalized,
  aspireAssets.iconExpertFaculty,
  aspireAssets.iconStudentSupport,
  aspireAssets.iconMentorship,
  aspireAssets.iconLearningCentres,
  aspireAssets.iconLearningResults,
];

/**
 * Approach points from the institute profile, each with a feature icon (≤ its 96px maxWidth).
 * `columns={1}` stacks the cards from `md` up (beside a photo, FillMediaSplit splits from `md`) and
 * uses two columns from `sm`. An odd last card spans both columns while there are two.
 */
export function ApproachGrid({ points, columns = 3 }: { points: ApproachPoint[]; columns?: 1 | 3 }) {
  return (
    <ul
      className={cn(
        "grid gap-4 sm:grid-cols-2",
        columns === 3 ? "lg:grid-cols-3 sm:max-lg:[&>li:last-child:nth-child(odd)]:col-span-2" : "md:grid-cols-1 sm:max-md:[&>li:last-child:nth-child(odd)]:col-span-2",
      )}
    >
      {points.map((point, index) => (
        <li key={point.title}>
          <Card className="flex h-full gap-4 p-5">
            <AspireImage
              asset={FEATURE_ICONS[index % FEATURE_ICONS.length]}
              className="w-14 shrink-0 self-start"
              rounded
            />
            <div className="min-w-0">
              <h3 className="font-extrabold leading-snug text-navy">{point.title}</h3>
              <p className="mt-1 text-sm text-muted">{point.description}</p>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
