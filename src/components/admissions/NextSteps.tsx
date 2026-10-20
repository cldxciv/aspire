import { Art } from "@/components/about/Art";
import { aspireAssets } from "@/content/aspire-assets";
import { format } from "@/i18n/format";

// Indicative process from the mockup — Aspire must confirm the real steps (docs/content-verification.md).
// Illustrations are decorative (empty alt) and sit beside no names; assigned in step order.
const STEP_ART = [
  aspireAssets.illustrationGoal,
  aspireAssets.illustrationJourney,
  aspireAssets.illustrationGrowth,
  aspireAssets.graduationSuccess,
];

/** "What happens next?" — illustrated steps (mockup `.milestone` style). Copy from the `admissions` messages. */
export function NextSteps({
  steps,
  stepLabel,
}: {
  steps: { title: string; detail: string }[];
  /** "Step {number}" template. */
  stepLabel: string;
}) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="flex items-center gap-4 rounded-r-control border-l-[3px] border-gold bg-surface p-3"
        >
          <Art asset={STEP_ART[index % STEP_ART.length]} className="block w-20 shrink-0" rounded />
          <span className="min-w-0">
            <span aria-hidden="true" className="block text-xs font-extrabold uppercase tracking-wide text-blue">
              {format(stepLabel, { number: index + 1 })}
            </span>
            <span className="block font-bold text-navy">{step.title}</span>
            <span className="block text-sm text-muted">{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
