import { ArrowRight } from "lucide-react";
import { AspireImage, ButtonLink, Container, DemoBadge } from "@/components/ui";
import { centreImage } from "@/components/centres/centre-images";
import { telHref } from "@/components/centres/contact-links";
import type { AspireAsset } from "@/content/aspire-assets";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import type { Centre } from "@/lib/types";
import { CentrePicker, type CentrePickerItem } from "./CentrePicker";
import { CENTRE_PIN_POSITIONS, HimachalMap } from "./HimachalMap";

/** Card images are never wider than this (and never past the asset's own maxWidth, D-019). */
const CARD_IMAGE_MAX_WIDTH = 240;

/**
 * Illustrative building image for the centre card: at most 240px wide, cropped to 16:10,
 * with the mandatory visible "Illustrative image" label (aria-hidden: the alt text says it).
 */
function CentreIllustration({ asset, alt, label }: { asset: AspireAsset; alt: string; label: string }) {
  return (
    <div
      className="relative aspect-16/10 w-full overflow-hidden rounded-control bg-blue-soft"
      style={{ maxWidth: Math.min(CARD_IMAGE_MAX_WIDTH, asset.maxWidth) }}
    >
      <AspireImage asset={asset} alt={alt} className="h-full! object-cover" />
      <span
        aria-hidden="true"
        className="absolute left-2 top-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white"
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Projects centres to the picker's view model: only displayed fields, plus a pin position
 * when the slug is in CENTRE_PIN_POSITIONS and a server-rendered image when one exists.
 */
export function toCentrePickerItems(centres: Centre[], locale: Locale = "en"): CentrePickerItem[] {
  const alts = messagesFor(locale, "centres").images;
  const label = messagesFor(locale, "common").labels.illustrativeImage;
  return centres.map((centre) => {
    const image = centreImage(centre.slug, alts);
    const phoneHref = telHref(centre.phone);
    return {
      slug: centre.slug,
      name: centre.name,
      shortName: centre.name.trim().split(/\s+/)[0] || centre.name,
      label: centre.label,
      address: centre.address,
      phone: centre.phone && phoneHref ? { display: centre.phone, href: phoneHref } : undefined,
      pin: CENTRE_PIN_POSITIONS[centre.slug] ?? null,
      href: localePath(`/centres#${centre.slug}`, locale),
      media: image ? <CentreIllustration asset={image.asset} alt={image.alt} label={label} /> : undefined,
      demo: centre.status === "placeholder",
    };
  });
}

/**
 * Homepage centres section (plan §4.7): a navy panel with the heading and directory link,
 * beside a light panel with the stylised map, pins and the selected centre's card.
 * The heading's count comes from the data. Returns null when no centre is visible
 * (production today), so no empty map ever ships.
 */
export function CentresShowcase({ centres, locale }: { centres: Centre[]; locale: Locale }) {
  if (centres.length === 0) return null;

  const t = messagesFor(locale, "home").centres;
  const common = messagesFor(locale, "common");
  const items = toCentrePickerItems(centres, locale);
  const initialSlug = (centres.find((c) => c.isHeadquarters) ?? centres[0]).slug;
  const hasPlaceholders = centres.some((c) => c.status === "placeholder");
  const count = centres.length;

  return (
    <section aria-labelledby="home-centres-title" className="overflow-hidden bg-surface">
      <Container className="grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Navy panel: bleeds to the viewport edge (clipped by the section's overflow-hidden). */}
        <div
          data-surface="dark"
          className="relative isolate py-12 text-white before:absolute before:inset-y-0 before:-left-4 before:-right-4 before:-z-10 before:bg-linear-to-br before:from-navy before:to-navy-2 sm:before:-left-5 sm:before:-right-5 lg:py-16 lg:pr-8 xl:pr-12 lg:before:left-[-100vw] lg:before:right-0"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">{t.eyebrow}</p>
            {hasPlaceholders && <DemoBadge label={common.labels.demoPending} />}
          </div>
          <h2
            id="home-centres-title"
            className="mt-3 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight [&:lang(hi)]:leading-snug"
          >
            {format(count === 1 ? t.titleOne : t.titleMany, { count })}
          </h2>
          <p className="mt-4 max-w-md text-[#d3e1f3]">{t.lead}</p>
          <ButtonLink href={localePath("/centres", locale)} className="mt-6">
            {t.cta} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
          {hasPlaceholders && <p className="mt-5 max-w-md text-sm text-[#d3e1f3]">{t.demoNote}</p>}
        </div>

        <div data-surface="light" className="py-10 lg:py-16 lg:pl-8 xl:pl-10">
          <CentrePicker
            centres={items}
            initialSlug={initialSlug}
            map={<HimachalMap />}
            messages={{
              mapPinsLabel: t.mapPinsLabel,
              mapNotToScale: t.mapNotToScale,
              listLabel: t.listLabel,
              showing: t.showing,
              callPrefix: t.callPrefix,
              learnMore: t.learnMore,
              learnMoreSuffix: t.learnMoreSuffix,
              demo: common.labels.demo,
            }}
          />
        </div>
      </Container>
    </section>
  );
}
