import type { CollagePhoto, ProofStat } from "@/components/hero";
import { stockImages, type StockImageKey } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { isPlaceholder, localizeImage } from "@/lib/data";
import type { Stat } from "@/lib/types";

/**
 * Hero collage photos for /about and /admissions (design A · "proof up front", 2026-10-22): a large
 * photo and a small one, licensed stock shown with "Illustrative stock photo" (D-018 / D-030). Rules:
 *
 * - No landscapes (D-031: those are kept for the homepage hero).
 * - None of these is used anywhere else on its page, in either content mode (no photo twice per page).
 * - The people shown are not Aspire's students or staff; the label says so.
 *
 * About: worked solutions (JEE) and a stethoscope on textbooks (NEET), so both tracks are in view.
 * Admissions: signing a form and an online enquiry beside a notebook (applying, getting ready).
 */
export const ABOUT_HERO_PHOTOS = ["notebookSolutions", "stethoscopeTextbooks"] as const satisfies readonly StockImageKey[];
export const ADMISSIONS_HERO_PHOTOS = ["signingForm", "laptopStudy"] as const satisfies readonly StockImageKey[];

/** The collage's photos in `locale` (alt text), each with its visible stock-photo label. */
export function heroCollagePhotos(keys: readonly StockImageKey[], label: string, locale: Locale): CollagePhoto[] {
  return keys.map((key) => ({ image: localizeImage(stockImages[key], locale), label }));
}

/**
 * Design A's three proof figures, chosen by stat id from getStats() (values and labels exactly as
 * the data states them; placeholders carry the DEMO badge). A stat that is not published — every
 * one in production today — is simply left out, so ProofStats renders nothing rather than a guess.
 */
export const ABOUT_PROOF_STAT_IDS = ["stat-doctors-iitians", "stat-campuses", "stat-years"] as const;
export const ADMISSIONS_PROOF_STAT_IDS = ["stat-campuses", "stat-batch-cap", "stat-student-mentor-ratio"] as const;

export function heroProofStats(stats: readonly Stat[], ids: readonly string[]): ProofStat[] {
  return ids.flatMap((id) => {
    const stat = stats.find((s) => s.id === id);
    return stat ? [{ value: stat.value, label: stat.label, placeholder: isPlaceholder(stat) }] : [];
  });
}
