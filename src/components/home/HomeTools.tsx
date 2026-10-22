import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  CalendarRange,
  Clock,
  Flame,
  Gauge,
  Info,
  Languages,
  Layers,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  MessageCircleQuestionMark,
  Sparkles,
  Timer,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { RANCHO_MOTION_ONCE } from "@/components/ask/RanchoMediaPanel";
import { RanchoMascot } from "@/components/rancho/RanchoMascot";
import { Section, type SectionTone } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { askExampleDetail, HOME_ASK_EXAMPLES, homeToolOrder, type HomeToolKey } from "./home-tools";
import type { HomeToolsData } from "./home-tools-data";
import { AskRanchoLink } from "./HomeToolsAskRancho";
import { HI_SMALL, PanelHead, SampleTag, STAGE_INFO, STAGE_INFO_LABEL, ToolPanel, ToolStage } from "./HomeToolsPanel";
import { HomeToolsPlanner } from "./HomeToolsPlanner";
import { HomeToolsPredictor } from "./HomeToolsPredictor";
import { HomeToolsTabs, type HomeToolTab } from "./HomeToolsTabs";
import { TextLink } from "./TextLink";

const PLANNER_FEATURES: { key: "plan" | "revise" | "cards" | "streak"; Icon: LucideIcon }[] = [
  { key: "plan", Icon: CalendarRange },
  { key: "revise", Icon: BookOpenCheck },
  { key: "cards", Icon: Layers },
  { key: "streak", Icon: Flame },
];

