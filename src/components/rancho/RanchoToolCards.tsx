import { CalendarDays, ChevronRight, ClipboardList, Trophy, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import type { MockTestsCard, PlanCard, RankBandCard, RanchoToolCard } from "@/lib/ask/cards";

export type RanchoCardMessages = Messages<"rancho">["panel"]["cards"];

/**
 * Results from Aspire's own tools inside a Rancho answer (`{ t: "card" }` events from /api/ask,
 * already checked by parseToolCard): a rank band from the predictor, matching mock tests, or a plan
 * outline. The numbers come from the tools, never from the model. Every link is localised with
 * `localePath`; `onNavigate` lets the floating panel close when one is followed. Hook-free.
 */
export function RanchoToolCards({
  cards,
  messages: t,
  locale,
  onNavigate,
}: {
  cards: readonly RanchoToolCard[];
  messages: RanchoCardMessages;
  locale: Locale;
  onNavigate?: () => void;
}) {
  if (cards.length === 0) return null;
  return (
    <ul className="mb-2 grid gap-2" data-rancho-cards="">
      {cards.map((card, index) => {
        const body =
          card.kind === "rank_band" ? (
            <RankBand card={card} t={t} locale={locale} onNavigate={onNavigate} />
          ) : card.kind === "mock_tests" ? (
            <MockTests card={card} t={t} locale={locale} onNavigate={onNavigate} />
          ) : card.kind === "plan" ? (
            <Plan card={card} t={t} locale={locale} onNavigate={onNavigate} />
          ) : null;
        return body ? (
          <li key={index} data-card={card.kind} className="rounded-xl border border-[#cfdcec] bg-[#f5f9ff] p-3">
            {body}
          </li>
        ) : null;
      })}
    </ul>
  );
}

interface CardProps<C> {
  card: C;
  t: RanchoCardMessages;
  locale: Locale;
  onNavigate?: () => void;
}

const numberFormats = new Map<string, Intl.NumberFormat>();

/** Indian digit grouping (1,20,000), like the predictor; Hindi pages keep Latin digits. */
function formatNumber(value: number, locale: Locale, maximumFractionDigits = 0): string {
  const key = `${locale}|${maximumFractionDigits}`;
  let formatter = numberFormats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale === "hi" ? "hi-IN" : "en-IN", { maximumFractionDigits });
    numberFormats.set(key, formatter);
  }
  return formatter.format(value);
}

function examLabel(exam: string, t: RanchoCardMessages): string {
  return Object.hasOwn(t.exams, exam) ? t.exams[exam as keyof RanchoCardMessages["exams"]] : exam;
}

function formatExamDate(isoDate: string, locale: Locale): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function CardHeading({ icon, title, sample, t }: { icon: ReactNode; title: string; sample: boolean; t: RanchoCardMessages }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold uppercase tracking-wide text-[#315475]">
      <span className="inline-flex items-center gap-1.5">
        {icon}
        {title}
      </span>
      {sample && (
        <span className="rounded-md bg-gold-soft px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-[#8b5b00] ring-1 ring-[#f2dfa0]">
          {t.sample}
        </span>
      )}
    </p>
  );
}

const linkClasses =
  "inline-flex min-h-9 items-center gap-1 rounded-control text-sm font-bold text-blue underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue";

function RankBand({ card, t, locale, onNavigate }: CardProps<RankBandCard>) {
  const value = formatNumber(card.input.value, locale, card.input.mode === "percentile" ? 4 : 2);
  const percentile = card.percentile;
  const low = percentile ? formatNumber(Math.floor(percentile.min * 100) / 100, locale, 2) : "";
  const high = percentile ? formatNumber(Math.ceil(percentile.max * 100) / 100, locale, 2) : "";
  return (
    <>
      <CardHeading
        icon={<TrendingUp aria-hidden="true" className="size-3.5" />}
        title={format(t.rankBand.title, { exam: examLabel(card.exam, t) })}
        sample={card.sample}
        t={t}
      />
      <p className="mt-1 text-lg font-extrabold leading-snug text-navy tabular-nums">
        {format(t.rankBand.rank, { min: formatNumber(card.band.min, locale), max: formatNumber(card.band.max, locale) })}
      </p>
      <p className="text-xs leading-5 text-muted tabular-nums">
        {format(card.input.mode === "score" ? t.rankBand.fromScore : t.rankBand.fromPercentile, { value })}
        {percentile && <> · {low === high ? format(t.rankBand.percentileOne, { value: low }) : format(t.rankBand.percentile, { min: low, max: high })}</>}
      </p>
      <Link href={localePath(card.href, locale)} onClick={onNavigate} className={`${linkClasses} mt-1`}>
        {t.rankBand.cta}
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </>
  );
}

function MockTests({ card, t, locale, onNavigate }: CardProps<MockTestsCard>) {
  return (
    <>
      <CardHeading
        icon={<ClipboardList aria-hidden="true" className="size-3.5" />}
        title={t.mockTests.title}
        sample={card.tests.some((test) => test.sample)}
        t={t}
      />
      <ul className="mt-1.5 grid gap-1.5">
        {card.tests.map((test) => (
          <li key={test.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-line">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-5 text-navy">{test.title}</p>
              <p className="text-xs leading-5 text-muted tabular-nums">
                {examLabel(test.exam, t)} · {format(t.mockTests.meta, { questions: test.questions, minutes: test.minutes })}
              </p>
            </div>
            <Link
              href={localePath(test.href, locale)}
              onClick={onNavigate}
              className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-navy px-3 text-xs font-bold text-white transition-colors hover:bg-navy-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue"
            >
              {t.mockTests.start}
              <span className="sr-only">: {test.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={localePath(card.leaderboardHref, locale)} onClick={onNavigate} className={`${linkClasses} mt-1`}>
        <Trophy aria-hidden="true" className="size-4" />
        {t.mockTests.leaderboard}
      </Link>
    </>
  );
}

function Plan({ card, t, locale, onNavigate }: CardProps<PlanCard>) {
  const days =
    card.daysLeft === 0 ? t.plan.today : card.daysLeft === 1 ? t.plan.dayLeft : format(t.plan.daysLeft, { days: formatNumber(card.daysLeft, locale) });
  return (
    <>
      <CardHeading
        icon={<CalendarDays aria-hidden="true" className="size-3.5" />}
        title={format(t.plan.title, { exam: examLabel(card.exam, t) })}
        sample={false}
        t={t}
      />
      <p className="mt-1 text-lg font-extrabold leading-snug text-navy tabular-nums">{days}</p>
      <p className="text-xs leading-5 text-muted">{format(t.plan.examOn, { date: formatExamDate(card.examDate, locale) })}</p>
      {card.outline.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm leading-5 text-ink marker:text-blue">
          {card.outline.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      <Link href={localePath(card.href, locale)} onClick={onNavigate} className={`${linkClasses} mt-1`}>
        {t.plan.cta}
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </>
  );
}
