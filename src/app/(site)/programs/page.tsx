import type { Metadata } from "next";
import { CtaBand } from "@/components/home/CtaBand";
import { ProgramDirectory } from "@/components/programs/ProgramDirectory";
import { ButtonLink, EmptyState, Notice, PageHero, Section, SectionHeading } from "@/components/ui";
import { getPrograms, isPlaceholder } from "@/lib/data";

export const metadata: Metadata = {
  title: "Programs",
  description:
    "Explore Aspire's IIT JEE, NEET, Foundation and integrated school programs, and speak with an academic counsellor about the right pathway.",
  alternates: { canonical: "/programs" },
};

export default async function ProgramsPage() {
  const programs = await getPrograms();
  const hasPlaceholders = programs.some(isPlaceholder);

  return (
    <>
      <PageHero
        title="Programs built around your goals"
        lead="Explore course pathways and speak with an academic counsellor before choosing a program."
        crumbs={[{ label: "Programs" }]}
      />
      <Section aria-labelledby="programs-title">
        <SectionHeading
          id="programs-title"
          title="Choose a pathway"
          description={
            programs.length > 0
              ? "Filter by exam, then open a program for its class level, schedule and highlights."
              : undefined
          }
        />
        {hasPlaceholders && (
          <Notice className="mb-6">
            Programs marked DEMO are sample listings imported from Aspire&apos;s demo site. Class levels, durations,
            timings and batch sizes are pending verification by Aspire.
          </Notice>
        )}
        {programs.length > 0 ? (
          <ProgramDirectory programs={programs} />
        ) : (
          <EmptyState
            title="Program details are being finalised"
            description="Programs will be listed here once confirmed by Aspire. A counsellor can help in the meantime."
            action={<ButtonLink href="/admissions#enquiry">Talk to a counsellor</ButtonLink>}
          />
        )}
        <Notice variant="warning" className="mt-8">
          Course availability, classes, batch dates, fees and delivery modes are confirmed by Aspire. Please check
          current details with a counsellor before choosing a program.
        </Notice>
      </Section>
      <Section tone="surface" aria-labelledby="programs-cta-title">
        <CtaBand
          headingId="programs-cta-title"
          title="Not sure which program fits?"
          description="Book a counselling session to talk through the learner's goals, class and preferred centre."
          primary={{ label: "Book counselling", href: "/admissions#enquiry" }}
          secondary={{ label: "Contact Aspire", href: "/contact" }}
        />
      </Section>
    </>
  );
}
