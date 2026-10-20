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
import {
  ButtonLink,
  DemoBadge,
  EmptyState,
  Notice,
  PageHero,
  Section,
  SectionHeading,
} from "@/components/ui";
import { heroSlides } from "@/components/ui/hero-slides";
import { stockImages, type StockImageKey } from "@/content/images";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getCentres, getHostelInfo, isPlaceholder, localizeImage } from "@/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("hostels");
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: await localeAlternates("/hostels"),
  };
}

export default async function HostelsPage() {
  const [locale, t, tc] = await Promise.all([getLocale(), getMessages("hostels"), getMessages("common")]);
  const [info, centres] = await Promise.all([getHostelInfo(locale), getCentres(undefined, locale)]);
  const centreBySlug = new Map(centres.map((centre) => [centre.slug, centre]));
  const photoLabel = tc.labels.illustrativeStockPhoto;
  const photo = (key: StockImageKey) => localizeImage(stockImages[key], locale);
  // Residence-life carousel (stock photos, each labelled and captioned as not an Aspire hostel).
  const hero = {
    title: t.hero.title,
    crumbs: [{ label: t.hero.crumb }],
    homeLabel: tc.labels.home,
    homeHref: localePath("/", locale),
    slides: heroSlides(
      HOSTEL_HERO_KEYS.map((key) => stockImages[key]),
      photoLabel,
      locale,
    ).map((slide) => ({ ...slide, caption: t.hero.photoCaption })),
  };
  const enquiryHref = localePath("/admissions#enquiry", locale);

  if (!info) {
    return (
      <>
        <PageHero {...hero} lead={t.hero.emptyLead} />
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

  // Alternate white / surface backgrounds over the sections actually rendered.
  const order = ["intro", campuses.length > 0 && "campuses", "care", hasRooms && "rooms", hasDay && "day", "cta"].filter(
    Boolean,
  );
  const tone = (key: string) => (order.indexOf(key) % 2 === 0 ? "white" : "surface");

  return (
    <>
      <PageHero
        {...hero}
        lead={
          <>
            <p>{t.hero.lead}</p>
            {demoLabel && <DemoBadge label={tc.labels.demoPending} className="mt-3" />}
          </>
        }
      >
        {campuses.length > 0 && <ButtonLink href="#hostels-by-campus">{t.hero.byCampus}</ButtonLink>}
        <ButtonLink href={enquiryHref} variant="outline">
          {t.hero.ask}
        </ButtonLink>
      </PageHero>

      <Section tone={tone("intro")} aria-labelledby="hostels-intro-title">
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

      {campuses.length > 0 && (
        <Section
          tone={tone("campuses")}
          id="hostels-by-campus"
          className="scroll-mt-28"
          aria-labelledby="hostels-campus-title"
        >
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
      )}

      <Section tone={tone("care")} aria-labelledby="hostels-care-title">
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

      {hasRooms && (
        <Section tone={tone("rooms")} aria-labelledby="hostels-rooms-title">
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
      )}

      {hasDay && (
        <Section tone={tone("day")} aria-labelledby="hostels-day-title">
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
      )}

      <Section tone={tone("cta")} aria-labelledby="hostels-cta-title">
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
    </>
  );
}
