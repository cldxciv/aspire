import type { StockImageKey } from "@/content/images";

/**
 * Hero carousel photos for /about (licensed stock, shown with "Illustrative stock photo"; D-018 /
 * D-030): study and mentoring across both tracks — a student writing, JEE-style worked solutions,
 * NEET textbooks and a one-to-one conversation. Rules:
 *
 * - No landscapes (D-031: those are kept for the homepage hero).
 * - No result cards: they are preview-only personal data, and a stock-only hero keeps the first
 *   fold identical in preview and production. The page's results bands show them instead.
 * - None of these is used anywhere else on /about, in either content mode (no photo twice per page).
 */
export const ABOUT_HERO_IMAGES = [
  "youngStudentWriting",
  "notebookSolutions",
  "stethoscopeTextbooks",
  "mentoringConversation",
] as const satisfies readonly StockImageKey[];
