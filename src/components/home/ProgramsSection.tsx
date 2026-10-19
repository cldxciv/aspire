import { ButtonLink, EmptyState, Section, SectionHeading, type SectionTone } from "@/components/ui";
import type { Program } from "@/lib/types";
import { HomeProgramCard } from "./HomeProgramCard";
import { TextLink } from "./TextLink";

export function ProgramsSection({ programs, tone = "white" }: { programs: Program[]; tone?: SectionTone }) {
  return (
    <Section tone={tone} aria-labelledby="home-programs-title">
      <SectionHeading
        id="home-programs-title"
        title="Find the right program for you"
        description="Structured learning for every stage of your academic journey."
        action={<TextLink href="/programs">Explore all programs</TextLink>}
      />
      {programs.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {programs.map((program) => (
            <li key={program.id}>
              <HomeProgramCard program={program} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Program details are being finalised"
          description="Programs will be listed here once confirmed by Aspire. A counsellor can help in the meantime."
          action={<ButtonLink href="/admissions#enquiry">Talk to a counsellor</ButtonLink>}
        />
      )}
    </Section>
  );
}
