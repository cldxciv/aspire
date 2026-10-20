import Image from "next/image";
import { DemoBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ResultCard } from "@/lib/data";

/**
 * One result-card image (D-031) inside a mosaic or marquee cell: the card itself (photo, college
 * badge and name are part of the image; the alt text says the same), an exam/year chip and — for
 * placeholder records — the DEMO badge (D-005). Fills its cell; the cell sets the size, so there is
 * no layout shift. Server component; render only cards from getResultCards().
 *
 * `unoptimized` on purpose: the file comes from the gated GET /api/result-cards/[file]. The browser
 * fetches it directly (with the preview credentials, D-027), and no optimised copy is cached under
 * /_next/image, which the preview gate does not cover. The files are already ≤ 400 px webp.
 */
export function ResultCardTile({
  card,
  demoLabel,
  sizes,
  eager = false,
  decorative = false,
  className,
}: {
  card: ResultCard;
  /** `common.labels.demo`. */
  demoLabel: string;
  sizes: string;
  /** Above the fold: load immediately instead of lazily. */
  eager?: boolean;
  /** A visual duplicate (e.g. the marquee's second copy): empty alt, chips hidden from assistive tech. */
  decorative?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("@container relative h-full w-full overflow-hidden rounded-xl bg-white ring-1 ring-line", className)}>
      <Image
        src={card.photo.src}
        alt={decorative ? "" : card.photo.alt}
        fill
        unoptimized
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        className="object-contain"
      />
      <span className="pointer-events-none absolute top-1 right-1 flex flex-col items-end gap-0.5">
        {/* The alt text already names the exam and year; in very small cells the chip would cover the card's college badge. */}
        <span
          aria-hidden="true"
          lang="en"
          className="rounded bg-navy/90 px-1.5 py-0.5 text-[10px] leading-none font-bold text-white @max-[7.5rem]:hidden"
        >
          {card.label}
        </span>
        {card.placeholder && <DemoBadge label={demoLabel} className="px-1.5! py-0.5! text-[10px]! leading-none" />}
      </span>
    </div>
  );
}
