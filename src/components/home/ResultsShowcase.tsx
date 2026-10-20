import { ArrowRight } from "lucide-react";
import { trackLabel } from "@/components/programs/exam-meta";
import { ButtonLink, type SectionTone } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { canShowStudentName, isPlaceholder, localizeImage } from "@/lib/data";
import type { ResultRecord } from "@/lib/types";
import { BleedSplit } from "./BleedSplit";
import { ResultRail, type ResultCardView } from "./ResultRail";

/**
 * Server-side projection for the client rail: displayed fields only. The name is
 * dropped unless canShowStudentName() allows it; the record id (which embeds the
 * name), `sourceRef`, `sourceReference`, consent status, school and quote are never sent.
 */
export function toResultCardViews(results: ResultRecord[], locale: Locale = "en"): ResultCardView[] {
  const tracks = messagesFor(locale, "programs").tracks;
  return results.map((result) => ({
    exam: result.examLabel?.trim() || trackLabel(result.exam, tracks),
    outcome: result.rankOrOutcome,
    year: result.year,
    name: canShowStudentName(result) ? result.studentDisplayName?.trim() || null : null,
    destination: result.destination?.trim() || null,
    placeholder: isPlaceholder(result),
  }));
}

/**
 * Home results (plan §4.3, D-030): a half-bleed split with a stock mountain-trail landscape on one
 * side (no people: it sits beside student names) and, on the other, the intro above a scroll-snap
 * rail of result cards. Cards use initials and a generic graduation mark, never photos or crests.
 * With nothing publishable (production today) only the intro renders, with one honest line and the
 * link to /results — no "awaiting" cards. Designed for light tones.
 */
export function ResultsShowcase({
  results,
  locale,
  tone = "white",
}: {
  results: ResultRecord[];
  locale: Locale;
  tone?: SectionTone;
}) {
  const cards = toResultCardViews(results, locale);
  const hasCards = cards.length > 0;
  const t = messagesFor(locale, "home").results;
  const { labels } = messagesFor(locale, "common");

  return (
    <BleedSplit
      aria-labelledby="home-results-title"
      tone={tone === "surface" ? "surface" : "white"}
      imageSide="left"
      image={localizeImage(stockImages.mountainTrail, locale)}
      imageLabel={labels.illustrativeStockPhoto}
      decorative
    >
      <div className="max-w-xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#7a5600]">{t.eyebrow}</p>
        <h2
          id="home-results-title"
          className="mt-2 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.12] tracking-tight text-navy [&:lang(hi)]:leading-[1.3]"
        >
          {t.title}
        </h2>
        <p className="mt-3 text-muted">{hasCards ? t.leadWithCards : t.leadEmpty}</p>
        <ButtonLink href={localePath("/results", locale)} variant="dark" className="mt-6">
          {t.cta} <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </div>
      {hasCards && (
        <div className="mt-8">
          <ResultRail
            cards={cards}
            label={t.railLabel}
            messages={{
              nameWithheld: t.nameWithheld,
              yearPrefix: t.yearPrefix,
              position: t.position,
              positionPrefix: t.positionPrefix,
              previous: t.previous,
              next: t.next,
              demo: labels.demo,
            }}
          />
        </div>
      )}
    </BleedSplit>
  );
}
