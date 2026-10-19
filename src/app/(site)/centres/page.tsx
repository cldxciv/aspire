import type { Metadata } from "next";
import { CentreDirectory } from "@/components/centres/CentreDirectory";
import { DistrictsServed } from "@/components/centres/DistrictsServed";
import { MapPanel } from "@/components/centres/MapPanel";
import { CtaBand } from "@/components/home/CtaBand";
import { ButtonLink, DemoBadge, EmptyState, PageHero, Section, SectionHeading } from "@/components/ui";
import { getCentres, getFaculty, getHostelInfo, isPlaceholder } from "@/lib/data";

export const metadata: Metadata = {
  title: "Centres",
  description:
    "Find an Aspire IIT & Medical centre in Himachal Pradesh. Addresses, phone numbers and opening hours are published only after verification.",
  alternates: { canonical: "/centres" },
};

export default async function CentresPage() {
  const [centres, faculty, hostelInfo] = await Promise.all([getCentres(), getFaculty(), getHostelInfo()]);
  const facultySlugs = faculty.map((member) => member.slug);
  const hostelSlugs = hostelInfo?.campuses.map((campus) => campus.centreSlug) ?? [];
  const servesListed = centres.some((centre) => (centre.servesDistricts ?? []).length > 0);

  return (
    <>
      <PageHero
        title="Find Aspire near you"
        lead="A centre directory for families across Himachal Pradesh. Only verified locations are published as confirmed centres."
        crumbs={[{ label: "Centres" }]}
      />

      <Section aria-labelledby="centre-directory-title">
        <SectionHeading
          id="centre-directory-title"
          title="Centre directory"
          description={
            centres.length > 0
              ? "Search by centre name or by the district you live in. Each campus lists its contact details, notes for families and facilities."
              : undefined
          }
        />
        {centres.length > 0 ? (
          <CentreDirectory centres={centres} facultySlugs={facultySlugs} hostelSlugs={hostelSlugs} />
        ) : (
          <EmptyState
            title="Verified centre locations will be listed here"
            description="Aspire is confirming centre addresses, contact numbers and opening hours. Contact the team for help finding the right centre."
            action={<ButtonLink href="/contact">Contact Aspire</ButtonLink>}
          />
        )}
      </Section>

      <Section tone="surface" aria-labelledby="centre-districts-title">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <SectionHeading
              id="centre-districts-title"
              title="Which campus serves your district?"
              description={
                servesListed
                  ? "Each campus desk handles admissions and counselling for the districts listed below."
                  : "District coverage will be listed here once Aspire confirms it."
              }
              action={servesListed && centres.some(isPlaceholder) ? <DemoBadge /> : undefined}
            />
            <DistrictsServed centres={centres} />
          </div>
          <aside aria-labelledby="centre-map-title" className="lg:self-start">
            <MapPanel headingId="centre-map-title" />
          </aside>
        </div>
      </Section>

      <Section aria-labelledby="centres-cta-title">
        <CtaBand
          headingId="centres-cta-title"
          title="Not sure which centre to choose?"
          description="Tell us where you are and what you're preparing for, and the admissions team can help."
          primary={{ label: "Book counselling", href: "/admissions#enquiry" }}
          secondary={{ label: "Contact Aspire", href: "/contact" }}
        />
      </Section>
    </>
  );
}
