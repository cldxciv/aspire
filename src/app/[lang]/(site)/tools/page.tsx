import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge, ButtonLink, MediaSplit, Notice, PageHero, Section } from "@/components/ui";
import { heroSlides } from "@/components/ui/hero-slides";
import { stockImages } from "@/content/images";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getAskConfig } from "@/lib/ask/config";
import { localizeImage } from "@/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("tools");
  return { title: t.meta.title, description: t.meta.description, alternates: await localeAlternates("/tools") };
}

/** Student tools hub (M6, docs/m6-plan.md): one image-led split per tool (D-030), alternating sides. */
const TOOLS = [
  { key: "predictor", href: "/tools/predictor", image: stockImages.graduateSilhouette, status: "sample" },
  { key: "mockTests", href: "/tools/mock-tests", image: stockImages.pocketWatchWorksheet, status: "sample" },
  // "live": the status depends on ANTHROPIC_API_KEY, which only exists at runtime (see AskStatusBadge).
  { key: "ask", href: "/tools/ask", image: stockImages.notebookSolutions, status: "live" },
  // Syllabus + flashcards are sample content (D-032) until Aspire reviews them.
  { key: "planner", href: "/tools/planner", image: stockImages.notebookPlanning, status: "sample" },
] as const;

const STATUS_BADGE = { sample: "demo", notConnected: "warning", ready: "success" } as const;

type ToolStatusLabels = Record<keyof typeof STATUS_BADGE, string>;

/**
 * Ask Aspire is "Ready" only when the server has an API key. Read at request time (the page shell
 * stays static under Cache Components); the key itself never leaves the server.
 */
async function AskStatusBadge({ labels }: { labels: ToolStatusLabels }) {
  await connection();
  const status = getAskConfig().configured ? "ready" : "notConnected";
  return <Badge variant={STATUS_BADGE[status]}>{labels[status]}</Badge>;
}

/** Hero carousel: study and tech stock photos, none of them reused by the tool splits below. */
const HERO_IMAGES = [
  stockImages.laptopStudy,
  stockImages.studyThroughWindow,
  stockImages.physicsWhiteboard,
  stockImages.booksAndNotebook,
] as const;

export default async function ToolsPage() {
  const [locale, t, tc] = await Promise.all([getLocale(), getMessages("tools"), getMessages("common")]);
  const stockLabel = tc.labels.illustrativeStockPhoto;

  return (
    <>
      <PageHero
        title={t.hero.title}
        lead={<p>{t.hero.lead}</p>}
        crumbs={[{ label: t.meta.title }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        slides={heroSlides(HERO_IMAGES, stockLabel, locale)}
      />
      {TOOLS.map((tool, index) => {
        const copy = t.items[tool.key];
        const headingId = `tool-${tool.key}`;
        return (
          <Section key={tool.key} tone={index % 2 === 0 ? "white" : "surface"} aria-labelledby={headingId}>
            <MediaSplit
              image={localizeImage(tool.image, locale)}
              imageLabel={stockLabel}
              imageSide={index % 2 === 0 ? "right" : "left"}
            >
              {tool.status === "live" ? (
                <Suspense fallback={<span aria-hidden="true" className="block h-6" />}>
                  <AskStatusBadge labels={t.status} />
                </Suspense>
              ) : (
                <Badge variant={STATUS_BADGE[tool.status]}>{t.status[tool.status]}</Badge>
              )}
              <h2 id={headingId} className="mt-3 font-serif text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-tight text-navy">
                {copy.title}
              </h2>
              <p className="mt-3 text-muted">{copy.body}</p>
              <ButtonLink href={localePath(tool.href, locale)} className="mt-6">
                {t.open} · {copy.title}
              </ButtonLink>
            </MediaSplit>
          </Section>
        );
      })}
      <Section tone="white">
        <Notice>{t.note}</Notice>
      </Section>
    </>
  );
}
