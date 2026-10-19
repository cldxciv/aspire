import { AspireImage } from "@/components/ui";
import type { AspireAsset } from "@/content/aspire-assets";
import { cn } from "@/lib/cn";

/**
 * A place / campus asset with the mandatory visible "Illustrative image" label (D-019).
 * The figure is capped at the asset's `maxWidth`, so it never stretches the small source file.
 */
export function IllustrativeFigure({
  asset,
  caption,
  className,
}: {
  asset: AspireAsset;
  /** Says what the image is NOT (e.g. "Not a photograph of an Aspire campus."). */
  caption: string;
  className?: string;
}) {
  return (
    <figure className={cn("mx-auto w-full", className)} style={{ maxWidth: asset.maxWidth }}>
      <div className="relative overflow-hidden rounded-card border border-line bg-blue-soft shadow-soft">
        <AspireImage asset={asset} className="block" />
        <span className="absolute left-2.5 top-2.5 rounded-md bg-navy/85 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">
          Illustrative image
        </span>
      </div>
      <figcaption className="mt-2 text-xs text-muted">{caption}</figcaption>
    </figure>
  );
}
