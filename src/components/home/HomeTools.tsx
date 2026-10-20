import {
  ArrowRight,
  BookOpenCheck,
  CalendarRange,
  Clock,
  Flame,
  Info,
  Languages,
  Layers,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  Sparkles,
  Timer,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { RANCHO_MOTION_ONCE } from "@/components/ask/RanchoMediaPanel";
import { RanchoMascot } from "@/components/rancho/RanchoMascot";
import { Badge, ButtonLink, DemoBadge, Section, type SectionTone } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import type { HomeToolsData } from "./home-tools-data";
import { AskRanchoLink } from "./HomeToolsAskRancho";
import { HomeToolsPlanner } from "./HomeToolsPlanner";
import { HomeToolsPredictor } from "./HomeToolsPredictor";
import { HomeToolsTabs } from "./HomeToolsTabs";

const ASK_EXAMPLES = ["physics", "chemistry", "maths", "biology"] as const;

const PLANNER_FEATURES: { key: "plan" | "revise" | "cards" | "streak"; Icon: LucideIcon }[] = [
  { key: "plan", Icon: CalendarRange },
  { key: "revise", Icon: BookOpenCheck },
  { key: "cards", Icon: Layers },
  { key: "streak", Icon: Flame },
];

/** Panel title row + one-line lead, shared by the four panels. `media`: optional decorative art before the title. */
function PanelHead({ title, badge, lead, media }: { title: string; badge?: ReactNode; lead: ReactNode; media?: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {media}
        <h3 className="font-serif text-[1.35rem] leading-snug font-semibold text-navy sm:text-2xl">{title}</h3>
        {badge}
      </div>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted sm:text-[15px]">{lead}</p>
    </div>
  );
}

function PanelActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">{children}</div>;
}

/**
 * Homepage "Student tools" widget (owner request: the tools as a homepage widget that blends in).
 * Intro column beside a tabbed card from `lg`, stacked below. Each tab lets a visitor try the tool
 * in seconds, then go to the full tool:
 * - Rank predictor: exam + score/percentile → rank band, in the browser, on the score tables the
 *   server allows (sample tables labelled; none in production → description + link). Lead gate
 *   (docs/lead-gate-plan.md §8.2): the band shows after the visitor shares contact details once
 *   per browser (compact form in the result slot; signed-in accounts skip it). The `leadGate`
 *   messages are passed from here, so the section stays static; the gate's state is client-only.
 * - Mock tests: up to three visible tests with a Start link each (weekly / practice and sample
 *   tests labelled).
 * - Ask Rancho (Rancho is Aspire's existing snow leopard mascot, and the AI doubt solver at /tools/ask):
 *   what it does, example doubts (plain text, never put in a URL), the AI caveat. The decorative
 *   head mascot (`RanchoMascot`) marks its tab and sits beside the panel title.
 * - Study planner: exam + date → days left, computed in the browser. Never gated (a public fact,
 *   plan §8.3); only the full planner asks before a first plan.
 * The section is static (no request data): Rancho's "connected?" status and daily allowance are
 * left to /tools/ask. Exact scores and dates typed in the widget never leave the browser. What the
 * predictor tab does send: the gate's status check (GET /api/lead-gate, client-side, once per page
 * view, for the up-front note); the contact form (the visitor's details with the exam and score
 * band); and, for a browser that shared details and whose pass records use, one note per "Predict"
 * that ends in a band (exam, score band and page; never the exact score). The planner countdown
 * sends nothing. No photos (D-030 photo budget); the mascot is illustration, not a photo.
 */
