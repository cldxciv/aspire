import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { AspireImage, ButtonLink, DemoBadge, ImageCarousel, Section, type SectionTone } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { localizeImage } from "@/lib/data";
import { cn } from "@/lib/cn";
import type { Centre, HostelInfo, ImageAsset } from "@/lib/types";
import { HOME_LIFE_SLIDES, homeSlides } from "./home-carousels";

/** The band spans the container (1120px inside the gutters from 1200px). */
const BAND_SIZES = "(min-width: 1200px) 1120px, 100vw";

/** Tiles are ≤ ~290px wide (2 columns below md, 4 across the container from md), so 1200px stock files are plenty. */
const TILE_SIZES = "(min-width: 1280px) 290px, (min-width: 768px) 25vw, 50vw";

/**
 * Facility names that make safety, comfort, capacity, staffing or round-the-clock claims
 * (or carry any number) are never used as captions: captions describe activities only.
 */
const CLAIM_PATTERN = /safe|secur|biometric|cctv|guard|warden|medical|sos|\bac\b|non-ac|capacit|\d/i;

/** `name` is matched (English, so the claim and activity patterns work); `display` is shown (page language). */
type DemoCaption = { name: string; display: string; demo: boolean };

type Tile = {
  key: string;
  title: string;
  activity: string;
  image: { kind: "stock"; asset: ImageAsset } | { kind: "illustration" };
  /** Preview-only caption taken from a facility / hostel name in the data. */
  fromData: DemoCaption | null;
};

/** First unused name matching `pattern` that makes no claim; marks it used. */
function pickCaption(pool: DemoCaption[], pattern: RegExp, used: Set<string>): DemoCaption | null {
  const hit = pool.find((item) => pattern.test(item.name) && !CLAIM_PATTERN.test(item.name) && !used.has(item.name));
  if (hit) used.add(hit.name);
  return hit ?? null;
}

/** Facility captions: English names for matching, localised names (same order, D-028 overlays) for display. */
function facilityPool(centres: Centre[], display: Centre[]): DemoCaption[] {
  return centres.flatMap((centre, c) =>
    (centre.facilities ?? []).map((f, i) => ({
      name: f.name,
      display: display[c]?.facilities?.[i]?.name ?? f.name,
      demo: centre.status === "placeholder",
    })),
  );
}

function hostelPool(hostel: HostelInfo | null, display: HostelInfo | null): DemoCaption[] {
  if (!hostel) return [];
  const shown = display ? [...display.charter, ...display.features] : [];
  return [...hostel.charter, ...hostel.features].map((f, i) => ({
    name: f.name,
    display: shown[i]?.name ?? f.name,
    demo: hostel.status === "placeholder",
  }));
}

type TileCopy = Messages<"home">["life"]["tiles"];

/**
 * The four tiles. Photos are stock (not Aspire); the residential tile uses the AI campus
 * illustration with a visible "Illustrative image" label. Without hostel data (production
 * today) that tile is captioned generically so it implies no hostel.
 * `match` holds the English records (patterns are English); `shown` the page-language ones.
 */
function buildTiles(
  match: { hostel: HostelInfo | null; centres: Centre[] },
  shown: { hostel: HostelInfo | null; centres: Centre[] },
  t: TileCopy,
  locale: Locale,
): Tile[] {
  const facilities = facilityPool(match.centres, shown.centres);
  const hostelNames = hostelPool(match.hostel, shown.hostel);
  const hostel = shown.hostel;
  const used = new Set<string>();

  return [
    {
      key: "classrooms",
      title: t.classroomsTitle,
      activity: t.classroomsActivity,
      image: { kind: "stock", asset: localizeImage(stockImages.classroomDesks, locale) },
      fromData: pickCaption(facilities, /classroom/i, used),
    },
    {
      key: "residential",
      title: hostel ? t.hostelTitle : t.campusTitle,
      activity: hostel ? t.hostelActivity : t.campusActivity,
      image: { kind: "illustration" },
      fromData: pickCaption(hostelNames, /study|dining|meal/i, used),
    },
    {
      key: "library",
      title: t.libraryTitle,
      activity: t.libraryActivity,
      image: { kind: "stock", asset: localizeImage(stockImages.libraryReading, locale) },
      fromData: pickCaption([...facilities, ...hostelNames], /library|reading|study/i, used),
    },
    {
      key: "lab",
      title: t.labsTitle,
      activity: t.labsActivity,
      image: { kind: "stock", asset: localizeImage(stockImages.labPipette, locale) },
      fromData: pickCaption(facilities, /\blab\b|practical/i, used),
    },
  ];
}

