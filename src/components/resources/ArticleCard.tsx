import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge, Card, DemoBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Article } from "@/lib/types";
import { ARTICLE_CATEGORY_LABELS, formatIsoDate } from "./format";

/** Article cards sit in 1 / 2 / 3 column grids inside the 1200px container. */
const THUMBNAIL_SIZES = "(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw";

/**
 * Article summary card. The title link covers the whole card (stretched link).
 * `coverImage`, when present, is a fixed 16:9 thumbnail (no layout shift). It is
 * decorative here (alt="") because the title and summary carry the meaning; the
 * article page shows it with its full alt text.
 */
export function ArticleCard({
  article,
  headingLevel: Heading = "h3",
  className,
}: {
  article: Article;
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  const { coverImage } = article;

  return (
    <Card interactive className={cn("group relative flex h-full flex-col", className)}>
      {coverImage && (
        <div className="relative aspect-video overflow-hidden bg-blue-soft">
          <Image
            src={coverImage.src}
            alt=""
            fill
            sizes={THUMBNAIL_SIZES}
            className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{ARTICLE_CATEGORY_LABELS[article.category]}</Badge>
          {article.status === "placeholder" && <DemoBadge />}
        </div>
        <Heading className="mt-3 text-lg font-extrabold leading-snug text-navy">
          <Link
            href={`/resources/${article.slug}`}
            className="after:absolute after:inset-0 after:rounded-card hover:text-blue focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-offset-[-3px] focus-visible:after:outline-blue"
          >
            {article.title}
          </Link>
        </Heading>
        <p className="mt-1.5 flex-1 text-sm text-muted">{article.summary}</p>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
          <time dateTime={article.publishedAt}>{formatIsoDate(article.publishedAt)}</time>
          <span aria-hidden="true" className="inline-flex items-center gap-1 font-extrabold text-blue">
            Read <ArrowRight className="size-3.5" />
          </span>
        </div>
      </div>
    </Card>
  );
}
