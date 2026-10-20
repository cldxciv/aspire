import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { richText } from "@/components/legal/rich-text";
import { ArticleCard } from "@/components/resources/ArticleCard";
import { formatIsoDate } from "@/components/resources/format";
import { articlePagePhotos } from "@/components/resources/hero-slides";
import {
  Badge,
  ButtonLink,
  Card,
  DemoBadge,
  PageHero,
  Section,
  SectionHeading,
  StickyMediaLayout,
} from "@/components/ui";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { getArticle, getArticles, getArticleSlugs } from "@/lib/data";
import type { Article } from "@/lib/types";

/** D-017: wait for the complete static render so notFound() yields a real 404 on the first request (see programs/[slug]). */
export const ensureStatic = "navigation";
export const instant = false;

export function generateStaticParams() {
  // getArticleSlugs() always returns ≥1 entry (Cache Components requirement); unknown slugs hit notFound().
  return getArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/resources/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [locale, t] = await Promise.all([getLocale(), getMessages("resources")]);
  const article = await getArticle(slug, locale);
  if (!article) return { title: t.article.notFoundTitle };
  return {
    title: article.seoTitle ?? article.title,
    description: article.seoDescription ?? article.summary,
    alternates: await localeAlternates(`/resources/${article.slug}`),
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

export default async function ArticlePage({ params }: PageProps<"/[lang]/resources/[slug]">) {
  const { slug } = await params;
  const [locale, t, tc] = await Promise.all([getLocale(), getMessages("resources"), getMessages("common")]);
  const article = await getArticle(slug, locale);
  if (!article) notFound();

  const related = relatedArticles(article, await getArticles(locale));
  const photoLabel = tc.labels.illustrativeStockPhoto;
  // Hero carousel: the article's cover (a licensed stock photo, alt already localised by getArticle;
  // a neutral fallback otherwise) first, then category photos; the sticky column gets two others.
  const photos = articlePagePhotos({ article, related, label: photoLabel, locale });
  const resourcesHref = localePath("/resources", locale);

  return (
    <>
      <PageHero
        title={article.title}
        lead={article.summary}
        crumbs={[{ label: t.hero.crumb, href: resourcesHref }, { label: article.title }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        slides={photos.slides}
        carouselLabels={tc.carousel}
      />

      {/* D-030: the article beside a sticky column of stock photos (left out below `lg`; the hero has photos). */}
      <Section>
        <StickyMediaLayout
          image={photos.sticky[0]}
          secondaryImage={photos.sticky[1]}
          imageLabel={photoLabel}
        >
          <article className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
              <Badge variant="info">{t.card.categories[article.category]}</Badge>
              {article.status === "placeholder" && <DemoBadge label={tc.labels.demoPending} />}
              <span>
                {richText(t.article.published, {
                  date: <time dateTime={article.publishedAt}>{formatIsoDate(article.publishedAt, t.card.months)}</time>,
                })}
              </span>
              {article.author && <span>{format(t.article.by, { author: article.author })}</span>}
            </div>

            {/* Body is plain text by contract — rendered as paragraphs, never as HTML. */}
            <div className="mt-6 max-w-prose space-y-4 text-[17px] leading-relaxed text-ink">
              {article.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <Link
              href={resourcesHref}
              className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-blue hover:underline"
            >
              <ArrowLeft aria-hidden="true" className="size-4" /> {t.article.allResources}
            </Link>
          </article>

          <aside aria-labelledby="article-cta-heading" className="mt-8">
            <Card tint="blue" className="p-5">
              <h2 id="article-cta-heading" className="text-lg font-extrabold leading-snug text-navy">
                {t.article.ctaTitle}
              </h2>
              <p className="mt-1.5 text-sm text-muted">{t.article.ctaBody}</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <ButtonLink href={localePath("/admissions#enquiry", locale)}>
                  {t.article.enquire} <ArrowRight aria-hidden="true" className="size-4" />
                </ButtonLink>
                <ButtonLink href={localePath("/programs", locale)} variant="outline">
                  {t.article.explorePrograms}
                </ButtonLink>
              </div>
            </Card>
          </aside>

          {/* Related reading stays in the text column, so the sticky photos run beside it too. */}
          {related.length > 0 && (
            <section aria-labelledby="related-heading" className="mt-12">
              <SectionHeading id="related-heading" title={t.article.related} className="mb-5" />
              <ul className={cn("grid gap-4", related.length > 1 && "sm:grid-cols-2")}>
                {related.map((item) => (
                  <li key={item.id}>
                    <ArticleCard
                      article={item}
                      locale={locale}
                      messages={t.card}
                      demoLabel={tc.labels.demoPending}
                      imageLabel={photoLabel}
                      wide={related.length === 1}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </StickyMediaLayout>
      </Section>
    </>
  );
}
