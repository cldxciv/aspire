import {
  ArrowRight,
  GraduationCap,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Repeat,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink, DemoBadge, type SectionTone } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { localizeImage } from "@/lib/data";
import type { InstituteProfile } from "@/lib/types";
import { BleedSplit } from "./BleedSplit";

type Point = { title: string; detail: string; Icon: LucideIcon };

/**
 * Honest fallback while no institute profile is publishable (production today): the
 * About page's approach pillars (copy in `home.why.fallbackPoints`, mirroring the About
 * page). Duplicated on purpose — keep both in sync. Wording needs Aspire's approval like
 * the About copy.
 */
const FALLBACK_ICONS = { clarity: Lightbulb, practice: Repeat, feedback: ListChecks, guidance: MessageCircle } as const;

/** Decorative icons for the profile's first four approach points, by position. */
const PROFILE_ICONS: LucideIcon[] = [Users, GraduationCap, MessageCircle, ListChecks];

/**
 * First sentence (or first clause before a semicolon) of a description, for "title plus
 * one line"; the whole text when it has no break. Words are never changed.
 */
function firstSentence(text: string): string {
  const match = text.trim().match(/^.*?(?:[.!?](?=\s|$)|;)/);
  return (match ? match[0] : text).trim().replace(/;$/, ".");
}

/**
 * Why Aspire / story (plan §4.5, D-030 / D-031): a half-bleed column of Aspire's previous result
 * cards (`media`, from the page: resultMosaicMedia()) — or, without visible cards (production
 * today), a labelled stock teaching photo with a decorative serif-italic line — beside the
 * profile's mission and summary with an "Our story" link to /about, and four gold-circle points
 * from `profile.approach`. The profile is one record, so the section carries one DEMO badge while
 * it is a placeholder. With no profile (production today) it shows generic copy and the About
 * page's four neutral approach points. Designed for light tones.
 */
export function WhyAspire({
  profile,
  locale,
  tone = "white",
  media,
}: {
  profile: InstituteProfile | null;
  locale: Locale;
  tone?: SectionTone;
  /** Result-card mosaic for the photo column (null / undefined → the fallback photo). */
  media?: ReactNode;
}) {
  const t = messagesFor(locale, "home").why;
  const common = messagesFor(locale, "common");
  const fallbackPoints: Point[] = (Object.keys(FALLBACK_ICONS) as (keyof typeof FALLBACK_ICONS)[]).map((key) => ({
    Icon: FALLBACK_ICONS[key],
    ...t.fallbackPoints[key],
  }));
  const points: Point[] =
    profile && profile.approach.length > 0
      ? profile.approach.slice(0, 4).map((point, index) => ({
          title: point.title,
          detail: firstSentence(point.description),
          Icon: PROFILE_ICONS[index],
        }))
      : fallbackPoints;

  return (
    <BleedSplit
      aria-labelledby="home-approach-title"
      tone={tone === "surface" ? "surface" : "white"}
      imageSide="left"
      image={localizeImage(stockImages.teacherChalkboard, locale)}
      media={media}
      imageLabel={common.labels.illustrativeStockPhoto}
      decorative
      overlay={
        <p
          aria-hidden="true"
          className="font-serif text-3xl leading-tight text-white italic md:text-4xl lg:text-5xl [&:lang(hi)]:not-italic [&:lang(hi)]:leading-snug"
        >
          {t.imageLine1}
          <br />
          {t.imageLine2}
        </p>
      }
    >
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#7a5600]">{t.eyebrow}</p>
        <h2
          id="home-approach-title"
          className="mt-2 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.12] tracking-tight text-navy [&:lang(hi)]:leading-[1.3]"
        >
          {t.title}
        </h2>
        {profile ? (
          <>
            <p className="mt-5 text-lg font-semibold leading-snug text-navy">{profile.mission.title}</p>
            <p className="mt-3 max-w-prose leading-relaxed text-muted">{profile.summary}</p>
            {profile.status === "placeholder" && (
              <div className="mt-4">
                <DemoBadge label={common.labels.demoPending} />
              </div>
            )}
          </>
        ) : (
          <p className="mt-5 max-w-prose leading-relaxed text-muted">{t.fallbackLead}</p>
        )}
        <div className="mt-7">
          <ButtonLink href={localePath("/about", locale)}>
            {t.cta} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </div>
      </div>

      {/* Two columns on tablets; one from `lg`, where the copy shares the width with the media column. */}
      <ul className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2 md:mt-12 lg:grid-cols-1 lg:gap-y-6">
        {points.map(({ title, detail, Icon }) => (
          <li key={title} className="flex gap-4">
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-gold bg-gold-soft text-[#8a6100]"
            >
              <Icon className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-semibold leading-snug text-navy">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </BleedSplit>
  );
}
