import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { ResultCard } from "@/lib/data";
import { ResultCardMosaic, type ResultCardMosaicVariant } from "./ResultCardMosaic";

/**
 * Alternates card lists (a₀, b₀, a₁, b₁, …), then appends the rest of the longer list: mixes the
 * newest JEE and NEET cards (getResultCards() sorts by year only, so the newest year would
 * otherwise fill a mosaic with one exam).
 */
export function interleaveCards(...lists: ResultCard[][]): ResultCard[] {
  const out: ResultCard[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) for (const list of lists) if (i < list.length) out.push(list[i]);
  return out;
}

/**
 * Result-card media (D-031) for a photo box whose shape changes at `lg`, such as BleedSplit's
 * half-bleed column (16:10 / 2:1 strip below `lg`, about square from `lg`) or the results page's
 * sticky column. Two filling ResultCardMosaics over the same `cards`: `base` below `lg`, `lg` from
 * `lg`. The other one is `display: none`, so it is out of the accessibility tree and its lazy images
 * never load. Place it in a positioned box (BleedSplit `media`, MediaSplit `media`).
 *
 * Returns null when there is no card (production today: getResultCards() is empty until consent is
 * recorded), so the caller shows its non-nature fallback photo in the same box instead.
 * Never pass it to a slot beside a specific centre, campus or hostel.
 */
export async function resultMosaicMedia({
  locale,
  cards,
  base = "4x2",
  lg = "3x3",
  seeAllHref,
}: {
  locale: Locale;
  /** Cards from getResultCards(); each mosaic shows as many as its cells allow. */
  cards: ResultCard[];
  /** Variant below `lg` (match the box: 2:1 → "4x2"). */
  base?: ResultCardMosaicVariant;
  /** Variant from `lg` (match the box: about 1:1 → "3x3", 4:3 → "4x3"). */
  lg?: ResultCardMosaicVariant;
  /** As ResultCardMosaic: default the localised /results; null hides the "See all results" tile. */
  seeAllHref?: string | null;
}): Promise<ReactNode | null> {
  if (cards.length === 0) return null;
  if (base === lg) return ResultCardMosaic({ locale, fill: true, variant: lg, cards, seeAllHref });
  const [small, large] = await Promise.all([
    ResultCardMosaic({ locale, fill: true, variant: base, cards, seeAllHref }),
    ResultCardMosaic({ locale, fill: true, variant: lg, cards, seeAllHref }),
  ]);
  return (
    <>
      <div className="absolute inset-0 lg:hidden">{small}</div>
      <div className="absolute inset-0 max-lg:hidden">{large}</div>
    </>
  );
}
