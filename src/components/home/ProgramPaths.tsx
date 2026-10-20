import { ArrowRight } from "lucide-react";
import { ButtonLink, EmptyState, type SectionTone } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import type { Program } from "@/lib/types";
import { BleedSplit } from "./BleedSplit";
import { ProgramPathRow } from "./ProgramPathRow";

/**
 * Home programs (plan §4.4, D-030): a half-bleed split — the intro above one tinted row per
 * program, beside a decorative stock classroom photo (not Aspire students: alt="", labelled,
 * lazy-loaded). Row labels come from each program's own title and class level. With no
 * publishable programs, a compact empty state points to the enquiry form. Designed for light tones.
 */
export function ProgramPaths({
  programs,
  locale,
  tone = "white",
}: {
  programs: Program[];
  locale: Locale;
  tone?: SectionTone;
}) {
  const t = messagesFor(locale, "home").programs;
  const { labels } = messagesFor(locale, "common");
  const demoLabel = labels.demo;
  return (
    <BleedSplit
      aria-labelledby="home-programs-title"
      tone={tone === "surface" ? "surface" : "white"}
      imageSide="right"
      image={stockImages.studentsTakingNotes}
      imageLabel={labels.illustrativeStockPhoto}
      decorative
    >
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#7a5600]">{t.eyebrow}</p>
        <h2
          id="home-programs-title"
          className="mt-2 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.12] tracking-tight text-navy [&:lang(hi)]:leading-[1.3]"
        >
          {t.title}
        </h2>
        <p className="mt-3 max-w-xl text-muted">{t.lead}</p>
        <ButtonLink href={localePath("/programs", locale)} variant="dark" className="mt-6">
          {t.cta} <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </div>

      <div className="mt-8">
        {programs.length > 0 ? (
          <ul aria-labelledby="home-programs-title" className="space-y-3">
            {programs.map((program) => (
              <li key={program.id}>
                <ProgramPathRow program={program} locale={locale} demoLabel={demoLabel} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={t.emptyTitle}
            description={t.emptyBody}
            action={<ButtonLink href={localePath("/admissions#enquiry", locale)}>{t.emptyCta}</ButtonLink>}
          />
        )}
      </div>
    </BleedSplit>
  );
}