/** A stage message for a tool that is not available on this deployment (production today). */
function StageNotice({ Icon, title, body }: { Icon: LucideIcon; title?: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-blue ring-1 ring-[#d3e2f5]">
        <Icon className="size-5" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 text-sm">
        {title && <p className="mb-1 font-bold text-navy">{title}</p>}
        <p className="leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

/**
 * Homepage "Free student tools" section (owner request: the tools as a homepage widget that
 * blends in; redesigned 22 Oct 2026 as one card with a tool picker). A short header (eyebrow, h2,
 * lead, the "may be asked for a contact number" line before any tool, plan §11.4), then a card:
 * four tiles across the top (HomeToolsTabs; working tools first, so the section never opens on
 * "Coming soon"), one ToolPanel per tool (head, controls, a tinted stage that always shows
 * something real, exits as blue text links; one gold action per state), and a footer bar with the
 * privacy and language points and "See all tools".
 * - Rank predictor: exam + score/percentile → rank band, in the browser, on the score tables the
 *   server allows (sample tables labelled; none in production → description + link). Lead gate
 *   (docs/lead-gate-plan.md §8.2): the band shows after the visitor shares contact details once
 *   per browser (recap + form in the stage; signed-in accounts skip it only with a mobile number
 *   on file).
 * - Mock tests: up to three visible tests, each row one link (weekly / practice and sample tests labelled).
 * - Ask Rancho (Aspire's snow leopard mascot, and the AI doubt solver at /tools/ask): Rancho waving
 *   beside example doubts; each example opens the page's Rancho chat with that question prefilled
 *   (a window event, never a URL; a plain /tools/ask link without JS), plus the AI caveat.
 * - Study planner: exam + date → days left, computed in the browser. Gated like the predictor
 *   (owner update, 22 Oct 2026): "Show days left" asks for contact details once before the
 *   countdown, and records the exam only.
 * The `leadGate` messages are passed from here, so the section stays static; the gate's state is
 * client-only. No request data, clock or random values while rendering. Exact scores and dates
 * typed in the widget never leave the browser. What the predictor and countdown do send: the
 * gate's status check (GET /api/lead-gate, client-side, once per page view, for the up-front
 * note); the contact form (the visitor's details with the exam and, for the predictor, the score
 * band); and, for a browser that shared details and whose pass records use, one note per press
 * that ends in a result (exam, the predictor's score band, page; never the exact score or date).
 * Self-contained (no sticky, no negative margins, works in white or surface tone), but its ids are
 * fixed: render it at most once per page (note for the future page-layout feature). No photos
 * (D-030 photo budget); the mascot is illustration, not a photo.
 */
export function HomeTools({ tools, locale, tone = "white" }: { tools: HomeToolsData; locale: Locale; tone?: SectionTone }) {
  const t = messagesFor(locale, "home").tools;
  const tt = messagesFor(locale, "tools");
  const tp = messagesFor(locale, "predictor");
  const tm = messagesFor(locale, "mocktest");
  const ta = messagesFor(locale, "ask");
  const tpl = messagesFor(locale, "planner");
  const gateMessages = messagesFor(locale, "leadGate");
  const href = (path: string) => localePath(path, locale);

  const predictorBadge = !tools.predictor ? (
    <SampleTag tone="neutral" label={tp.notices.comingSoonTitle} />
  ) : tools.predictor.sample ? (
    <SampleTag tone="sample" label={tt.status.sample} />
  ) : undefined;
  const predictorHead = (
    <PanelHead
      title={tt.items.predictor.title}
      tagline={t.taglines.predictor}
      badge={predictorBadge}
      lead={tools.predictor ? t.predictor.lead : tp.hero.lead}
    />
  );

  const predictorPanel = tools.predictor ? (
    <HomeToolsPredictor
      data={tools.predictor.data}
      locale={locale}
      head={predictorHead}
      exits={<TextLink href={href("/tools/predictor")}>{t.predictor.cta}</TextLink>}
      messages={{
        exam: tp.form.exam,
        exams: tp.form.exams,
        mode: tp.form.mode,
        modes: tp.form.modes,
        score: tp.form.score,
        scoreHint: tp.form.scoreHint,
        percentile: tp.form.percentile,
        percentileHint: tp.form.percentileHint,
        errorValue: tp.form.errorValue,
        submit: tp.form.submit,
        pending: tp.form.checking,
        empty: t.predictor.empty,
        // The mini predictor does the first two steps; colleges are the full predictor's (the exit link).
        how: { title: tp.how.title, steps: [tp.how.step1Title, tp.how.step2Title] },
        ready: t.predictor.ready,
        change: t.predictor.change,
        crl: tp.result.crl,
        range: tp.result.range,
        percentileBand: tp.result.percentileBand,
        percentileYours: tp.result.percentileYours,
        basedOn: tp.result.basedOn,
        basedOnSample: tp.result.basedOnSample,
        bandNote: tp.result.bandNote,
        rangeScore: tp.share.rangeScore,
        rangePercentile: tp.share.rangePercentile,
        askRancho: tp.result.askRancho,
        askRanchoPrompt: tp.result.askRanchoPrompt,
        askRanchoContext: tp.result.askRanchoContext,
        askRanchoSample: tp.result.askRanchoSample,
      }}
      gateMessages={gateMessages}
    />
  ) : (
    <ToolPanel
      head={predictorHead}
      stage={
        <ToolStage tone="default">
          {/* The "Coming soon" tag sits in the title row. */}
          <StageNotice Icon={Gauge} body={tp.notices.comingSoonBody} />
        </ToolStage>
      }
      exits={
        <TextLink href={href("/tools/predictor")}>
          {tt.open} · {tt.items.predictor.title}
        </TextLink>
      }
    />
  );

  const mockTestsPanel = (
    <ToolPanel
      head={<PanelHead title={tt.items.mockTests.title} tagline={t.taglines.mockTests} lead={t.mockTests.lead} />}
      stage={
        <ToolStage tone="default">
          {tools.tests.length > 0 ? (
            <>
              <p className="mb-2.5 text-[13px] font-bold text-[#354b66]">{t.mockTests.listLabel}</p>
              <ul aria-label={t.mockTests.listLabel} className="grid gap-2.5">
                {tools.tests.map((test) => (
                  <li key={test.id}>
                    <Link
                      href={href(`/tools/mock-tests/${test.id}`)}
                      className="group flex min-h-[4.25rem] items-center gap-3 rounded-control bg-white p-3 ring-1 ring-[#d3e2f5] hover:ring-blue sm:p-3.5"
                    >
                      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-soft text-blue">
                        <Timer className="size-5" strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] leading-snug font-bold break-words text-navy">{test.title[locale]}</span>
                        <span className={cn("mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted", HI_SMALL)}>
                          {/* First in the line, so the tag never wraps onto a line of its own. */}
                          {test.sample && <SampleTag tone="sample" label={tm.common.sample} />}
                          <span className="font-semibold text-[#354b66]">{tm.common.exams[test.exam]}</span>
                          {/* Same labels as /tools/mock-tests: the weekly All-Himachal Mock stands apart from practice tests. */}
                          <span>{test.kind === "weekly" ? tm.list.weekly : tm.list.practice}</span>
                          <span className="inline-flex items-center gap-1">
                            <ListChecks aria-hidden="true" className="size-3.5 text-blue" />
                            {format(tm.common.questions, { n: test.questionCount })}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock aria-hidden="true" className="size-3.5 text-blue" />
                            {format(tm.common.minutes, { n: test.durationMinutes })}
                          </span>
                        </span>
                      </span>
                      {/* Visible only where the stage is wide (1440); narrower rows keep the text for the meta line and show the arrow (still named "Start test"). */}
                      <span className="text-sm font-extrabold text-blue @max-[26rem]:sr-only">{tm.list.start}</span>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-blue motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <StageNotice Icon={Timer} title={tm.comingSoon.title} body={tm.comingSoon.body} />
          )}
        </ToolStage>
      }
      exits={
        <>
          <TextLink href={href("/tools/mock-tests")}>{tm.common.backToTests}</TextLink>
          {tools.leaderboard && (
            <Link
              href={href("/tools/mock-tests/leaderboard")}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-navy hover:underline"
            >
              <Trophy aria-hidden="true" className="size-4 text-blue" />
              {tm.list.leaderboard}
            </Link>
          )}
        </>
      }
    />
  );

  const askPanel = (
    <ToolPanel
      head={<PanelHead title={t.ask.title} tagline={t.taglines.ask} badge={<SampleTag tone="ai" label={tt.ranchoCaption} />} lead={t.ask.lead} />}
      controls={
        <>
          {/* Opens the floating Rancho chat once hydrated; a plain link to /tools/ask without JS. */}
          <AskRanchoLink href={href("/tools/ask")} detail={{}} variant="primary" mascot={false} className="w-full self-start @min-[22rem]:w-auto">
            <MessageCircle aria-hidden="true" className="size-4" />
            {t.ask.cta}
          </AskRanchoLink>
          <p className={cn("mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted", HI_SMALL)}>
            <Info aria-hidden="true" className="mt-px size-4 shrink-0 text-[#8b5b00]" />
            {ta.answer.disclaimer}
          </p>
        </>
      }
      stage={
        <ToolStage tone="ask">
          <div className="flex items-end gap-3">
            {/* Decorative (no title); the wave and blink play once (WCAG 2.2.2). */}
            <span aria-hidden="true" className={cn("relative aspect-[128/140] w-20 shrink-0 sm:w-24 lg:w-28", RANCHO_MOTION_ONCE)}>
              <span className="absolute inset-x-1 top-1/3 bottom-0 rounded-full bg-gold/35 blur-2xl" />
              <RanchoMascot variant="wave" className="relative max-h-full w-full" />
            </span>
            <p
              id="home-tools-ask-examples"
              className="mb-6 rounded-2xl rounded-bl-md bg-navy px-3.5 py-2.5 text-sm leading-snug font-semibold text-white"
            >
              {t.ask.examplesTitle}
            </p>
          </div>
          {/* Each example opens the chat with it prefilled (a window event); the link itself is plain /tools/ask, so no question text ever goes into a URL. */}
          <ul aria-labelledby="home-tools-ask-examples" className="mt-3 grid gap-2 sm:ml-8">
            {HOME_ASK_EXAMPLES.map((key) => (
              <li key={key} className={key === "physics" ? "max-sm:hidden" : undefined}>
                <AskRanchoLink
                  appearance="plain"
                  mascot={false}
                  href={href("/tools/ask")}
                  detail={askExampleDetail(t.ask.examples[key])}
                  className="flex min-h-11 w-full items-start gap-2.5 rounded-2xl rounded-br-md bg-white px-3.5 py-2.5 text-left text-sm leading-snug text-navy shadow-soft ring-1 ring-[#d3e2f5] hover:ring-blue"
                >
                  <MessageCircleQuestionMark aria-hidden="true" className="mt-px size-4 shrink-0 text-blue" />
                  <span className="min-w-0 flex-1 break-words">{t.ask.examples[key]}</span>
                  <ArrowUpRight aria-hidden="true" className="mt-px size-4 shrink-0 text-blue" />
                </AskRanchoLink>
              </li>
            ))}
          </ul>
        </ToolStage>
      }
      exits={<TextLink href={href("/rancho")}>{t.ask.app}</TextLink>}
    />
  );

  const plannerPanel = (
    <HomeToolsPlanner
      locale={locale}
      head={<PanelHead title={tt.items.planner.title} tagline={t.taglines.planner} lead={t.planner.lead} />}
      exits={
        tools.planner.available ? (
          <>
            <TextLink href={href("/tools/planner")}>{tpl.form.submit}</TextLink>
            {/* The sample content is in the full planner (syllabus, flashcards), not the countdown. */}
            {tools.planner.sample && <SampleTag tone="sample" label={tt.status.sample} />}
          </>
        ) : (
          <>
            <TextLink href={href("/tools/planner")}>
              {tt.open} · {tt.items.planner.title}
            </TextLink>
            <SampleTag tone="neutral" label={tpl.unavailable.title} />
          </>
        )
      }
      extras={
        <div className={STAGE_INFO}>
          <p className={STAGE_INFO_LABEL}>{t.planner.featuresLabel}</p>
          <ul className="mt-2 grid gap-2 text-sm text-ink @min-[22rem]:grid-cols-2">
            {PLANNER_FEATURES.map(({ key, Icon }) => (
              <li key={key} className="flex items-start gap-2">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue" />
                <span className="min-w-0 leading-snug">{t.planner.features[key]}</span>
              </li>
            ))}
          </ul>
        </div>
      }
      messages={{
        exam: tpl.form.exam,
        exams: tpl.exams,
        examDate: tpl.form.examDate,
        prompt: t.planner.prompt,
        daysLeft: t.planner.daysLeft,
        today: t.planner.today,
        tomorrow: tpl.today.countdownTomorrow,
        past: t.planner.past,
        tooFar: tpl.form.errors.examDateFar,
        submit: t.planner.submit,
        pending: tp.form.checking,
        dateMissing: t.planner.dateMissing,
        pressToShow: t.planner.pressToShow,
        ready: t.planner.ready,
        change: t.planner.change,
        askRancho: t.planner.askRancho,
        askRanchoPrompt: t.planner.askRanchoPrompt,
        askRanchoContext: t.planner.askRanchoContext,
      }}
      gateMessages={gateMessages}
    />
  );

  const panels: Record<HomeToolKey, ReactNode> = {
    predictor: predictorPanel,
    mockTests: mockTestsPanel,
    ask: askPanel,
    planner: plannerPanel,
  };
  // Working tools first (the first tile is the initial tab). The countdown works everywhere, so
  // the planner counts as working even where the full planner is unavailable.
  const order = homeToolOrder({ predictor: tools.predictor !== null, mockTests: tools.tests.length > 0, ask: true, planner: true });
  const tabs: HomeToolTab[] = order.map((key) => ({
    key,
    label: t.tabs[key],
    short: t.tabsShort[key],
    tagline: t.taglines[key],
    panel: panels[key],
  }));

  const footerPoints: { text: string; Icon: LucideIcon }[] = [
    { text: t.points.private, Icon: LockKeyhole },
    { text: t.points.languages, Icon: Languages },
  ];

  return (
    <Section tone={tone} aria-labelledby="home-tools-title">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] md:items-end md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-12">
        <div className="min-w-0">
          <p className="text-xs font-extrabold tracking-[0.14em] text-blue uppercase [&:lang(hi)]:text-[13px] [&:lang(hi)]:tracking-normal">
            {t.eyebrow}
          </p>
          <h2
            id="home-tools-title"
            className="mt-2 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] leading-tight font-semibold text-balance text-navy [&:lang(hi)]:leading-snug"
          >
            {t.title}
          </h2>
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-muted sm:text-base">{t.lead}</p>
        </div>
        {/* Plan §11.4: the contact-number disclosure comes before the tools. */}
        <p className={cn("flex items-start gap-2.5 text-[13px] leading-snug text-[#354b66] md:pb-1", HI_SMALL)}>
          <Sparkles aria-hidden="true" className="mt-px size-4 shrink-0 text-blue" />
          {t.points.free}
        </p>
      </div>

      {/* No overflow clipping, so no focus ring is ever cut off. */}
      <div className="mt-6 min-w-0 rounded-card bg-white shadow-panel ring-1 ring-[#d8e2ef] md:mt-8 lg:mt-10">
        <HomeToolsTabs label={tt.meta.title} tabs={tabs} />
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <ul className={cn("flex flex-col gap-x-6 gap-y-1.5 text-[13px] leading-snug text-[#354b66] sm:flex-row sm:flex-wrap", HI_SMALL)}>
            {footerPoints.map(({ text, Icon }) => (
              <li key={text} className="flex items-start gap-2">
                <Icon aria-hidden="true" className="mt-px size-4 shrink-0 text-blue" />
                <span className="min-w-0">{text}</span>
              </li>
            ))}
          </ul>
          <TextLink href={href("/tools")} className="shrink-0 self-start md:self-auto">
            {t.seeAll}
          </TextLink>
        </div>
      </div>
    </Section>
  );
}
