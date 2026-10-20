import type { StockImageKey } from "@/content/images";

/**
 * Stock photos on /hostels (D-030; licensed stock only, D-018). No landscapes and never result
 * cards beside a hostel or campus (D-031). Every photo appears once per page, so the hero list and
 * the body lists must never overlap (hostels-page.test.ts checks it). The page captions them as not
 * an Aspire hostel or campus.
 */

/**
 * Hero carousel, in slide order: residence life (evening study, a room, a meal, a desk lamp late
 * at night). This is all a visitor sees in production until hostel details are verified, so the
 * residence photos live here rather than beside the (preview-only) room and menu lists.
 */
export const HOSTEL_HERO_KEYS = [
  "studyThroughWindow",
  "bunkBedRoom",
  "steelThali",
  "deskLampEvening",
] as const satisfies readonly StockImageKey[];

/** Beside the empty state ("talk to a counsellor") when no hostel details are publishable. */
export const HOSTEL_EMPTY_PHOTO: StockImageKey = "mentoringConversation";

/** Body photos with hostel details (preview today), by slot. */
export const HOSTEL_PHOTOS = {
  intro: "youngStudentWriting",
  care: "libraryReading",
  girls: "studentsWalkingPath",
  roomsPanel: "laptopStudy",
  roomFeatures: "notebookPlanning",
  dayPanel: "pocketWatchWorksheet",
  /** Beside the daily routine and the menu highlights. */
  day: "notebookSolutions",
  cta: "signingForm",
} as const satisfies Record<string, StockImageKey>;

/** Beside the campus hostel cards, in card order. */
export const HOSTEL_CAMPUS_PHOTOS = [
  "tableDiscussion",
  "booksAndNotebook",
  "mathsNotebook",
  "libraryAisle",
] as const satisfies readonly StockImageKey[];

/** Every body photo of /hostels (any content mode), never reused in its hero. */
export const HOSTEL_BODY_KEYS: readonly StockImageKey[] = [
  HOSTEL_EMPTY_PHOTO,
  ...Object.values(HOSTEL_PHOTOS),
  ...HOSTEL_CAMPUS_PHOTOS,
];
