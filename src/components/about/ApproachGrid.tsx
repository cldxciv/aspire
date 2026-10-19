import { AspireImage, Card } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
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

/** Approach points from the institute profile, each with a feature icon (≤ its 96px maxWidth). */
export function ApproachGrid({ points }: { points: ApproachPoint[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {points.map((point, index) => (
        <li key={point.title}>
          <Card className="flex h-full gap-4 p-5">
            <AspireImage asset={FEATURE_ICONS[index % FEATURE_ICONS.length]} className="w-14 shrink-0" rounded />
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
