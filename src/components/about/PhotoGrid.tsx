import Image from "next/image";
import type { ImageAsset } from "@/lib/types";

export type CaptionedPhoto = {
  image: ImageAsset;
  /** Describes the activity shown, never a place ("Aspire campus") or people ("Aspire students"). */
  caption: string;
};

/**
 * Captioned photo grid with fixed 4:3 frames (no layout shift). Images lazy-load.
 * `note` is shown under the grid, e.g. to say the photos are illustrative stock.
 */
export function PhotoGrid({ photos, note }: { photos: CaptionedPhoto[]; note?: string }) {
  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map(({ image, caption }) => (
          <li key={image.src}>
            <figure className="h-full overflow-hidden rounded-card border border-line bg-white shadow-soft">
              <div className="relative aspect-4/3 bg-blue-soft">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <figcaption className="px-4 py-3 text-sm font-bold text-navy">{caption}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {note && <p className="mt-4 text-xs text-muted">{note}</p>}
    </>
  );
}
