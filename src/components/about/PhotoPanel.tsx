import Image from "next/image";
import type { ReactNode } from "react";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * A wide photo with short copy on it (section intros, closing calls to action) — D-030.
 *
 * `lg+`: the photo fills the whole panel and the copy sits on its left half over a navy gradient
 * (≥ 80 % navy behind the text, so white text keeps AA contrast); the panel grows if the copy
 * needs more room than `minHeight`. Below `lg` the photo is a 16:9 strip above the copy on solid
 * navy, so long (e.g. Hindi) copy is never clipped or placed over a busy photo.
 *
 * The photo is decorative here (`alt=""`): the copy carries the meaning. Licensed stock only, with
 * a visible `imageLabel`; never a person image beside a real name; no landscapes (D-031: those are
 * kept for the homepage hero only).
 */
export function PhotoPanel({
  image,
  imageLabel,
  minHeight = "md",
  className,
  children,
}: {
  image: ImageAsset;
  imageLabel?: string;
  /** Desktop minimum height: `md` ≈ 400px, `lg` ≈ 480px. */
  minHeight?: "md" | "lg";
  className?: string;
  /** Copy for the left half (headings, a sentence, buttons). Rendered on a dark surface. */
  children: ReactNode;
}) {
  return (
    <div
      data-surface="dark"
      className={cn(
        "relative isolate overflow-hidden rounded-card bg-navy text-white shadow-soft lg:flex lg:items-center",
        minHeight === "lg" ? "lg:min-h-120" : "lg:min-h-100",
        className,
      )}
    >
      <div className="relative aspect-video lg:absolute lg:inset-0 lg:-z-10 lg:aspect-auto">
        <Image src={image.src} alt="" fill sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover" />
        {/* Desktop only: keeps the copy on the left half on ≥ 80 % navy. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 hidden bg-linear-to-r from-navy/95 from-35% via-navy/80 via-55% to-navy/10 lg:block"
        />
        {imageLabel && (
          <span className="absolute right-2 bottom-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
            {imageLabel}
          </span>
        )}
      </div>
      <div className="relative p-6 md:p-8 lg:w-1/2 lg:max-w-xl lg:p-10">{children}</div>
    </div>
  );
}
