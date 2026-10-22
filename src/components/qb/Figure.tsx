import type { QbFigureRef } from "@/lib/qb/types";

import { figureUrl, scaledSize } from "./qb-render";

/**
 * A question figure (owner: QB-CORE-A; §B12): a raster image (PNG, JPEG or WebP, ≤ 700 px wide) served
 * by `/api/qb/figures/<id>` (approved versions only) or, for staff, `/api/admin/qb/figures/<id>`
 * (drafts included). Works in server and client components (no hooks).
 */
export function QbFigure({
  figure,
  locale,
  index,
  staff = false,
  maxWidth = 700,
  className,
}: {
  figure: QbFigureRef;
  locale: "en" | "hi";
  /** The figure's number in its field ([fig:N]), for the fallback text alternative. */
  index?: number;
  staff?: boolean;
  maxWidth?: number;
  className?: string;
}) {
  const src = figureUrl(figure.id, { staff });
  // Never an empty alt: figures often carry the question, so a missing description still announces
  // "Figure N" / "चित्र N" rather than hiding the image from screen readers.
  const fallback = `${locale === "hi" ? "चित्र" : "Figure"}${index ? ` ${index}` : ""}`;
  const alt = (figure.alt?.[locale] ?? "").trim() || (figure.alt?.en ?? "").trim() || fallback;
  if (!src) {
    return (
      <span className="inline-block rounded border border-dashed border-line px-2 py-1 text-sm text-muted" role="img" aria-label={alt}>
        {alt}
      </span>
    );
  }
  const size = scaledSize(figure.width, figure.height, maxWidth);
  return (
    // Figures are pre-sized rasters with immutable caching on our own route; next/image would only
    // re-encode them, so a plain <img> with explicit dimensions is used.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size.width}
      height={size.height}
      loading="lazy"
      decoding="async"
      className={className ?? "my-2 block h-auto max-w-full rounded border border-line bg-white"}
    />
  );
}
