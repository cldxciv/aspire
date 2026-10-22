/**
 * View models for the centre finder (`CentreFinder`), built on the server from `getCentres()` and
 * passed to the client island as plain data. Pure and client-safe. Unit-tested in
 * `hero-data.test.ts`.
 *
 * Honesty: every field comes from the centre record (or the page's contact details for WhatsApp);
 * an absent phone, address or directions link stays absent, and a link that is not safe to open
 * (see the contact-link builders) is dropped.
 */
import { safeDirectionsUrl } from "@/components/centres/contact-links";
import { telHref, whatsappHref as safeWhatsappHref } from "@/components/contact/contact-links";
import type { Locale } from "@/i18n/config";
import type { Centre } from "@/lib/types";
import {
  HP_DISTRICTS,
  districtName,
  districtPoint,
  findDistrict,
  isDistrict,
  mapDistance,
  projectLatLon,
  type DistrictId,
  type HpDistrict,
  type MapPoint,
} from "./districts";
import { isFilled } from "./hero-text";

/** One centre as the finder shows it. */
export interface FinderCentre {
  slug: string;
  /** Full name in the page locale, e.g. "Kullu Valley Center". */
  name: string;
  /** Map pin label, e.g. "Kullu" (first word of the name unless the page passes `shortName`). */
  shortName: string;
  /** District as stated by the record, in the page locale. */
  district: string;
  address?: string;
  phone?: { display: string; href: string };
  /** Plain wa.me chat link (the page's WhatsApp number), when given and safe. */
  whatsappHref?: string;
  /** https directions link from the record, when present. */
  directionsHref?: string;
  /** The centre's own page, when the page passes `pageHref`. */
  pageHref?: string;
  isHeadquarters: boolean;
  /** Placeholder record: render the DEMO badge (D-005). */
  placeholder: boolean;
  /** Pin position in `CENTRE_MAP_SIZE` units; null when neither coordinates nor a known district exist. */
  point: MapPoint | null;
}

/** One of Himachal's 12 districts in the finder's select. */
export interface FinderDistrict {
  id: DistrictId;
  /** Name in the page locale. */
  name: string;
  /** The centre for this district (see `centreForDistrict`), or null when there is none. */
  centreSlug: string | null;
  point: MapPoint;
}

/** Where a centre sits on the map: its own coordinates, else its district headquarters. */
export function centrePoint(centre: Pick<Centre, "latitude" | "longitude" | "district">): MapPoint | null {
  if (Number.isFinite(centre.latitude) && Number.isFinite(centre.longitude)) {
    return projectLatLon(centre.latitude as number, centre.longitude as number);
  }
  const district = findDistrict(centre.district);
  return district ? districtPoint(district) : null;
}

/**
 * The centre for `district`, from the data first: a centre whose `servesDistricts` lists it, then a
 * centre located in it. Only when the data names none: the closest centre on the map. Null when
 * there are no centres (production while the records are placeholders).
 */
export function centreForDistrict<C extends Pick<Centre, "slug" | "district" | "servesDistricts" | "latitude" | "longitude">>(
  district: HpDistrict,
  centres: readonly C[],
): C | null {
  const serving = centres.find((c) => (c.servesDistricts ?? []).some((name) => isDistrict(name, district)));
  if (serving) return serving;
  const located = centres.find((c) => isDistrict(c.district, district));
  if (located) return located;
  const from = districtPoint(district);
  let nearest: C | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const centre of centres) {
    const point = centrePoint(centre);
    if (!point) continue;
    const distance = mapDistance(from, point);
    if (distance < best) {
      best = distance;
      nearest = centre;
    }
  }
  return nearest;
}

/**
 * Finder centres from visible centre records (already in the page locale). `pageHref` builds each
 * centre's page link (pass `(slug) => localePath(`/centres/${slug}`, locale)`); `whatsappHref` is
 * the institute's WhatsApp (`contact.whatsapp`), applied to every centre when safe.
 */
export function finderCentres(
  centres: readonly Centre[],
  options: {
    pageHref?: (slug: string) => string;
    whatsapp?: { url: string; display: string } | null;
    shortName?: (centre: Centre) => string;
  } = {},
): FinderCentre[] {
  const whatsapp = options.whatsapp ? safeWhatsappHref(options.whatsapp) : null;
  return centres.map((centre) => {
    const phone = isFilled(centre.phone) ? telHref(centre.phone) : null;
    const directions = safeDirectionsUrl(centre.directionsUrl);
    const shortName = options.shortName?.(centre) ?? centre.name.trim().split(/\s+/)[0] ?? centre.name;
    return {
      slug: centre.slug,
      name: centre.name,
      shortName,
      district: centre.district,
      ...(isFilled(centre.address) ? { address: centre.address.trim() } : {}),
      ...(phone && centre.phone ? { phone: { display: centre.phone.trim(), href: phone } } : {}),
      ...(whatsapp ? { whatsappHref: whatsapp } : {}),
      ...(directions ? { directionsHref: directions } : {}),
      ...(options.pageHref ? { pageHref: options.pageHref(centre.slug) } : {}),
      isHeadquarters: centre.isHeadquarters === true,
      placeholder: centre.status === "placeholder",
      point: centrePoint(centre),
    };
  });
}

/**
 * All 12 districts in the page locale, alphabetical in that locale, each with its centre (from
 * `centreForDistrict`). Empty when there are no centres, so the finder renders nothing.
 */
export function finderDistricts(centres: readonly Centre[], locale: Locale): FinderDistrict[] {
  if (centres.length === 0) return [];
  return HP_DISTRICTS.map((district) => ({
    id: district.id,
    name: districtName(district, locale),
    centreSlug: centreForDistrict(district, centres)?.slug ?? null,
    point: districtPoint(district),
  })).sort((a, b) => a.name.localeCompare(b.name, locale === "hi" ? "hi" : "en"));
}

/**
 * The district selected before any choice: `preferred` (an id or a name such as "Mandi") when it is
 * in the list, else the headquarters centre's district, else the first district with a centre.
 */
export function defaultDistrictId(
  districts: readonly FinderDistrict[],
  centres: readonly Pick<FinderCentre, "slug" | "district" | "isHeadquarters">[],
  preferred?: string,
): DistrictId | undefined {
  const wanted = preferred ? (findDistrict(preferred)?.id ?? preferred) : undefined;
  const has = (id: string | undefined) => districts.find((d) => d.id === id)?.id;
  const hq = centres.find((c) => c.isHeadquarters);
  return (
    has(wanted) ??
    has(hq ? findDistrict(hq.district)?.id : undefined) ??
    districts.find((d) => d.centreSlug !== null)?.id ??
    districts[0]?.id
  );
}
