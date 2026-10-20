import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge, Card, DemoBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import enResources from "@/i18n/messages/en/resources";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { Article } from "@/lib/types";
import { formatIsoDate } from "./format";

/** Article cards sit in 1 / 2 / 3 column grids inside the 1200px container. */
const THUMBNAIL_SIZES = "(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw";
/** `wide` cards sit two across. */
const WIDE_THUMBNAIL_SIZES = "(min-width: 1200px) 580px, (min-width: 640px) 50vw, 100vw";

/**
 * Article summary card. The title link covers the whole card (stretched link).
 * `coverImage`, when present, is a fixed 16:9 thumbnail (no layout shift). It is
 * decorative here (alt="") because the title and summary carry the meaning; the
 * article page shows it with its full alt text.
 *
 * Localisation (D-028): pass `locale` (link prefix) plus `messages={getMessages("resources").card}`
 * and `demoLabel={common.labels.demoPending}`; `imageLabel={common.labels.illustrativeStockPhoto}` adds the
 * visible label on stock covers (D-030). Defaults are English, so existing callers keep working.
 * `wide` (cards two across) uses a taller 16:10 cover.
 */
export function ArticleCard({
  article,
  headingLevel: Heading = "h3",
  locale = "en",
  messages = enResources.card,
  demoLabel,
  imageLabel,
  wide = false,
  className,
}: {
  article: Article;
  headingLevel?: "h2" | "h3";
  locale?: Locale;
  messages?: Messages<"resources">["card"];
  demoLabel?: string;
  /** Visible label on the cover thumbnail, e.g. "Illustrative stock photo". */
  imageLabel?: string;
  wide?: boolean;
  className?: string;
}) {
  const { coverImage } = article;

  return (
    <Card interactive className={cn("group relative flex h-full flex-col", className)}>
      {coverImage && (
        <div className={cn("relative overflow-hidden bg-blue-soft", wide ? "aspect-16/10" : "aspect-video")}>
          <Image
            src={coverImage.src}
            alt=""
            fill
            sizes={wide ? WIDE_THUMBNAIL_SIZES : THUMBNAIL_SIZES}
            className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
          />
          {imageLabel && (
            <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
              {imageLabel}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{messages.categories[article.category]}</Badge>
          {article.status === "placeholder" && <DemoBadge label={demoLabel} />}
        </div>
        <Heading className="mt-3 text-lg font-extrabold leading-snug text-navy">
          <Link
            href={localePath(`/resources/${article.slug}`, locale)}
            className="after:absolute after:inset-0 after:rounded-card hover:text-blue focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-offset-[-3px] focus-visible:after:outline-blue"
          >
            {article.title}
          </Link>
        </Heading>
        <p className="mt-1.5 flex-1 text-sm text-muted">{article.summary}</p>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
          <time dateTime={article.publishedAt}>{formatIsoDate(article.publishedAt, messages.months)}</time>
          <span aria-hidden="true" className="inline-flex items-center gap-1 font-extrabold text-blue">
            {messages.read} <ArrowRight className="size-3.5" />
          </span>
        </div>
      </div>
    </Card>
  );
}
