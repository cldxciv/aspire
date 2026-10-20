import type { Metadata } from "next";
import { CentreDirectory } from "@/components/centres/CentreDirectory";
import { CENTRE_PHOTOS } from "@/components/centres/centre-images";
import { DistrictsServed } from "@/components/centres/DistrictsServed";
import { MapPanel } from "@/components/centres/MapPanel";
import { BleedSplit } from "@/components/home/BleedSplit";
import { CtaBleedSplit } from "@/components/home/CtaSplit";
import { ButtonLink, DemoBadge, EmptyState, PageHero, Section, SectionHeading } from "@/components/ui";
import { stockImages } from "@/content/images";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localePath } from "@/i18n/paths";
import { getCentres, getHostelInfo, isPlaceholder, localizeImage } from "@/lib/data";
import type { ImageAsset } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("centres");
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: await localeAlternates("/centres"),
  };
}

/**
 * Centres (D-030 image-rich, D-031): every image is a labelled, non-nature stock education photo —
 * hero (seminar), one per centre card (classroom, notes, library, discussion; a note under the
 * directory says they are not taken at the centres), districts (planning notebook) and the
 * closing split (counselling conversation). No landscapes, and never result cards: the data does
 * not say where a student studied. No photo repeats on the page. With no visible centres
 * (production today) only the hero, the empty state, the districts note and the CTA render.
 */
export default async function CentresPage() {
  const [locale, t, tPrograms, common] = await Promise.all([
    getLocale(),
    getMessages("centres"),
    getMessages("programs"),
    getMessages("common"),
  ]);
  const [allCentres, hostelInfo] = await Promise.all([getCentres(undefined, locale), getHostelInfo(locale)]);
  // Campus heads are named faculty: never sent to the (client) directory (faculty info removed 2026-10-20).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally dropped.
  const centres = allCentres.map(({ head, ...centre }) => centre);
  const hostelSlugs = hostelInfo?.campuses.map((campus) => campus.centreSlug) ?? [];
  const servesListed = centres.some((centre) => (centre.servesDistricts ?? []).length > 0);
  const stockLabel = common.labels.illustrativeStockPhoto;

  // Hindi: let Latin queries match too (English name, district, label, districts served).
  const searchExtra: Record<string, string> = {};
  if (locale !== "en") {
    for (const centre of await getCentres()) {
      searchExtra[centre.slug] = [centre.name, centre.district, centre.label, ...(centre.servesDistricts ?? [])]
        .filter(Boolean)
        .join(" ");
    }
  }

  // Card photos (alt in the page's language) for the visible centres.
  const photos: Record<string, ImageAsset> = {};
  for (const centre of centres) {
    const photo = CENTRE_PHOTOS[centre.slug];
    if (photo) photos[centre.slug] = localizeImage(photo, locale);
  }
  const hasPhotos = Object.keys(photos).length > 0;
  // White / surface alternate over the sections actually rendered.
  const order = ["directory", "districts", "cta"];
  const tone = (key: string) => (order.indexOf(key) % 2 === 0 ? "white" : "surface");

  return (
    <>
      <PageHero
        title={t.hero.title}
        lead={t.hero.lead}
        crumbs={[{ label: t.crumb }]}
        homeLabel={common.labels.home}
        homeHref={localePath("/", locale)}
        image={localizeImage(stockImages.seminarFromBehind, locale)}
        imageLabel={stockLabel}
      />

      <Section tone={tone("directory")} aria-labelledby="centre-directory-title">
        <SectionHeading
          id="centre-directory-title"
          title={t.directory.title}
          description={centres.length > 0 ? t.directory.lead : undefined}
        />
        {centres.length > 0 ? (
          <CentreDirectory
            centres={centres}
            hostelSlugs={hostelSlugs}
            searchExtra={searchExtra}
            photos={photos}
            messages={{
              directory: t.directory,
              card: t.card,
              images: t.images,
              tracks: tPrograms.tracks,
              demo: common.labels.demo,
              illustrativeImage: common.labels.illustrativeImage,
              illustrativeStockPhoto: stockLabel,
              opensInNewTab: common.labels.opensInNewTab,
            }}
          />
        ) : (
          <EmptyState
            title={t.directory.emptyTitle}
            description={t.directory.emptyBody}
            action={<ButtonLink href={localePath("/contact", locale)}>{t.directory.emptyCta}</ButtonLink>}
          />
        )}
        {hasPhotos && <p className="mt-8 text-xs text-muted">{t.photos.note}</p>}
      </Section>

      <BleedSplit
        aria-labelledby="centre-districts-title"
        tone={tone("districts")}
        image={localizeImage(stockImages.notebookPlanning, locale)}
        imageSide="right"
        imageLabel={stockLabel}
      >
        <SectionHeading
          id="centre-districts-title"
          title={t.districts.title}
          description={servesListed ? t.districts.leadListed : t.districts.leadUnlisted}
          action={servesListed && centres.some(isPlaceholder) ? <DemoBadge label={common.labels.demoPending} /> : undefined}
        />
        <DistrictsServed centres={centres} />
        <aside aria-labelledby="centre-map-title" className="mt-10 md:mt-12">
          <MapPanel headingId="centre-map-title" t={t.map} compact />
        </aside>
      </BleedSplit>

      <CtaBleedSplit
        tone={tone("cta")}
        headingId="centres-cta-title"
        title={t.help.title}
        description={t.help.body}
        primary={{ label: t.help.primary, href: localePath("/admissions#enquiry", locale) }}
        secondary={{ label: t.help.secondary, href: localePath("/contact", locale) }}
        image={localizeImage(stockImages.mentoringConversation, locale)}
        imageLabel={stockLabel}
        imageSide="left"
        caption={t.help.imageCaption}
      />
    </>
  );
}
