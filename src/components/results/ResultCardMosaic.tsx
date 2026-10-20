import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { getResultCards, type ResultCard } from "@/lib/data";
import type { ExamTrack, ImageAsset } from "@/lib/types";
import { ResultCardTile } from "./ResultCardTile";

/** Columns × rows on `sm+` (and always in `fill` mode). */
export type ResultCardMosaicVariant = "2x3" | "3x3" | "4x2" | "4x3" | "6x2";

const VARIANTS: Record<
  ResultCardMosaicVariant,
  {
    cols: number;
    rows: number;
    /** Standalone grid: 2 columns on phones, the variant's columns from `sm` / `lg`. */
    grid: string;
    /** Below this breakpoint only the first 6 cells show (2 × 3); null = all cells at every width. */
    trimBelow: "sm" | "lg" | null;
    /** `fill` mode: exact columns and rows, so the grid matches the box it fills. */
    fillGrid: string;
    /** Box shape for a standalone fallback photo (cells are square). */
    aspect: string;
  }
> = {
  "2x3": { cols: 2, rows: 3, grid: "grid-cols-2", trimBelow: null, fillGrid: "grid-cols-2 grid-rows-3", aspect: "aspect-2/3" },
  "3x3": { cols: 3, rows: 3, grid: "grid-cols-2 sm:grid-cols-3", trimBelow: "sm", fillGrid: "grid-cols-3 grid-rows-3", aspect: "aspect-square" },
  "4x2": { cols: 4, rows: 2, grid: "grid-cols-2 sm:grid-cols-4", trimBelow: "sm", fillGrid: "grid-cols-4 grid-rows-2", aspect: "aspect-2/1" },
  "4x3": { cols: 4, rows: 3, grid: "grid-cols-2 sm:grid-cols-4", trimBelow: "sm", fillGrid: "grid-cols-4 grid-rows-3", aspect: "aspect-4/3" },
  "6x2": {
    cols: 6,
    rows: 2,
    grid: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
    trimBelow: "lg",
    fillGrid: "grid-cols-6 grid-rows-2",
    aspect: "aspect-3/1",
  },
};

/** Cells shown below `trimBelow` (2 columns × 3 rows). */
const PHONE_CELLS = 6;
const TRIM_CLASS = { sm: "max-sm:hidden", lg: "max-lg:hidden" } as const;

/**
 * A dense grid of result-card images from Aspire's previous batches (D-031), for image slots and
 * bands. Server component: it loads its own cards with getResultCards() unless `cards` is given.
 *
 * - **Visibility:** cards exist only where student names may be shown (preview / development with
 *   placeholder content, or granted consent). With no cards — production today — it renders
 *   `fallback`, else `fallbackImage` (filling the same box), else nothing. Every placeholder card
 *   carries the DEMO badge.
 * - **Layout:** `variant` is columns × rows. Standalone, the cells are square (2 columns on phones,
 *   up to 6 cells). With `fill` the grid absolutely fills the nearest positioned ancestor (e.g.
 *   MediaSplit's photo box via its `media` prop) with exactly `variant` cells — match the box: 1/1 →
 *   "3x3", 4/3 → "4x3", 3/4 → "2x3", 16/10 → "4x2", 3/1 → "6x2".
 * - **Link:** the last cell is a "See all results" tile linking to `seeAllHref` (default: the
 *   localised /results). Pass `seeAllHref={null}` to drop it (e.g. on /results itself).
 * - **a11y:** a labelled list; each card's alt names the student, college, exam and year; images
 *   are lazy unless `eager`.
 */
