import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RanchoMediaPanel } from "@/components/ask/RanchoMediaPanel";
import { HeroAction, HeroFrame } from "@/components/hero";
import { layoutPreviewBanner } from "@/components/page-layout/preview-banner";
import { PageLayoutFrame, type LayoutSlots, type SectionContext } from "@/components/page-layout/render";
import { RanchoAppCard } from "@/components/pwa/RanchoAppCard";
import { Badge, ButtonLink, MediaSplit, Notice, Section } from "@/components/ui";
import { Container, SECTION_PANEL } from "@/components/ui/Layout";
import { stockImages } from "@/content/images";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getAskConfig } from "@/lib/ask/config";
import { localizeImage } from "@/lib/data";
import { getPageLayout } from "@/lib/page-layout/loader";
import type { LayoutSectionKey } from "@/lib/page-layout/registry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("tools");
  return { title: t.meta.title, description: t.meta.description, alternates: await localeAlternates("/tools") };
}

/**
 * Student tools hub (M6, docs/m6-plan.md): one image-led split per tool (D-030). Each key is also
 * the tool's section key in the page layout registry; the photo side alternates with the tone.
 */
const TOOLS = [
  { key: "predictor", href: "/tools/predictor", image: stockImages.graduateSilhouette, status: "sample" },
  { key: "mockTests", href: "/tools/mock-tests", image: stockImages.pocketWatchWorksheet, status: "sample" },
  // Rancho, the AI doubt solver (formerly "Ask Aspire"): the card shows the mascot (`media` below)
  // instead of this photo. "live": the status depends on ANTHROPIC_API_KEY, which only exists at
  // runtime (see AskStatusBadge).
  { key: "ask", href: "/tools/ask", image: stockImages.notebookSolutions, status: "live" },
  // Syllabus + flashcards are sample content (D-032) until Aspire reviews them.
  { key: "planner", href: "/tools/planner", image: stockImages.notebookPlanning, status: "sample" },
] as const;

type Tool = (typeof TOOLS)[number];
type ToolKey = Tool["key"];

/** Each tool by its key (also its section key in the page layout registry). */
const TOOL_BY_KEY = Object.fromEntries(TOOLS.map((tool) => [tool.key, tool])) as {
  readonly [K in ToolKey]: Extract<Tool, { key: K }>;
};

const STATUS_BADGE = { sample: "demo", notConnected: "warning", ready: "success" } as const;

type ToolStatusLabels = Record<keyof typeof STATUS_BADGE, string>;

/**
 * Rancho (the AI doubt solver) is "Ready" only when the server has an API key. Read at request time (the page shell
 * stays static under Cache Components); the key itself never leaves the server.
 */
async function AskStatusBadge({ labels }: { labels: ToolStatusLabels }) {
  await connection();
  const status = getAskConfig().configured ? "ready" : "notConnected";
  return <Badge variant={STATUS_BADGE[status]}>{labels[status]}</Badge>;
}

/**
 * The hero's white card: one 48 px link per tool (in the page layout's order, hidden tools included:
 * their pages still exist, D10), so a student can go straight to the tool they came for. Server
 * component.
 */
function ToolLinksCard({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div data-surface="light" className="rounded-card bg-white p-5 text-ink shadow-[0_28px_56px_-28px_rgb(0_0_0/0.65)] sm:p-6">
      <p id="tools-hero-links" className="m-0 text-xs font-bold tracking-[0.12em] text-blue uppercase">
        {title}
      </p>
      <ul aria-labelledby="tools-hero-links" className="m-0 mt-3 list-none p-0">
        {links.map((link) => (
          <li key={link.href} className="border-t border-line">
            <Link
              href={link.href}
              className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px] font-semibold text-navy hover:text-blue hover:underline"
            >
              {link.label}
              <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Hero (B · Himalayan editorial, 2026-10-22 hero redesign): ridge art, the headline with a gold
 * underline, the main action (ask Rancho, the AI doubt solver) and a card linking to each tool. No
 * hero photo; the tool sections below keep their stock photos (D-030) and the Rancho mascot.
 * Page layout (docs/page-layout-plan.md): the sections after the hero follow the published layout
 * (`getPageLayout("tools")`, editable by a super admin; the closing note stays last). Each section
 * is a slot; tones alternate over the sections that render (PageLayoutFrame; the Rancho app card
 * brings its own white band) and each tool's photo switches sides with the tone (D8), so the
 * default layout looks exactly as before.
 */
export default async function ToolsPage() {
  const [locale, t, tc, ranchoApp, layout] = await Promise.all([
    getLocale(),
    getMessages("tools"),
    getMessages("common"),
    getMessages("ranchoApp"),
    getPageLayout("tools"),
  ]);
  const stockLabel = tc.labels.illustrativeStockPhoto;

  // The hero card lists every tool in layout order, hidden ones included (D10).
  const toolsInOrder = layout.entries.flatMap(({ key }) => TOOLS.filter((tool) => tool.key === key));

  /** A tool's section, built from its TOOLS entry; the tone and photo side come from its position. */
  const toolSection = (key: ToolKey, { tone, side }: SectionContext<LayoutSectionKey<"tools">>) => {
    const tool = TOOL_BY_KEY[key];
    const copy = t.items[tool.key];
    const headingId = `tool-${tool.key}`;
    return (
      <Section tone={tone} aria-labelledby={headingId}>
        <MediaSplit
          image={localizeImage(tool.image, locale)}
          imageLabel={stockLabel}
          media={tool.key === "ask" ? <RanchoMediaPanel title={t.ranchoMascot} caption={t.ranchoCaption} /> : undefined}
          imageSide={side}
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
  };

  // One slot per section, rendered in layout order.
  const slots: LayoutSlots<"tools"> = {
    // Rancho is the installable app that bundles these tools (components/pwa, /rancho). Its own
    // white band (registry `background: "own"`): the tool sections after it start at white.
    rancho: () => (
      <section aria-labelledby="rancho-app-card" className={`${SECTION_PANEL} bg-white`}>
        <Container gutters="section" className="py-5 sm:py-6">
          <RanchoAppCard messages={ranchoApp.toolsCard} href={localePath("/rancho", locale)} />
        </Container>
      </section>
    ),
    predictor: (ctx) => toolSection("predictor", ctx),
    mockTests: (ctx) => toolSection("mockTests", ctx),
    ask: (ctx) => toolSection("ask", ctx),
    planner: (ctx) => toolSection("planner", ctx),
    note: ({ tone }) => (
      <Section tone={tone}>
        <Notice>{t.note}</Notice>
      </Section>
    ),
  };

  return (
    <PageLayoutFrame
      layout={layout}
      banner={await layoutPreviewBanner(layout)}
      hero={
        <HeroFrame
          art="ridges"
          layout="editorial"
          eyebrow={t.hero.eyebrow}
          eyebrowStyle="caps"
          title={t.hero.title}
          highlight={t.hero.highlight}
          highlightStyle="underline"
          lead={t.hero.lead}
          crumbs={[{ label: t.meta.title }]}
          homeLabel={tc.labels.home}
          homeHref={localePath("/", locale)}
          actions={<HeroAction href={localePath("/tools/ask", locale)}>{t.hero.primary}</HeroAction>}
          aside={
            <ToolLinksCard
              title={t.hero.listTitle}
              links={toolsInOrder.map((tool) => ({ href: localePath(tool.href, locale), label: t.items[tool.key].title }))}
            />
          }
          asideAlign="start"
        />
      }
      slots={slots}
    />
  );
}
