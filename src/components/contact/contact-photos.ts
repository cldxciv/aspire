import type { StockImageKey } from "@/content/images";

/**
 * Stock photos on /contact (D-030; licensed stock only, D-018). Study / desk / form scenes only:
 * no landscapes and no result cards (D-031), and nothing that reads as an Aspire campus or office.
 * Every photo appears once per page, so the hero and body lists must never overlap
 * (contact-photos.test.ts checks it).
 */

/**
 * Hero carousel, in slide order: a student taking notes, an enquiry form, planning at a desk, worked
 * practice (1600px 3:2 sources where possible, so the hero stays sharp on DPR-2 tablets).
 */
export const CONTACT_HERO_KEYS = [
  "youngStudentNotebook",
  "signingForm",
  "notebookPlanning",
  "notebookSolutions",
] as const satisfies readonly StockImageKey[];

/** Beside the enquiry form. */
export const CONTACT_FORM_PHOTO: StockImageKey = "laptopStudy";
/** Beside the contact details. */
export const CONTACT_DETAILS_PHOTO: StockImageKey = "mentoringConversation";
/** Behind the "need help?" / "looking for a centre?" panel. */
export const CONTACT_HELP_PHOTO: StockImageKey = "tableDiscussion";

/**
 * Campus desks, in desk order: generic study scenes, labelled as stock and never captioned as a
 * campus or office.
 */
export const CONTACT_DESK_PHOTOS = [
  "classroomDesks",
  "seminarFromBehind",
  "libraryReading",
  "booksAndNotebook",
] as const satisfies readonly StockImageKey[];

/** Every body photo of /contact (any content mode), never reused in its hero. */
export const CONTACT_BODY_KEYS: readonly StockImageKey[] = [
  CONTACT_FORM_PHOTO,
  CONTACT_DETAILS_PHOTO,
  CONTACT_HELP_PHOTO,
  ...CONTACT_DESK_PHOTOS,
];
