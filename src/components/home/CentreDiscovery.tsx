import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AspireImage, ButtonLink, DemoBadge, EmptyState, Notice, Section, type SectionTone } from "@/components/ui";
import { aspireAssets, type AspireAsset } from "@/content/aspire-assets";
import { cn } from "@/lib/cn";
import type { Centre } from "@/lib/types";

/**
 * Illustrative thumbnails per centre slug (D-019): AI-generated hill-style buildings, NOT
 * the real centres, so every use carries a visible "Illustrative image" label. Kullu has
 * no centre image and uses the Himachal landscape instead. Unknown slugs get no image.
 */
const CENTRE_THUMBNAILS: Record<string, { asset: AspireAsset; alt: string }> = {
  shimla: { asset: aspireAssets.centreShimla, alt: aspireAssets.centreShimla.alt },
  hamirpur: { asset: aspireAssets.centreHamirpur, alt: aspireAssets.centreHamirpur.alt },
  dharamshala: { asset: aspireAssets.centreDharamshala, alt: aspireAssets.centreDharamshala.alt },
  kullu: {
    asset: aspireAssets.himachalLandscape,
    alt: "Illustrative image of a Himachal hill town (not the actual centre)",
  },
};

/** Card-level focus ring, shown when the stretched name link has keyboard focus. */
const tileFocus =
  "has-[.tile-link:focus-visible]:outline-3 has-[.tile-link:focus-visible]:outline-offset-2 has-[.tile-link:focus-visible]:outline-blue";

/**
 * One campus tile linking to its directory entry (/centres#slug). The thumbnail box is
 * 112×84px — under every thumbnail asset's maxWidth — and crops each image to that 4:3 shape.
 * The visible "Illustrative image" chip is aria-hidden because the image's alt text
 * already says the same to assistive tech.
 */
function CentreTile({ centre }: { centre: Centre }) {
  const thumbnail = CENTRE_THUMBNAILS[centre.slug];
  const placeholder = centre.status === "placeholder";

  return (
    <div
      className={cn(
        "relative flex h-full gap-3 rounded-control border border-line bg-white p-2.5 transition hover:border-blue hover:bg-[#edf5ff]",
        tileFocus,
      )}
    >
      {thumbnail && (
        <div className="relative h-21 w-28 shrink-0 overflow-hidden rounded-lg bg-blue-soft">
          <AspireImage asset={thumbnail.asset} alt={thumbnail.alt} className="h-full! object-cover" />
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 bg-navy/85 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white"
          >
            Illustrative image
          </span>
        </div>
      )}
      <div className="flex min-w-0 flex-col py-0.5">
        <Link
          href={`/centres#${centre.slug}`}
          className="tile-link text-sm font-bold leading-snug text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-hidden"
        >
          {centre.name}
        </Link>
        <span className="mt-0.5 text-xs font-medium text-muted">
          {centre.label ? `${centre.label} · ${centre.district}` : centre.district}
        </span>
        {placeholder && <DemoBadge label="Demo" className="mt-auto self-start" />}
      </div>
    </div>
  );
}

/** Centre discovery (mockup `.centres-layout`): copy + campus tiles linking into the directory. */
export function CentreDiscovery({ centres, tone = "white" }: { centres: Centre[]; tone?: SectionTone }) {
  const hasPlaceholders = centres.some((c) => c.status === "placeholder");

  return (
    <Section tone={tone} aria-labelledby="home-centres-title">
      <div className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue">Closer to home</p>
          <h2
            id="home-centres-title"
            className="mt-2 text-[clamp(1.6rem,3vw,2.125rem)] font-extrabold leading-tight tracking-tight text-navy"
          >
            Learning opportunities
            <br className="hidden sm:inline" /> across Himachal Pradesh
          </h2>
          <p className="mt-3 text-muted">
            Explore the centre directory to find the location and programs that suit your family. Centre details are
            published only after Aspire has verified them.
          </p>
          <ButtonLink href="/centres" className="mt-5">
            Explore centre directory <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
          {hasPlaceholders && (
            <Notice variant="warning" className="mt-4">
              Campuses marked DEMO are not yet verified by Aspire, and building images are illustrations, not photos
              of the actual centres.
            </Notice>
          )}
        </div>

        <div className="rounded-card border border-line bg-linear-to-br from-[#e9f3ff] to-[#f9fcff] p-5 md:p-6">
          <h3 className="text-lg font-bold text-navy">Find a centre</h3>
          {centres.length > 0 && (
            <p className="mt-1 text-[13px] text-muted">Select a campus to open its directory entry.</p>
          )}
          {centres.length > 0 ? (
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {centres.map((centre) => (
                <li key={centre.id}>
                  <CentreTile centre={centre} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              className="mt-4"
              title="Verified centres coming soon"
              description="Centre locations will be listed here once confirmed by Aspire."
            />
          )}
        </div>
      </div>
    </Section>
  );
}
