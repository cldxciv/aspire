import type { StockImageKey } from "@/content/images";

/**
 * Hero carousel photos for /admissions (licensed stock, shown with "Illustrative stock photo";
 * D-018 / D-030): applying and getting ready — signing a form, an online enquiry beside a notebook,
 * a study plan and a younger student at work (Foundation applicants). Rules:
 *
 * - No landscapes (D-031: those are kept for the homepage hero).
 * - No result cards: they are preview-only personal data, and a stock-only hero keeps the first
 *   fold identical in preview and production. The page's results band shows them instead.
 * - None of these is used anywhere else on /admissions, in either content mode (no photo twice per
 *   page; mentoring is already shown by the "next steps" and FAQ photos).
 */
export const ADMISSIONS_HERO_IMAGES = [
  "signingForm",
  "laptopStudy",
  "notebookPlanning",
  "youngStudentNotebook",
] as const satisfies readonly StockImageKey[];
