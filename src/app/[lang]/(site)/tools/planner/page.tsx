import { BookOpenCheck, CalendarRange, Flame, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import type { ClientCard, PlannerData } from "@/components/planner/model";
import { PlannerApp } from "@/components/planner/PlannerApp";
import { ButtonLink, EmptyState, Notice, PageHero, Section, SectionHeading } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { stockImages } from "@/content/images";
import { FLASHCARDS, FLASHCARDS_STATUS } from "@/content/planner/flashcards";
import { getSyllabusTopics, MOCK_MINUTES, SYLLABUS_STATUS } from "@/content/planner/syllabus";
import type { Locale } from "@/i18n/config";
import { htmlLang } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { showPlaceholderContent } from "@/lib/content-mode";
import { localizeImage } from "@/lib/data";
import { EXAM_IDS, type ClientTopic, type ExamId } from "@/lib/planner/types";

const PATH = "/tools/planner";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("planner");
  return { title: t.meta.title, description: t.meta.description, alternates: await localeAlternates(PATH) };
}

/** Syllabus and flashcards in the page's language only (the other language never ships). */
function plannerData(locale: Locale, withCards: boolean): PlannerData {
  const topics: Record<string, ClientTopic> = {};
  const examTopics = {} as Record<ExamId, string[]>;
  for (const exam of EXAM_IDS) {
    const list = getSyllabusTopics(exam);
    examTopics[exam] = list.map((topic) => topic.id);
    for (const topic of list) topics[topic.id] = { id: topic.id, subject: topic.subject, level: topic.level, name: topic.name[locale] };
  }
  const cards: ClientCard[] = withCards
    ? FLASHCARDS.map((card) => ({
        id: card.id,
        subject: card.subject,
        topics: card.topics,
        levels: card.levels,
        front: card.front[locale],
        back: card.back[locale],
      }))
    : [];
  return { topics, examTopics, cards, mockMinutes: { ...MOCK_MINUTES } };
}

const STEPS = [
  { key: "plan", Icon: CalendarRange },
  { key: "revise", Icon: BookOpenCheck },
  { key: "streak", Icon: Flame },
] as const;

const HONEST = ["suggestion", "reminders", "privacy"] as const;

/**
 * Smart study planner (M6, A4-PLANNER; D-032/D-033/D-034). The page is static; everything personal
 * happens in the browser (`localStorage`) and, for signed-in students, through /api/planner/*.
 * The syllabus map, plan template and flashcards are SAMPLE content until Aspire approves them, so
 * the planner is shown only when placeholder content is on (dev / demo builds), labelled "Sample".
 */
export default async function PlannerPage() {
  const [locale, t, tc, tTools] = await Promise.all([getLocale(), getMessages("planner"), getMessages("common"), getMessages("tools")]);
  const showSamples = showPlaceholderContent();
  const available = SYLLABUS_STATUS === "published" || showSamples;
  const withCards = FLASHCARDS_STATUS === "published" || showSamples;
  const sample = SYLLABUS_STATUS !== "published" || (withCards && FLASHCARDS_STATUS !== "published");
  const pageUrl = new URL(localePath(PATH, locale), siteConfig.url).toString();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: t.hero.title,
    url: pageUrl,
    description: t.meta.description,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    inLanguage: htmlLang[locale],
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    provider: { "@type": "EducationalOrganization", name: siteConfig.name, url: siteConfig.url },
  };

  return (
    <>
      {available && (
        <script
          type="application/ld+json"
          // JSON-LD per the Next guide; "<" escaped so no string can close the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      <PageHero
        title={t.hero.title}
        lead={<p>{t.hero.lead}</p>}
        crumbs={[{ label: tTools.meta.title, href: localePath("/tools", locale) }, { label: t.hero.crumb }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        image={localizeImage(stockImages.booksAndNotebook, locale)}
        imageLabel={tc.labels.illustrativeStockPhoto}
      />

      <Section tone="surface">
        {available ? (
          <div className="grid min-w-0 gap-5">
            {sample && (
              <Notice variant="warning" title={t.sample.badge}>
                {t.sample.note}
              </Notice>
            )}
            <PlannerApp
              t={t}
              locale={locale}
              data={plannerData(locale, withCards)}
              sample={sample}
              links={{
                signIn: localePath("/login", locale),
                mockTests: localePath("/tools/mock-tests", locale),
                self: localePath(PATH, locale),
              }}
            />
          </div>
        ) : (
          <EmptyState
            title={t.unavailable.title}
            description={<p>{t.unavailable.body}</p>}
            action={<ButtonLink href={localePath("/tools/mock-tests", locale)}>{t.unavailable.cta}</ButtonLink>}
          />
        )}
      </Section>

      <Section tone="white" aria-labelledby="planner-how-title">
        <SectionHeading id="planner-how-title" title={t.how.title} />
        <ol className="grid list-none gap-4 p-0 md:grid-cols-3">
          {STEPS.map(({ key, Icon }, index) => (
            <li key={key} className="rounded-card border border-line bg-surface p-5">
              <Icon aria-hidden="true" className="size-6 text-blue" />
              <h3 className="mt-3 font-bold text-navy">
                {index + 1}. {t.how.steps[key].title}
              </h3>
              <p className="mt-1 text-sm text-muted">{t.how.steps[key].body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 rounded-card border border-line p-5">
          <h3 className="flex items-center gap-2 font-bold text-navy">
            <ShieldCheck aria-hidden="true" className="size-5 text-blue" />
            {t.how.honestTitle}
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted marker:text-blue">
            {HONEST.map((key) => (
              <li key={key}>{t.how.honest[key]}</li>
            ))}
          </ul>
        </div>
      </Section>
    </>
  );
}
