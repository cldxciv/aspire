/**
 * Himachal Pradesh's 12 districts for the centre finder, plus the projection behind its
 * illustrative map. Pure and client-safe. Unit-tested in `hero-data.test.ts`.
 *
 * The district table itself (public geography: names in English / Hindi, common spellings and the
 * approximate position of each district headquarters) lives in `@/content/hp-districts`. Which
 * centre serves a district comes only from the centres data (`servesDistricts`, then `district`);
 * see `centreForDistrict` in ./finder-data. Positions are used for the "Illustrative map, not to
 * scale" and, only when the data names no centre for a district, to pick the closest one.
 */
import { HP_DISTRICTS, type DistrictId, type HpDistrict } from "@/content/hp-districts";

export { HP_DISTRICTS, type DistrictId, type HpDistrict };

const normalise = (name: string) =>
  name
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bdistrict\b|ज़िला|जिला/g, " ")
    .replace(/[\s\-–,.]+/g, " ")
    .trim();

const BY_NAME = new Map<string, HpDistrict>(
  HP_DISTRICTS.flatMap((d) => [d.en, d.hi, d.id, ...d.aliases].map((name) => [normalise(name), d] as const)),
);

/** The district a content name refers to ("Mandi", "मंडी", "Lahaul" …), or null. */
export function findDistrict(name: string | undefined): HpDistrict | null {
  return name ? (BY_NAME.get(normalise(name)) ?? null) : null;
}

/** Whether a content name (English or Hindi, any listed spelling) means `district`. */
export function isDistrict(name: string, district: HpDistrict): boolean {
  return findDistrict(name)?.id === district.id;
}

/** The district's name in `locale`. */
export function districtName(district: HpDistrict, locale: "en" | "hi"): string {
  return locale === "hi" ? district.hi : district.en;
}

// Map projection (equirectangular, scaled for Himachal's latitude). Illustrative, not to scale.

export type MapPoint = { x: number; y: number };

const LON0 = 75.55;
const LAT0 = 33.3;
const KY = 140;
const KX = Math.round(KY * Math.cos((31.8 * Math.PI) / 180)); // 119
const PAD = 20;

/** The SVG viewBox the projection draws into (width × height). */
export const CENTRE_MAP_SIZE = { width: 460, height: 456 } as const;

/** A latitude / longitude in map units, rounded to one decimal. */
export function projectLatLon(lat: number, lon: number): MapPoint {
  const round = (n: number) => Math.round(n * 10) / 10;
  return { x: round(PAD + (lon - LON0) * KX), y: round(PAD + (LAT0 - lat) * KY) };
}

/** A district headquarters in map units. */
export function districtPoint(district: HpDistrict): MapPoint {
  return projectLatLon(district.lat, district.lon);
}

/** Rough outline of the state ([lon, lat] corners, clockwise from the west), for the illustrative map only. */
const OUTLINE: readonly (readonly [number, number])[] = [
  [75.6, 32.3],
  [75.8, 32.6],
  [75.95, 32.95],
  [76.35, 33.2],
  [76.75, 33.15],
  [77.15, 32.95],
  [77.7, 32.95],
  [78.1, 32.65],
  [78.4, 32.55],
  [78.75, 32.25],
  [78.85, 31.9],
  [79.0, 31.55],
  [78.8, 31.2],
  [78.4, 31.05],
  [77.85, 30.85],
  [77.75, 30.5],
  [77.55, 30.38],
  [77.25, 30.4],
  [77.0, 30.7],
  [76.85, 30.88],
  [76.65, 31.05],
  [76.4, 31.25],
  [76.15, 31.35],
  [75.95, 31.7],
  [75.8, 31.95],
];

/** SVG path `d` of the outline in map units. */
export const HIMACHAL_OUTLINE_PATH = `${OUTLINE.map(([lon, lat], i) => {
  const { x, y } = projectLatLon(lat, lon);
  return `${i === 0 ? "M" : "L"}${x} ${y}`;
}).join(" ")} Z`;

/** Straight-line distance between two map points, in map units (roughly 0.8 km each). */
export function mapDistance(a: MapPoint, b: MapPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
