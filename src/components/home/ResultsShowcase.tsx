import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
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
 * Home results (plan §4.3, D-030 / D-031): a half-bleed split with a mosaic of Aspire's previous
 * result cards on one side (`media`, from the page: resultMosaicMedia(); each card is the
 * student's own card) and, on the other, the intro above an autoplaying, pausable scroll-snap rail of result cards. Rail
 * cards use initials and a generic graduation mark, never photos or crests. Without visible result
 * cards (production today) the column shows a labelled stock photo of objects only (no people: it
 * may sit beside student names, no landscape). With nothing publishable only the intro renders,
 * with one honest line and the link to /results — no "awaiting" cards. Designed for light tones.
 */
export function ResultsShowcase({
  results,
  locale,
  tone = "white",
  media,
}: {
  results: ResultRecord[];
  locale: Locale;
  tone?: SectionTone;
  /** Result-card mosaic for the photo column (null / undefined → the fallback photo). */
  media?: ReactNode;
}) {
  const cards = toResultCardViews(results, locale);
  const hasCards = cards.length > 0;
  const t = messagesFor(locale, "home").results;
  const { labels, carousel } = messagesFor(locale, "common");

  return (
    <BleedSplit
      aria-labelledby="home-results-title"
      tone={tone === "surface" ? "surface" : "white"}
      imageSide="left"
      image={localizeImage(stockImages.notebookSolutions, locale)}
      media={media}
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
        <p className="mt-4 max-w-prose leading-relaxed text-muted">{hasCards ? t.leadWithCards : t.leadEmpty}</p>
        <ButtonLink href={localePath("/results", locale)} variant="dark" className="mt-7">
          {t.cta} <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </div>
      {hasCards && (
        <div className="mt-10 md:mt-12">
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
              pause: carousel.pause,
              play: carousel.play,
            }}
          />
        </div>
      )}
    </BleedSplit>
  );
}
