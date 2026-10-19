import { Card, DemoBadge, Section, SectionHeading } from "@/components/ui";
import { Pill } from "./Pill";
import { TextLink } from "./TextLink";

/**
 * Prompts describing the testimonials Aspire could publish — not quotes. Shown
 * only when showPlaceholderContent() is true, each DEMO-labelled. Real
 * testimonials need written consent and attribution (docs/content-verification.md).
 */
const PROMPTS = [
  {
    perspective: "Parent perspective",
    prompt: "Add an approved parent testimonial describing the support their family received.",
    label: "Parent testimonial",
    status: "Awaiting consent and verification",
  },
  {
    perspective: "Student journey",
    prompt: "Share a real student's experience of teaching, practice and mentorship.",
    label: "Student story",
    status: "Awaiting consent and verification",
  },
  {
    perspective: "Faculty perspective",
    prompt: "Explain Aspire's teaching philosophy in the words of an approved faculty member.",
    label: "Faculty voice",
    status: "Awaiting approval",
  },
];

export function TestimonialPrompts() {
  return (
    <Section aria-labelledby="home-voices-title">
      <SectionHeading
        id="home-voices-title"
        title="What families value"
        description="Genuine feedback will be published only with consent and appropriate attribution."
        action={<TextLink href="/about">About Aspire</TextLink>}
      />
      <ul className="grid gap-4 md:grid-cols-3">
        {PROMPTS.map((item) => (
          <li key={item.label}>
            <Card className="flex h-full flex-col p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill>{item.perspective}</Pill>
                <DemoBadge label="Demo prompt" />
              </div>
              <h3 className="mt-4 text-sm font-bold text-navy">{item.label}</h3>
              <p className="mt-1 flex-1 text-sm italic text-[#43556d]">{item.prompt}</p>
              <p className="mt-4 text-[11px] font-semibold text-muted">{item.status}</p>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
