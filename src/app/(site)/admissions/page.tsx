import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { NextSteps } from "@/components/admissions/NextSteps";
import { ScholarshipPanel } from "@/components/admissions/ScholarshipPanel";
import { FaqList } from "@/components/faq/FaqList";
import { EnquiryForm } from "@/components/forms/EnquiryForm";
import { DownloadList } from "@/components/resources/DownloadList";
import {
  ButtonLink,
  Card,
  DemoBadge,
  EmptyState,
  Notice,
  PageHero,
  Section,
  SectionHeading,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { getCentres, getFaqs, getInstituteProfile, isPlaceholder } from "@/lib/data";
import type { DownloadItem } from "@/lib/types";

export const metadata: Metadata = {
  title: "Admissions",
  description:
    "Start an admissions enquiry with Aspire IIT & Medical for IIT JEE, NEET, Foundation or integrated programs, and see what happens next.",
  alternates: { canonical: "/admissions" },
};

// Downloads relevant to admissions, in display order: the prospectus, then the
// Brain of Himachal (BOH) scholarship-test papers. The full list is on /resources.
const ADMISSION_DOWNLOAD_CATEGORIES = ["Brochure", "BOH Paper"];

function admissionDownloads(downloads: DownloadItem[]): DownloadItem[] {
  return ADMISSION_DOWNLOAD_CATEGORIES.flatMap((category) => downloads.filter((d) => d.category === category));
}

export default async function AdmissionsPage() {
  const [centres, faqs, profile] = await Promise.all([getCentres(), getFaqs("admissions"), getInstituteProfile()]);

  // Preferred-centre options from the visible campuses (slug values satisfy the enquiry contract, D-016).
  const centreOptions = centres.map((centre) => ({
    value: centre.slug,
    label: isPlaceholder(centre) ? `${centre.name} (verify availability)` : centre.name,
  }));
  const demoCentres = centres.some(isPlaceholder);

  const demoProfile = profile !== null && isPlaceholder(profile);
  const scholarships = profile?.milestones.filter((milestone) => /scholarship/i.test(milestone.title)) ?? [];
  const downloads = admissionDownloads(profile?.downloads ?? []);
  const showPlanning = scholarships.length > 0 || downloads.length > 0;

  return (
    <>
      <PageHero
        title="Start your Aspire journey"
        lead="Tell us about the student's goals. An enquiry is the first step — the admissions team can then guide you through counselling and the next stages."
        crumbs={[{ label: "Admissions" }]}
      />

      <Section>
        <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card id="enquiry" className="scroll-mt-24 p-5 md:p-7">
            <h2 className="text-2xl font-extrabold tracking-tight text-navy">Admission enquiry</h2>
            <p className="mb-5 mt-1.5 text-sm text-muted">
              A short first step. Sending an enquiry is not an application — the formal admission process is confirmed
              by Aspire.
            </p>
            {demoCentres && (
              <p className="-mt-2 mb-5 flex flex-wrap items-center gap-2 text-xs text-muted">
                <DemoBadge />
                <span>The campus options below are demo data pending verification.</span>
              </p>
            )}
            <EnquiryForm variant="admissions" centreOptions={centreOptions} />
          </Card>

          <Card className="p-5 md:p-7">
            <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-navy">What happens next?</h2>
            <NextSteps />
            <p className="mt-3 text-xs text-muted">These steps are indicative; Aspire will confirm the exact process.</p>
            <Notice variant="warning" title="Scholarships, fees and documents" className="mt-5">
              Scholarship eligibility, fee schedules, document requirements and admission decisions are confirmed by
              Aspire directly. They are not published on this website yet.
            </Notice>
            <ButtonLink href="/centres" variant="outline" className="mt-5 w-full">
              Explore centres <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>
          </Card>
        </div>
      </Section>

      {showPlanning && (
        <Section tone="surface">
          <div
            className={cn(
              "grid items-start gap-6",
              scholarships.length > 0 && downloads.length > 0 && "lg:grid-cols-[0.8fr_1.2fr]",
            )}
          >
            {scholarships.length > 0 && (
              <ScholarshipPanel headingId="scholarships-heading" items={scholarships} demo={demoProfile} />
            )}
            {downloads.length > 0 && (
              <div>
                <SectionHeading
                  id="admission-downloads-heading"
                  eyebrow="Downloads"
                  title="Prospectus and scholarship-test papers"
                  description="Not available to download yet — the files will be added once Aspire approves them."
                  action={
                    <ButtonLink href="/resources#downloads" variant="outline">
                      All downloads <ArrowRight aria-hidden="true" className="size-4" />
                    </ButtonLink>
                  }
                />
                <DownloadList downloads={downloads} demo={demoProfile} columns={2} />
              </div>
            )}
          </div>
        </Section>
      )}

      <Section
        tone={showPlanning ? "white" : "surface"}
        id="faqs"
        aria-labelledby="admissions-faqs-heading"
        className="scroll-mt-24"
      >
        <SectionHeading
          id="admissions-faqs-heading"
          eyebrow="Admissions"
          title="Frequently asked questions"
          description="Quick answers about enquiries, counselling and scholarships."
        />
        {faqs.length > 0 ? (
          <FaqList faqs={faqs} className="max-w-3xl" />
        ) : (
          <EmptyState
            title="Answers are being prepared"
            description="Admissions FAQs will be published here once Aspire has reviewed them. You can ask your question using the enquiry form above."
          />
        )}
      </Section>
    </>
  );
}
