import Image from "next/image";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";

// lg+ placement by item count: the first photo is large, the others fill the right half.
const SPANS: Record<number, string[]> = {
  1: ["lg:col-span-4 lg:row-span-2"],
  2: ["lg:col-span-2 lg:row-span-2", "lg:col-span-2 lg:row-span-2"],
  3: ["lg:col-span-2 lg:row-span-2", "lg:col-span-2", "lg:col-span-2"],
  4: ["lg:col-span-2 lg:row-span-2", "lg:col-span-2", "", ""],
};

/**
 * 1–4 captioned photos as an editorial mosaic (D-030): one large photo and up to three smaller
 * ones on `lg+`, a two-column grid of 4:3 tiles below that. Captions sit on the photo (bottom,
 * on a navy gradient); `label` ("Illustrative stock photo") is shown on every photo.
 *
 * Image rules as for `PhotoStrip`: licensed stock (via `localizeImage()`), never a person image
 * beside a real name, landscapes captioned as the region only.
 */
export function PhotoMosaic({
  items,
  label,
  className,
}: {
  items: { image: ImageAsset; caption?: string }[];
  label?: string;
  className?: string;
}) {
  const shown = items.slice(0, 4);
  const spans = SPANS[shown.length] ?? [];
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:grid-rows-[15rem_15rem]", className)}>
      {shown.map(({ image, caption }, index) => {
        const large = index === 0 || (shown.length === 2 && index === 1);
        return (
          <li key={image.src} className={cn("min-w-0", spans[index])}>
            <figure className="relative m-0 aspect-4/3 overflow-hidden rounded-card bg-surface shadow-soft lg:aspect-auto lg:h-full">
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes={large ? "(min-width: 1024px) 680px, 50vw" : "(min-width: 1024px) 580px, 50vw"}
                className="object-cover"
              />
              {label && (
                <span className="absolute top-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {label}
                </span>
              )}
              {caption && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-navy/90 to-transparent px-3 pt-8 pb-2.5 text-xs font-semibold text-white sm:text-sm">
                  {caption}
                </figcaption>
              )}
            </figure>
          </li>
        );
      })}
    </ul>
  );
}
