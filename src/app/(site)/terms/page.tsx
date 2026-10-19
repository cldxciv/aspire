import type { Metadata } from "next";
import { LegalDocument, ToBeConfirmed, type LegalSectionContent } from "@/components/legal/LegalDocument";
import { PageHero, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Draft terms of use for the Aspire IIT & Medical website, pending review by Aspire and legal counsel.",
  alternates: { canonical: "/terms" },
};

// Neutral skeleton only. No legal entity, address, jurisdiction or obligation is stated
// until Aspire and its legal counsel supply approved text.
const OUTLINE: { id: string; title: string; covers: string }[] = [
  { id: "about", title: "About these terms", covers: "who operates this website and when these terms apply." },
  { id: "using-the-website", title: "Using this website", covers: "acceptable use of the website and its forms." },
  {
    id: "information",
    title: "Information on this website",
    covers: "how program, centre, admissions and results information is prepared, verified and updated.",
  },
  { id: "enquiries", title: "Enquiries and admissions", covers: "how enquiries sent through this website are handled." },
  { id: "portals", title: "Student and parent portals", covers: "access to portal services, if and when they become available." },
  { id: "intellectual-property", title: "Intellectual property", covers: "ownership and permitted use of website content." },
  { id: "links", title: "Links to other websites", covers: "links to websites that Aspire does not control." },
  { id: "liability", title: "Liability", covers: "the limits of responsibility for use of this website." },
  { id: "governing-law", title: "Governing law", covers: "which laws apply to these terms." },
  { id: "changes", title: "Changes to these terms", covers: "how and when these terms may be updated." },
  { id: "contact", title: "Contact", covers: "how to ask questions about these terms." },
];

const sections: LegalSectionContent[] = OUTLINE.map(({ id, title, covers }) => ({
  id,
  title,
  body: (
    <p>
      <span className="text-muted">This section will cover {covers}</span> <ToBeConfirmed />
    </p>
  ),
}));

export default function TermsPage() {
  return (
    <>
      <PageHero
        title="Terms of use"
        lead="The terms that will apply to using this website."
        crumbs={[{ label: "Terms of use" }]}
      />
      <Section>
        <LegalDocument sections={sections} />
      </Section>
    </>
  );
}
