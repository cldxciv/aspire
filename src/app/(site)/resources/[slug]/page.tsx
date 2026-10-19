import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/resources/ArticleCard";
import { ARTICLE_CATEGORY_LABELS, formatIsoDate } from "@/components/resources/format";
import { Badge, ButtonLink, Card, DemoBadge, PageHero, Section, SectionHeading } from "@/components/ui";
import { getArticle, getArticles, getArticleSlugs } from "@/lib/data";
import type { Article } from "@/lib/types";

/** D-017: wait for the complete static render so notFound() yields a real 404 on the first request (see programs/[slug]). */
export const ensureStatic = "navigation";
export const instant = false;

export function generateStaticParams() {
  // getArticleSlugs() always returns ≥1 entry (Cache Components requirement); unknown slugs hit notFound().
  return getArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/resources/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Article not found" };
  return {
    title: article.seoTitle ?? article.title,
    description: article.seoDescription ?? article.summary,
    alternates: { canonical: `/resources/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.seoTitle ?? article.title,
      description: article.seoDescription ?? article.summary,
      publishedTime: article.publishedAt,
    },
  };
}

/** Same-category articles first, then the most recent others. */
function relatedArticles(current: Article, all: Article[], limit = 3): Article[] {
  const others = all.filter((a) => a.id !== current.id);
  const sameCategory = others.filter((a) => a.category === current.category);
  const rest = others.filter((a) => a.category !== current.category);
  return [...sameCategory, ...rest].slice(0, limit);
}

export default async function ArticlePage({ params }: PageProps<"/resources/[slug]">) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const related = relatedArticles(article, await getArticles());

  return (
    <>
      <PageHero
        title={article.title}
        lead={article.summary}
        crumbs={[{ label: "Resources", href: "/resources" }, { label: article.title }]}
      />

      <Section>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
              <Badge variant="info">{ARTICLE_CATEGORY_LABELS[article.category]}</Badge>
              {article.status === "placeholder" && <DemoBadge />}
              <span>
                Published <time dateTime={article.publishedAt}>{formatIsoDate(article.publishedAt)}</time>
              </span>
              {article.author && <span>By {article.author}</span>}
            </div>

            {article.coverImage && (
              <Image
                src={article.coverImage.src}
                alt={article.coverImage.alt}
                width={article.coverImage.width}
                height={article.coverImage.height}
                sizes="(min-width: 1024px) 760px, 100vw"
                className="mt-6 h-auto w-full rounded-card border border-line"
              />
            )}

            {/* Body is plain text by contract — rendered as paragraphs, never as HTML. */}
            <div className="mt-6 max-w-prose space-y-4 text-[17px] leading-relaxed text-ink">
              {article.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <Link
              href="/resources"
              className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-blue hover:underline"
            >
              <ArrowLeft aria-hidden="true" className="size-4" /> All resources
            </Link>
          </article>

          <aside aria-labelledby="article-cta-heading" className="lg:sticky lg:top-24">
            <Card tint="blue" className="p-5">
              <h2 id="article-cta-heading" className="text-lg font-extrabold text-navy">
                Questions about a program?
              </h2>
              <p className="mt-1.5 text-sm text-muted">
                Talk to the admissions team about the right program and next steps for the student.
              </p>
              <div className="mt-4 flex flex-col gap-2.5">
                <ButtonLink href="/admissions#enquiry">
                  Enquire now <ArrowRight aria-hidden="true" className="size-4" />
                </ButtonLink>
                <ButtonLink href="/programs" variant="outline">
                  Explore programs
                </ButtonLink>
              </div>
            </Card>
          </aside>
        </div>
      </Section>

      {related.length > 0 && (
        <Section tone="surface" aria-labelledby="related-heading">
          <SectionHeading id="related-heading" title="Related resources" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <li key={item.id}>
                <ArticleCard article={item} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
