import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { ArticleCard } from "@/components/resources/ArticleCard";
import { ButtonLink, Section, type SectionTone } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { localizeImage } from "@/lib/data";
import type { Article } from "@/lib/types";

const MAX_ARTICLES = 4;

/**
 * "Guidance for your journey" (plan §4.11): intro beside up to four ArticleCards (newest
 * first, as getArticles() returns them). ArticleCard adds its own DEMO badge to placeholder
 * articles. Returns null when no article is visible (production today).
 */
export function ResourcesTeaser({
  articles,
  locale,
  tone = "white",
}: {
  articles: Article[];
  locale: Locale;
  tone?: SectionTone;
}) {
  const shown = articles.slice(0, MAX_ARTICLES);
  if (shown.length === 0) return null;
  const t = messagesFor(locale, "home").resources;
  const cardMessages = messagesFor(locale, "resources").card;
  const { demoPending: demoLabel, illustrativeStockPhoto: imageLabel } = messagesFor(locale, "common").labels;
  const photo = localizeImage(stockImages.libraryAisle, locale);

  return (
    <Section tone={tone} aria-labelledby="home-resources-title">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] lg:gap-10">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue">{t.eyebrow}</p>
          <h2
            id="home-resources-title"
            className="mt-2 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight text-navy [&:lang(hi)]:leading-snug"
          >
            {t.title}
          </h2>
          <p className="mt-3 text-muted">{t.lead}</p>
          <ButtonLink href={localePath("/resources", locale)} variant="dark" className="mt-5">
            {t.cta} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
          {/* Labelled stock photo from `lg` (D-030). */}
          <figure className="relative m-0 mt-6 hidden aspect-4/3 overflow-hidden rounded-card bg-surface shadow-soft lg:block">
            <Image src={photo.src} alt={photo.alt} fill sizes="340px" className="object-cover" />
            <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
              {imageLabel}
            </span>
          </figure>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {shown.map((article) => (
            <li key={article.id}>
              <ArticleCard
                article={article}
                locale={locale}
                messages={cardMessages}
                demoLabel={demoLabel}
                imageLabel={imageLabel}
              />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