export async function ResultCardMosaic({
  locale,
  variant = "3x3",
  fill = false,
  cards,
  exam,
  year,
  seeAllHref,
  heading,
  fallback,
  fallbackImage,
  fallbackImageLabel,
  eager = false,
  sizes,
  className,
}: {
  locale: Locale;
  variant?: ResultCardMosaicVariant;
  /** Fill the nearest positioned ancestor (a fixed-aspect photo box) instead of sizing itself. */
  fill?: boolean;
  /** Cards to show (from getResultCards()); default: the most recent visible cards for exam/year. */
  cards?: ResultCard[];
  exam?: ExamTrack;
  year?: number;
  /** "See all results" target; default localePath("/results", locale); null hides the tile. */
  seeAllHref?: string | null;
  /** Render the `results.cards` title and lead above a standalone mosaic at this level (ignored with `fill`). */
  heading?: "h2" | "h3";
  /** Rendered instead when there is no visible card (e.g. the page's current photo). */
  fallback?: ReactNode;
  /** Shorthand fallback: this photo, filling the same box (`fill`) or the variant's shape. */
  fallbackImage?: ImageAsset;
  /** Visible label on the fallback photo, e.g. common.labels.illustrativeStockPhoto. */
  fallbackImageLabel?: string;
  /** Above the fold: load the images immediately. */
  eager?: boolean;
  /** Override the per-cell `sizes` hint. */
  sizes?: string;
  className?: string;
}) {
  const spec = VARIANTS[variant];
  const cells = spec.cols * spec.rows;
  const href = seeAllHref === null ? null : (seeAllHref ?? localePath("/results", locale));
  const cardSlots = href ? cells - 1 : cells;
  const shown = (cards ?? (await getResultCards({ exam, year, limit: cardSlots }, locale))).slice(0, cardSlots);

  if (shown.length === 0) {
    if (fallback !== undefined) return <>{fallback}</>;
    if (!fallbackImage) return null;
    return (
      <div className={cn(fill ? "absolute inset-0" : cn("relative overflow-hidden rounded-card bg-surface", spec.aspect), className)}>
        <Image
          src={fallbackImage.src}
          alt={fallbackImage.alt}
          fill
          sizes={fill ? "(min-width: 1200px) 560px, (min-width: 1024px) 46vw, 100vw" : "(min-width: 1280px) 1200px, 100vw"}
          className="object-cover"
        />
        {fallbackImageLabel && (
          <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
            {fallbackImageLabel}
          </span>
        )}
      </div>
    );
  }

  const t = messagesFor(locale, "results").cards;
  const demoLabel = messagesFor(locale, "common").labels.demo;
  const cellSizes =
    sizes ??
    (fill
      ? `(min-width: 1200px) ${Math.round(560 / spec.cols)}px, (min-width: 1024px) ${Math.round(46 / spec.cols)}vw, ${Math.round(100 / spec.cols)}vw`
      : `(min-width: 1280px) ${Math.round(1200 / spec.cols)}px, (min-width: 640px) ${Math.round(100 / spec.cols)}vw, 50vw`);
  const phoneCards = href ? PHONE_CELLS - 1 : PHONE_CELLS;
  // A filling mosaic sits inside someone else's box: no heading there.
  const HeadingTag = fill ? undefined : heading;

  const list = (
    <ul
      aria-label={t.listLabel}
      className={cn(
        "m-0 grid list-none p-0",
        fill ? cn("absolute inset-0 gap-1.5 bg-surface p-1.5", spec.fillGrid) : cn("gap-2 sm:gap-3", spec.grid),
        !HeadingTag && className,
      )}
    >
      {shown.map((card, index) => (
        <li
          key={card.id}
          className={cn(
            fill ? "min-h-0 min-w-0" : "aspect-square min-w-0",
            !fill && spec.trimBelow && index >= phoneCards && TRIM_CLASS[spec.trimBelow],
          )}
        >
          <ResultCardTile card={card} demoLabel={demoLabel} sizes={cellSizes} eager={eager} />
        </li>
      ))}
      {href && (
        <li className={fill ? "min-h-0 min-w-0" : "aspect-square min-w-0"}>
          <Link
            href={href}
            className="group flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-xl bg-navy p-2 text-center text-xs font-bold text-white transition-colors hover:bg-navy-2 focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-gold sm:text-sm"
          >
            <span>{t.seeAll}</span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 text-gold transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>
        </li>
      )}
    </ul>
  );

  if (!HeadingTag) return list;
  return (
    <div className={className}>
      <HeadingTag className="font-serif text-2xl font-bold text-navy">{t.title}</HeadingTag>
      <p className="mt-1 mb-4 text-sm text-muted">{t.lead}</p>
      {list}
    </div>
  );
}
