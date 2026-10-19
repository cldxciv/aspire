import type { Metadata } from "next";
import { FacultyGrid } from "@/components/faculty/FacultyGrid";
import { CtaBand } from "@/components/home/CtaBand";
import {
  AspireImage,
  ButtonLink,
  DemoBadge,
  EmptyState,
  Notice,
  PageHero,
  Section,
  SectionHeading,
} from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { getCentres, getFaculty, isPlaceholder } from "@/lib/data";

export const metadata: Metadata = {
  title: "Faculty",
  description:
    "Meet the subject faculty and mentors at Aspire IIT & Medical's campuses in Himachal Pradesh. Profiles are published once Aspire has verified them.",
  alternates: { canonical: "/faculty" },
};

export default async function FacultyPage() {
  const [faculty, centres] = await Promise.all([getFaculty(), getCentres()]);
  const centreNames = Object.fromEntries(centres.map((centre) => [centre.slug, centre.name]));
  const leads = faculty.filter((member) => member.seniorLead);
  const others = faculty.filter((member) => !member.seniorLead);
  const hasDemo = faculty.some(isPlaceholder);

  return (
    <>
      <PageHero
        title="Faculty and mentors"
        lead={
          <>
            <p>The subject teachers and mentors who lead classes, doubt sessions and test reviews at each campus.</p>
            {hasDemo && <DemoBadge className="mt-3" />}
          </>
        }
        crumbs={[{ label: "Faculty" }]}
      >
        <ButtonLink href="/admissions#enquiry">Book a counselling session</ButtonLink>
        <ButtonLink href="/centres" variant="outline">
          Find a campus
        </ButtonLink>
      </PageHero>

      {faculty.length === 0 ? (
        <Section aria-labelledby="faculty-empty-title">
          <h2 id="faculty-empty-title" className="sr-only">
            Faculty profiles
          </h2>
          <EmptyState
            title="Faculty profiles will be published after verification"
            description="Aspire is confirming each teacher's details before they appear here. A counsellor can tell you about the faculty at your preferred campus."
            action={<ButtonLink href="/admissions#enquiry">Talk to a counsellor</ButtonLink>}
          />
        </Section>
      ) : (
        <>
          <Section aria-labelledby={leads.length > 0 ? "faculty-leads-title" : "faculty-all-title"}>
            {hasDemo && (
              <Notice variant="warning" title="Demo profiles — pending verification" className="mb-8">
                These profiles were imported from Aspire&apos;s demo site for review. Names, credentials, experience and
                profile text, including any results mentioned in it, have not yet been verified by Aspire.
              </Notice>
            )}
            <SectionHeading
              id={leads.length > 0 ? "faculty-leads-title" : "faculty-all-title"}
              eyebrow="Teaching team"
              title={leads.length > 0 ? "Senior faculty leads" : "Our faculty"}
              description="Each profile lists the subject, credentials and home campus. Open a profile for the full introduction."
              action={
                // Feature icon (crop hides its baked-in caption): 80px, under its 96px maxWidth.
                <span className="hidden md:block">
                  <AspireImage asset={aspireAssets.iconExpertFaculty} className="w-20" rounded />
                </span>
              }
            />
            <FacultyGrid members={leads.length > 0 ? leads : others} centreNames={centreNames} />
          </Section>

          {leads.length > 0 && others.length > 0 && (
            <Section tone="surface" aria-labelledby="faculty-campus-title">
              <SectionHeading
                id="faculty-campus-title"
                title="Campus faculty"
                description="Subject teachers based at individual campuses."
              />
              <FacultyGrid members={others} centreNames={centreNames} />
            </Section>
          )}
        </>
      )}

      <Section
        tone={faculty.length > 0 && leads.length > 0 && others.length > 0 ? "white" : "surface"}
        aria-labelledby="faculty-cta-title"
      >
        <CtaBand
          headingId="faculty-cta-title"
          title="Want to meet the teachers?"
          description="Book a counselling session to ask about faculty, batches and doubt-clearing support at your preferred campus."
          primary={{ label: "Book counselling", href: "/admissions#enquiry" }}
          secondary={{ label: "Contact Aspire", href: "/contact" }}
        />
      </Section>
    </>
  );
}
