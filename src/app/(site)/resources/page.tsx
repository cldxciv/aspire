import type { Metadata } from "next";
import { CtaBand } from "@/components/about/CtaBand";
import { ArticleCard } from "@/components/resources/ArticleCard";
import { DownloadList } from "@/components/resources/DownloadList";
import { ResourceCategories } from "@/components/resources/ResourceCategories";
import { ButtonLink, EmptyState, PageHero, Section, SectionHeading } from "@/components/ui";
import { getArticles, getInstituteProfile, isPlaceholder } from "@/lib/data";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Study guidance, exam preparation articles and admissions help for IIT JEE, NEET and Foundation students from Aspire IIT & Medical.",
  alternates: { canonical: "/resources" },
};

export default async function ResourcesPage() {
  const [articles, profile] = await Promise.all([getArticles(), getInstituteProfile()]);
  // Downloads belong to the institute profile (placeholder until Aspire verifies it; null in production).
  const downloads = profile?.downloads ?? [];
  const hasDownloads = downloads.length > 0;

  return (
    <>
      <PageHero
        title="Resources for the next step"
        lead="Study guidance, exam information and answers to common admissions questions."
        crumbs={[{ label: "Resources" }]}
      />

      <Section aria-labelledby="resource-types-heading">
        <SectionHeading
          id="resource-types-heading"
          title="Find what you need"
          description="Guidance for students and families at every stage of preparation."
        />
        <ResourceCategories articleCount={articles.length} downloadCount={downloads.length} />
      </Section>

      {profile && hasDownloads && (
        <Section tone="surface" id="downloads" aria-labelledby="downloads-heading" className="scroll-mt-24">
          <SectionHeading
            id="downloads-heading"
            eyebrow="Downloads"
            title="Planners, papers and prospectus"
            description="These files are not available to download yet. They will be added here once Aspire has approved them."
          />
          <DownloadList downloads={downloads} demo={isPlaceholder(profile)} />
        </Section>
      )}

      <Section
        tone={hasDownloads ? "white" : "surface"}
        id="articles"
        aria-labelledby="articles-heading"
        className="scroll-mt-24"
      >
        <SectionHeading
          id="articles-heading"
          eyebrow="Articles"
          title="Study guidance and updates"
          description="Articles are published here after review by Aspire."
        />
        {articles.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <li key={article.id}>
                <ArticleCard article={article} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No articles published yet"
            description="Study guidance and exam updates will appear here once Aspire's academic team has approved them."
            action={
              <ButtonLink href="/contact" variant="outline">
                Ask a question
              </ButtonLink>
            }
          />
        )}
      </Section>

      <Section tone={hasDownloads ? "surface" : "white"} aria-labelledby="resources-cta-heading">
        <CtaBand
          id="resources-cta-heading"
          title="Not sure where to start?"
          description="Talk to the academic team about the right program and preparation plan."
        />
      </Section>
    </>
  );
}
