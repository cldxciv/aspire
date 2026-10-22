import type { Metadata } from "next";
import { CtaBand } from "@/components/about/CtaBand";
import { FillMediaSplit } from "@/components/about/FillMediaSplit";
import { PhotoPanel } from "@/components/about/PhotoPanel";
import { DailyRoutine } from "@/components/hostels/DailyRoutine";
import { FeatureList } from "@/components/hostels/FeatureList";
import { HostelCampusCard } from "@/components/hostels/HostelCampusCard";
import {
  HOSTEL_CAMPUS_PHOTOS,
  HOSTEL_EMPTY_PHOTO,
  HOSTEL_HERO_KEYS,
  HOSTEL_PHOTOS,
} from "@/components/hostels/hostel-photos";
import { RoomTypes } from "@/components/hostels/RoomTypes";
import { HeroAction, HeroCollage, HeroFrame, NextBatchCard, type HeroFrameProps } from "@/components/hero";
import { layoutPreviewBanner } from "@/components/page-layout/preview-banner";
import { PageLayoutFrame, type LayoutSlots } from "@/components/page-layout/render";
import { ButtonLink, DemoBadge, EmptyState, Notice, Section, SectionHeading } from "@/components/ui";
import { stockImages, type StockImageKey } from "@/content/images";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getCentres, getHostelInfo, isPlaceholder, localizeImage } from "@/lib/data";
import { getPageLayout } from "@/lib/page-layout/loader";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("hostels");
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: await localeAlternates("/hostels"),
  };
}

/**
 * Hostels. Hero (B · Himalayan editorial, 2026-10-22 hero redesign): ridge art, the headline with
 * a gold underline and the page's main action (ask about accommodation). With hostel details
 * (preview today) a white card lists only what the data says — the campuses with hostels and the
 * girls' residency campuses — linking to the per-campus section. Without them (production today)
 * the card is replaced by two labelled residence stock photos, captioned as not an Aspire hostel
 * (D-030; never a landscape or a result card, D-031).
 * Page layout (docs/page-layout-plan.md): with hostel details, the sections after the hero follow
 * the published layout (`getPageLayout("hostels")`, editable by a super admin; the closing band
 * stays last). Each section is a slot; tones alternate over the sections that render
 * (PageLayoutFrame), so the default layout looks exactly as before. Photo sides stay fixed. Without
 * hostel details the page is the hero and one "details coming soon" section, and no layout applies.
 */
