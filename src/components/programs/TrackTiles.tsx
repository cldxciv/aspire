import Image from "next/image";
import type { ImageAsset } from "@/lib/types";

/**
 * Tall captioned photo tiles, one per preparation track (D-030 image-rich programs page).
 * Stock photos only (pass `localizeImage` output), each with the visible `label`; captions are
 * the track names. Three across from `md`, stacked two-up on small screens, one on phones.
 */
export function TrackTiles({ items, label }: { items: { image: ImageAsset; caption: string }[]; label: string }) {
  return (
    <ul className="grid gap-4 min-[480px]:grid-cols-2 md:grid-cols-3">
      {items.map(({ image, caption }) => (
        <li key={image.src}>
          <figure className="relative m-0 aspect-4/3 overflow-hidden rounded-card bg-surface shadow-soft min-[480px]:aspect-4/5">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(min-width: 1280px) 380px, (min-width: 768px) 32vw, (min-width: 480px) 48vw, 100vw"
              className="object-cover"
            />
            <span className="absolute left-2 top-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
              {label}
            </span>
            <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-navy/85 to-transparent px-5 pb-4 pt-16 font-serif text-2xl font-semibold text-white">
              {caption}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