export function HomeTools({ tools, locale, tone = "white" }: { tools: HomeToolsData; locale: Locale; tone?: SectionTone }) {
  const t = messagesFor(locale, "home").tools;
  const tt = messagesFor(locale, "tools");
  const tp = messagesFor(locale, "predictor");
  const tm = messagesFor(locale, "mocktest");
  const ta = messagesFor(locale, "ask");
  const tpl = messagesFor(locale, "planner");
  const sampleBadge = <Badge variant="demo">{tt.status.sample}</Badge>;
  const href = (path: string) => localePath(path, locale);

  const predictorPanel = tools.predictor ? (
    <>
      <PanelHead title={tt.items.predictor.title} badge={tools.predictor.sample ? sampleBadge : undefined} lead={t.predictor.lead} />
      <div className="mt-5">
        <HomeToolsPredictor
          data={tools.predictor.data}
          locale={locale}
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
          gateMessages={messagesFor(locale, "leadGate")}
        />
      </div>
      <PanelActions>
        <ButtonLink href={href("/tools/predictor")}>
          {t.predictor.cta} <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </PanelActions>
    </>
  ) : (
    <>
      <PanelHead
        title={tt.items.predictor.title}
        badge={<Badge variant="neutral">{tp.notices.comingSoonTitle}</Badge>}
        lead={tp.hero.lead}
      />
      <PanelActions>
        <ButtonLink href={href("/tools/predictor")}>
          {tt.open} · {tt.items.predictor.title}
        </ButtonLink>
      </PanelActions>
    </>
  );

  const mockTestsPanel = (
    <>
      <PanelHead title={tt.items.mockTests.title} lead={t.mockTests.lead} />
      {tools.tests.length > 0 ? (
        <ul aria-label={t.mockTests.listLabel} className="mt-5 divide-y divide-line rounded-control border border-line">
          {tools.tests.map((test) => (
            <li key={test.id} className="flex flex-col gap-3 p-4 @md:flex-row @md:items-center @md:justify-between">
              <div className="min-w-0">
                <p className="leading-snug font-bold text-navy">{test.title[locale]}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
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
                  {test.sample && <DemoBadge label={tm.common.sample} />}
                </p>
              </div>
              <ButtonLink href={href(`/tools/mock-tests/${test.id}`)} variant="dark" className="shrink-0 self-start @md:self-center">
                <Timer aria-hidden="true" className="size-4" />
                {tm.list.start}
              </ButtonLink>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-4 text-sm">
          <p className="font-bold text-navy">{tm.comingSoon.title}</p>
          <p className="mt-1 text-muted">{tm.comingSoon.body}</p>
        </div>
      )}
      <PanelActions>
        <ButtonLink href={href("/tools/mock-tests")}>
          {tm.common.backToTests} <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
        {tools.leaderboard && (
          <ButtonLink href={href("/tools/mock-tests/leaderboard")} variant="outline">
            <Trophy aria-hidden="true" className="size-4" />
            {tm.list.leaderboard}
          </ButtonLink>
        )}
      </PanelActions>
    </>
  );

  const askPanel = (
    <>
      <PanelHead
        title={t.ask.title}
        lead={t.ask.lead}
        media={
          // Wrapper: the blink plays once instead of looping (WCAG 2.2.2).
          <span className={`shrink-0 ${RANCHO_MOTION_ONCE}`}>
            <RanchoMascot variant="head" className="size-9 sm:size-10" />
          </span>
        }
      />
      <p className="mt-5 text-[13px] font-bold text-[#354b66]">{t.ask.examplesTitle}</p>
      {/* Plain examples, not links: no question text ever goes into a URL. */}
      <ul className="mt-2 grid gap-2">
        {ASK_EXAMPLES.map((key) => (
          <li key={key} className="flex gap-2.5 rounded-control bg-surface px-3 py-2.5 text-sm leading-snug text-navy">
            <MessageCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue" />
            <span className="min-w-0">{t.ask.examples[key]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Info aria-hidden="true" className="mt-px size-4 shrink-0 text-[#8b5b00]" />
        {ta.answer.disclaimer}
      </p>
      <PanelActions>
        {/* Opens the floating Rancho chat once hydrated; a plain link to /tools/ask without JS. */}
        <AskRanchoLink href={href("/tools/ask")} detail={{}} variant="primary" mascot={false}>
          {ta.form.heading} <ArrowRight aria-hidden="true" className="size-4" />
        </AskRanchoLink>
      </PanelActions>
    </>
  );

  const plannerPanel = (
    <>
      <PanelHead
        title={tt.items.planner.title}
        badge={
          tools.planner.available ? (
            tools.planner.sample ? sampleBadge : undefined
          ) : (
            <Badge variant="neutral">{tpl.unavailable.title}</Badge>
          )
        }
        lead={t.planner.lead}
      />
      <div className="mt-5">
        <HomeToolsPlanner
          locale={locale}
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
            askRancho: t.planner.askRancho,
            askRanchoPrompt: t.planner.askRanchoPrompt,
            askRanchoContext: t.planner.askRanchoContext,
          }}
        />
      </div>
      <p className="mt-5 text-[13px] font-bold text-[#354b66]">{t.planner.featuresLabel}</p>
      <ul className="mt-2 grid gap-x-4 gap-y-2 text-sm text-ink @md:grid-cols-2">
        {PLANNER_FEATURES.map(({ key, Icon }) => (
          <li key={key} className="flex items-start gap-2">
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue" />
            <span className="min-w-0 leading-snug">{t.planner.features[key]}</span>
          </li>
        ))}
      </ul>
      <PanelActions>
        <ButtonLink href={href("/tools/planner")}>
          {tools.planner.available ? tpl.form.submit : `${tt.open} · ${tt.items.planner.title}`}{" "}
          <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </PanelActions>
    </>
  );

  const points: { text: string; Icon: LucideIcon }[] = [
    { text: t.points.free, Icon: Sparkles },
    { text: t.points.private, Icon: LockKeyhole },
    { text: t.points.languages, Icon: Languages },
  ];

  return (
    <Section tone={tone} aria-labelledby="home-tools-title">
      <div className="grid gap-8 md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-12 xl:gap-16">
        <div className="min-w-0 lg:pt-2">
          <p className="text-xs font-extrabold tracking-[0.14em] text-blue uppercase">{t.eyebrow}</p>
          <h2
            id="home-tools-title"
            className="mt-2 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] leading-tight font-semibold text-navy [&:lang(hi)]:leading-snug"
          >
            {t.title}
          </h2>
          <p className="mt-4 max-w-prose leading-relaxed text-muted">{t.lead}</p>
          <ul className="mt-6 grid gap-3 text-sm text-ink sm:grid-cols-3 lg:grid-cols-1">
            {points.map(({ text, Icon }) => (
              <li key={text} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-gold bg-gold-soft text-[#8a6100]"
                >
                  <Icon className="size-4" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 pt-1.5 leading-snug">{text}</span>
              </li>
            ))}
          </ul>
          <ButtonLink href={href("/tools")} variant="dark" className="mt-7">
            {t.seeAll} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </div>

        <HomeToolsTabs
          label={tt.meta.title}
          tabs={[
            { key: "predictor", label: t.tabs.predictor, panel: predictorPanel },
            { key: "mockTests", label: t.tabs.mockTests, panel: mockTestsPanel },
            { key: "ask", label: t.tabs.ask, panel: askPanel },
            { key: "planner", label: t.tabs.planner, panel: plannerPanel },
          ]}
        />
      </div>
    </Section>
  );
}