export default async function HostelsPage() {
  const [locale, t, tc, layout] = await Promise.all([
    getLocale(),
    getMessages("hostels"),
    getMessages("common"),
    getPageLayout("hostels"),
  ]);
  const [info, centres] = await Promise.all([getHostelInfo(locale), getCentres(undefined, locale)]);
  const banner = await layoutPreviewBanner(layout);
  const centreBySlug = new Map(centres.map((centre) => [centre.slug, centre]));
  const photoLabel = tc.labels.illustrativeStockPhoto;
  const photo = (key: StockImageKey) => localizeImage(stockImages[key], locale);
  const enquiryHref = localePath("/admissions#enquiry", locale);
  const hero: HeroFrameProps = {
    art: "ridges",
    layout: "editorial",
    eyebrow: t.hero.eyebrow,
    eyebrowStyle: "caps",
    title: t.hero.title,
    highlight: t.hero.highlight,
    highlightStyle: "underline",
    crumbs: [{ label: t.hero.crumb }],
    homeLabel: tc.labels.home,
    homeHref: localePath("/", locale),
    actions: <HeroAction href={enquiryHref}>{t.hero.ask}</HeroAction>,
  };
  // Residence-life stock photos in place of the card while no hostel details are published.
  const heroPhotos = (
    <div>
      <HeroCollage
        photos={HOSTEL_HERO_KEYS.map((key) => ({ image: photo(key), label: photoLabel }))}
        resultBadge=""
        demoLabel={tc.labels.demo}
      />
      <p className="m-0 mt-3 text-center text-xs text-[#b9d3f3]">{t.hero.photoCaption}</p>
    </div>
  );

  // No hostel details: the layout does not apply (registry `pages.hostels.note`); the preview
  // banner still shows so a super admin can leave preview from here.
  if (!info) {
    return (
      <>
        {banner}
        <HeroFrame {...hero} lead={t.hero.emptyLead} aside={heroPhotos} />
        <Section aria-labelledby="hostels-empty-title">
          <FillMediaSplit image={photo(HOSTEL_EMPTY_PHOTO)} imageSide="left" imageLabel={photoLabel} caption={t.stockCaption}>
            <h2 id="hostels-empty-title" className="sr-only">
              {t.empty.heading}
            </h2>
            <EmptyState
              title={t.empty.title}
              description={t.empty.description}
              action={<ButtonLink href={enquiryHref}>{t.empty.action}</ButtonLink>}
            />
          </FillMediaSplit>
        </Section>
      </>
    );
  }

  const demoLabel = isPlaceholder(info) ? tc.labels.demo : undefined;
  const demo = demoLabel ? <DemoBadge label={demoLabel} /> : undefined;
  const campuses = info.campuses.filter((campus) => centreBySlug.has(campus.centreSlug));
  const girlsCampuses = info.girlsResidency.centreSlugs.filter((slug) => centreBySlug.has(slug));
  const hasRooms = info.roomTypes.length > 0 || info.roomFeatures.length > 0;
  const hasDay = info.dailyRoutine.length > 0 || info.menuHighlights.length > 0;

  // Hero card: only the facts the hostel data states (centre names in the page locale).
  const names = (slugs: readonly string[]) =>
    slugs
      .map((slug) => centreBySlug.get(slug)?.name)
      .filter(Boolean)
      .join(" · ");
  const cardRows = [
    { label: t.heroCard.campuses, value: names(campuses.map((campus) => campus.centreSlug)) },
    { label: t.care.girlsTitle, value: names(girlsCampuses) },
  ].filter((row) => row.value !== "");
  const card =
    cardRows.length > 0 ? (
      <NextBatchCard
        eyebrow={t.heroCard.eyebrow}
        rows={cardRows}
        action={campuses.length > 0 ? { label: t.hero.byCampus, href: "#hostels-by-campus" } : undefined}
        secondary={{ label: t.cta.secondary, href: localePath("/centres", locale) }}
        demoLabel={tc.labels.demo}
        placeholder={isPlaceholder(info)}
      />
    ) : undefined;

  // One slot per section, rendered in layout order. A slot is null exactly when its section would
  // render nothing (no campuses, rooms or daily routine in the data), so empty sections never take
  // a tone. Photo sides stay as they are (D8).
  const slots: LayoutSlots<"hostels"> = {
    intro: ({ tone }) => (
      <Section tone={tone} aria-labelledby="hostels-intro-title">
        <FillMediaSplit image={photo(HOSTEL_PHOTOS.intro)} imageSide="right" imageLabel={photoLabel} caption={t.stockCaption}>
          {demoLabel && (
            <Notice variant="warning" title={t.demoNotice.title} className="mb-8">
              {t.demoNotice.body}
            </Notice>
          )}
          <SectionHeading
            id="hostels-intro-title"
            eyebrow={t.intro.eyebrow}
            title={info.headline}
            description={info.audience}
            action={demo}
            stack
          />
          <FeatureList features={info.charter} className="md:max-lg:grid-cols-1" />
        </FillMediaSplit>
      </Section>
    ),

    campuses:
      campuses.length > 0
        ? ({ tone }) => (
            <Section tone={tone} id="hostels-by-campus" className="scroll-mt-28" aria-labelledby="hostels-campus-title">
              <SectionHeading
                id="hostels-campus-title"
                title={t.campuses.title}
                description={t.campuses.description}
                action={demo}
              />
              {/* Each campus beside a generic stock photo (D-030), alternating sides, captioned as not an
                  Aspire hostel or campus. */}
              <ul className="space-y-10">
                {campuses.map((campus, index) => {
                  const card = (
                    <HostelCampusCard
                      campus={campus}
                      centreName={centreBySlug.get(campus.centreSlug)?.name ?? campus.centreSlug}
                      locale={locale}
                      messages={t.card}
                      demoLabel={demoLabel}
                    />
                  );
                  const campusPhoto = HOSTEL_CAMPUS_PHOTOS[index];
                  return (
                    <li key={campus.centreSlug}>
                      {campusPhoto ? (
                        <FillMediaSplit
                          image={photo(campusPhoto)}
                          imageSide={index % 2 === 0 ? "right" : "left"}
                          imageWidth="wide"
                          imageLabel={photoLabel}
                          caption={t.stockCaption}
                        >
                          {card}
                        </FillMediaSplit>
                      ) : (
                        card
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )
        : null,

    care: ({ tone }) => (
      <Section tone={tone} aria-labelledby="hostels-care-title">
        <FillMediaSplit image={photo(HOSTEL_PHOTOS.care)} imageSide="left" imageLabel={photoLabel} caption={t.stockCaption}>
          <SectionHeading
            id="hostels-care-title"
            title={t.care.title}
            description={t.care.description}
            action={demo}
            stack
          />
          <FeatureList features={info.features} columns={1} />
        </FillMediaSplit>

        {(info.girlsResidency.features.length > 0 || info.girlsResidency.summary) && (
          <FillMediaSplit
            image={photo(HOSTEL_PHOTOS.girls)}
            imageSide="right"
            imageLabel={photoLabel}
            caption={t.stockCaption}
            className="mt-12"
          >
            <h3 className="text-[clamp(1.35rem,2.4vw,1.625rem)] font-extrabold leading-snug tracking-tight text-navy">
              {t.care.girlsTitle}
            </h3>
            <p className="mt-2 max-w-3xl text-ink">{info.girlsResidency.summary}</p>
            {girlsCampuses.length > 0 && (
              <p className="mt-2 text-sm text-muted">
                {t.care.girlsCampuses}{" "}
                {girlsCampuses.map((slug, i) => (
                  <span key={slug}>
                    {i > 0 && ", "}
                    <a href={`#hostel-${slug}`} className="font-semibold text-blue hover:underline">
                      {centreBySlug.get(slug)?.name}
                    </a>
                  </span>
                ))}
              </p>
            )}
            <FeatureList features={info.girlsResidency.features} columns={1} className="mt-4" />
          </FillMediaSplit>
        )}
      </Section>
    ),

    rooms: hasRooms
      ? ({ tone }) => (
          <Section tone={tone} aria-labelledby="hostels-rooms-title">
            <PhotoPanel image={photo(HOSTEL_PHOTOS.roomsPanel)} imageLabel={photoLabel} className="mb-8">
              <SectionHeading
                id="hostels-rooms-title"
                title={t.rooms.title}
                description={t.rooms.description}
                action={demo}
                tone="dark"
                className="mb-0"
              />
            </PhotoPanel>
            <RoomTypes rooms={info.roomTypes} />
            {info.roomTypesNote && (
              <p className="mt-3 text-sm text-muted">{format(t.rooms.note, { note: info.roomTypesNote })}</p>
            )}
            {info.roomFeatures.length > 0 && (
              <FillMediaSplit
                image={photo(HOSTEL_PHOTOS.roomFeatures)}
                imageSide="right"
                imageLabel={photoLabel}
                caption={t.stockCaption}
                className="mt-12"
              >
                <h3 className="text-[clamp(1.35rem,2.4vw,1.625rem)] font-extrabold leading-snug tracking-tight text-navy">
                  {t.rooms.featuresTitle}
                </h3>
                <FeatureList features={info.roomFeatures} columns={1} className="mt-4" />
              </FillMediaSplit>
            )}
          </Section>
        )
      : null,

    day: hasDay
      ? ({ tone }) => (
          <Section tone={tone} aria-labelledby="hostels-day-title">
            <PhotoPanel image={photo(HOSTEL_PHOTOS.dayPanel)} imageLabel={photoLabel} className="mb-10">
              <SectionHeading
                id="hostels-day-title"
                title={t.day.title}
                description={t.day.description}
                action={demo}
                tone="dark"
                className="mb-0"
              />
            </PhotoPanel>
            {/* The routine and the menu share one photo: the meal photo is in the hero carousel. */}
            <FillMediaSplit image={photo(HOSTEL_PHOTOS.day)} imageSide="right" imageLabel={photoLabel} caption={t.stockCaption}>
              <DailyRoutine items={info.dailyRoutine} />
              {info.menuHighlights.length > 0 && (
                <div className={info.dailyRoutine.length > 0 ? "mt-10" : undefined}>
                  <h3 className="text-[clamp(1.35rem,2.4vw,1.625rem)] font-extrabold leading-snug tracking-tight text-navy">
                    {t.day.menuTitle}
                  </h3>
                  <FeatureList features={info.menuHighlights} columns={1} className="mt-4" />
                </div>
              )}
            </FillMediaSplit>
          </Section>
        )
      : null,

    cta: ({ tone }) => (
      <Section tone={tone} aria-labelledby="hostels-cta-title">
        <CtaBand
          id="hostels-cta-title"
          title={t.cta.title}
          description={t.cta.description}
          primary={{ label: t.cta.primary, href: enquiryHref }}
          secondary={{ label: t.cta.secondary, href: localePath("/centres", locale) }}
          image={photo(HOSTEL_PHOTOS.cta)}
          imageLabel={photoLabel}
        />
      </Section>
    ),
  };

  return (
    <PageLayoutFrame
      layout={layout}
      banner={banner}
      hero={
        <HeroFrame
          {...hero}
          lead={
            demoLabel && !card ? (
              <>
                <p className="m-0">{t.hero.lead}</p>
                <DemoBadge label={tc.labels.demoPending} className="mt-3" />
              </>
            ) : (
              t.hero.lead
            )
          }
          aside={card}
          asideAlign="start"
        />
      }
      slots={slots}
    />
  );
}
