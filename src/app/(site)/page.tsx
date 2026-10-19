import type { Metadata } from "next";
import { CentreDiscovery } from "@/components/home/CentreDiscovery";
import { CtaBand } from "@/components/home/CtaBand";
import { HighlightStrip } from "@/components/home/HighlightStrip";
import { HomeHero } from "@/components/home/HomeHero";
import { ProgramsSection } from "@/components/home/ProgramsSection";
import { ResultsFeature } from "@/components/home/ResultsFeature";
import { StorySection } from "@/components/home/StorySection";
import { TestimonialPrompts } from "@/components/home/TestimonialPrompts";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { WhyAspire } from "@/components/home/WhyAspire";
import { AspireImage, Section } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { aspireAssets } from "@/content/aspire-assets";
import { showPlaceholderContent } from "@/lib/content-mode";
import {
  getCentres,
  getFeaturedResults,
  getInstituteProfile,
  getPrograms,
  getResults,
  getStats,
  getTestimonials,
} from "@/lib/data";

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} — IIT JEE, NEET & Foundation coaching in ${siteConfig.region}` },
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [programs, featuredResults, centres, stats, profile, testimonials] = await Promise.all([
    getPrograms(),
    getFeaturedResults(),
    getCentres(),
    getStats("headline"),
    getInstituteProfile(),
    getTestimonials(),
  ]);
  // Fall back to the newest visible results if none is marked as featured.
  const results = featuredResults.length > 0 ? featuredResults : (await getResults()).slice(0, 4);

  // Without verified content, the story and testimonial blocks exist only as DEMO prompts (D-005).
  const showDemoSections = showPlaceholderContent();
  const showApproach = Boolean(profile && profile.approach.length > 0);
  const milestones = profile?.milestones ?? [];
  const showStory = milestones.length > 0 || showDemoSections;
  const showVoices = testimonials.length > 0 || showDemoSections;
  // Sections alternate white / surface around the navy results band; the CTA continues the rhythm.
  const ctaTone = showVoices ? "surface" : showStory ? "white" : "surface";

  return (
    <>
      <HomeHero profile={profile} />
      <HighlightStrip stats={stats} />
      <ProgramsSection programs={programs} tone="white" />
      {profile && showApproach && <WhyAspire profile={profile} tone="surface" />}
      <ResultsFeature results={results} />
      <CentreDiscovery centres={centres} tone="white" />
      {showStory && (
        <StorySection
          milestones={milestones}
          demo={milestones.length === 0 || profile?.status !== "published"}
          tone="surface"
        />
      )}
      {testimonials.length > 0 ? (
        <TestimonialsSection testimonials={testimonials} tone="white" />
      ) : (
        showDemoSections && <TestimonialPrompts />
      )}
      <Section aria-labelledby="home-cta-title" tone={ctaTone}>
        <CtaBand
          headingId="home-cta-title"
          title="Ready to take your next step?"
          description="Talk to the academic team and explore the right program for your goals."
          primary={{ label: "Apply / Enquire", href: "/admissions#enquiry" }}
          secondary={{ label: "Contact Aspire", href: "/contact" }}
          media={<AspireImage asset={aspireAssets.heroStudents} alt="" rounded className="shadow-soft" />}
        />
      </Section>
    </>
  );
}
