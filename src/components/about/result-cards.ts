import type { Locale } from "@/i18n/config";
import { getResultCards, type ResultCard } from "@/lib/data";

/**
 * Result cards from Aspire's previous batches (D-031) for a general section (About, Admissions,
 * Resources — never beside a specific centre, campus or hostel), alternating JEE and NEET so one
 * mosaic shows both tracks. `skip` lets a second mosaic on the same page show different cards.
 *
 * Returns `[]` wherever student names may not be shown (production today: getResultCards() is
 * empty until consent is confirmed); ResultCardMosaic / ResultCardMarquee then render their
 * `fallbackImage` stock photo instead.
 */
export async function mixedResultCards(locale: Locale, count: number, skip = 0): Promise<ResultCard[]> {
  // Enough of each exam to fill `skip + count` even when one track runs short.
  const perExam = skip + count;
  const [jee, neet] = await Promise.all([
    getResultCards({ exam: "JEE", limit: perExam }, locale),
    getResultCards({ exam: "NEET", limit: perExam }, locale),
  ]);
  const mixed: ResultCard[] = [];
  for (let i = 0; i < Math.max(jee.length, neet.length); i++) {
    if (jee[i]) mixed.push(jee[i]);
    if (neet[i]) mixed.push(neet[i]);
  }
  return mixed.slice(skip, skip + count);
}
