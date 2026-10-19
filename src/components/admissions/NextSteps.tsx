import { Art } from "@/components/about/Art";
import { aspireAssets, type AspireAsset } from "@/content/aspire-assets";

// Indicative process from the mockup — Aspire must confirm the real steps (docs/content-verification.md).
// Illustrations are decorative (empty alt) and sit beside no names.
const STEPS: { title: string; detail: string; art: AspireAsset }[] = [
  { title: "Enquiry", detail: "The admissions team reviews your request.", art: aspireAssets.illustrationGoal },
  {
    title: "Counselling",
    detail: "Discuss the learner's goals and suitable programs.",
    art: aspireAssets.illustrationJourney,
  },
  {
    title: "Application",
    detail: "Complete the institute's approved admission steps.",
    art: aspireAssets.illustrationGrowth,
  },
  {
    title: "Decision and enrolment",
    detail: "Follow the instructions Aspire confirms with you.",
    art: aspireAssets.graduationSuccess,
  },
];

/** "What happens next?" — four illustrated steps (mockup `.milestone` style). */
export function NextSteps() {
  return (
    <ol className="space-y-3">
      {STEPS.map((step, index) => (
        <li
          key={step.title}
          className="flex items-center gap-4 rounded-r-control border-l-[3px] border-gold bg-surface p-3"
        >
          <Art asset={step.art} className="block w-20 shrink-0" rounded />
          <span className="min-w-0">
            <span aria-hidden="true" className="block text-xs font-extrabold uppercase tracking-wide text-blue">
              Step {index + 1}
            </span>
            <span className="block font-bold text-navy">{step.title}</span>
            <span className="block text-sm text-muted">{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