function TileImage({ tile, label, campusAlt }: { tile: Tile; label: string; campusAlt: string }) {
  if (tile.image.kind === "illustration") {
    const asset = aspireAssets.campusBuilding;
    return (
      <div className="relative aspect-6/5 overflow-hidden bg-blue-soft" style={{ maxWidth: asset.maxWidth }}>
        <AspireImage asset={asset} alt={campusAlt} className="h-full! object-cover" />
        <span
          aria-hidden="true"
          className="absolute left-2 top-2 rounded-md bg-navy/85 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white"
        >
          {label}
        </span>
      </div>
    );
  }
  const { asset } = tile.image;
  return (
    <div className="relative aspect-6/5 overflow-hidden bg-blue-soft">
      <Image src={asset.src} alt={asset.alt} fill sizes={TILE_SIZES} className="object-cover" />
    </div>
  );
}

/**
 * "Student life" (plan §4.8, D-030): a wide band — a carousel of labelled stock student-life photos
 * (HOME_LIFE_SLIDES, none of them repeated in the tiles) carrying the heading — then four
 * activity tiles with stock photos. From `md` the heading sits on a navy panel over the band's
 * lower left, clear of the carousel's label (top left), side buttons (64px inset) and bottom
 * control row; below `md` it is a navy header above the carousel. In preview, a tile can
 * add a DEMO-labelled caption naming a facility from the imported centre / hostel data.
 * Captions never claim safety, comfort (AC / non-AC), capacities or staffing.
 * The button goes to /hostels when hostel information is visible, otherwise /about.
 */
export function CampusLifeTiles({
  hostel,
  centres,
  locale,
  match,
  tone = "white",
}: {
  /** Hostel info in the page's language (null when not publishable). */
  hostel: HostelInfo | null;
  /** Visible centres in the page's language. */
  centres: Centre[];
  locale: Locale;
  /** The same records in English, for caption matching. Defaults to `hostel` / `centres`. */
  match?: { hostel: HostelInfo | null; centres: Centre[] };
  tone?: SectionTone;
}) {
  const t = messagesFor(locale, "home").life;
  const common = messagesFor(locale, "common");
  const tiles = buildTiles(match ?? { hostel, centres }, { hostel, centres }, t.tiles, locale);

  return (
    <Section tone={tone} aria-labelledby="home-life-title">
      {/* Wide photo carousel opening the section (D-030), with the section heading on it. */}
      <div className="relative overflow-hidden rounded-card bg-navy shadow-soft">
        <div
          data-surface="dark"
          className="px-5 pb-5 pt-6 text-white sm:px-6 md:pointer-events-none md:absolute md:bottom-16 md:left-16 md:z-10 md:max-w-[min(36rem,calc(100%-8rem))] md:rounded-card md:bg-navy/85 md:p-6 md:shadow-soft md:backdrop-blur-sm lg:p-7"
        >
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">{t.eyebrow}</p>
          <h2
            id="home-life-title"
            className="mt-2 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight text-white [&:lang(hi)]:leading-snug"
          >
            {t.title}
          </h2>
        </div>
        <ImageCarousel
          slides={homeSlides(HOME_LIFE_SLIDES, common.labels.illustrativeStockPhoto, locale)}
          labels={common.carousel}
          label={`${t.eyebrow}: ${common.carousel.label}`}
          aspect="21/9"
          sizes={BAND_SIZES}
          tone="light"
        />
      </div>

      <div className="mt-10 flex flex-col gap-6 md:mt-12 md:flex-row md:items-end md:justify-between md:gap-10">
        <p className="max-w-2xl leading-relaxed text-muted">{t.lead}</p>
        <ButtonLink href={localePath(hostel ? "/hostels" : "/about", locale)} variant="dark" className="shrink-0">
          {t.cta} <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 md:mt-10 md:grid-cols-4 md:gap-6">
        {tiles.map((tile) => (
          <li key={tile.key}>
            <figure className="h-full overflow-hidden rounded-card border border-line bg-white shadow-soft">
              <TileImage tile={tile} label={common.labels.illustrativeImage} campusAlt={t.campusImageAlt} />
              <figcaption className="px-4 pb-4 pt-3.5 text-sm">
                <span className="block font-bold text-navy">{tile.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{tile.activity}</span>
                {tile.fromData && (
                  <span className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {tile.fromData.demo && <DemoBadge label={common.labels.demo} />}
                    <span className={cn(!tile.fromData.demo && "font-semibold")}>{tile.fromData.display}</span>
                  </span>
                )}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs text-muted">{t.stockNote}</p>
    </Section>
  );
}
