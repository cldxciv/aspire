"use client";

import { CheckCircle2, CircleDashed, MinusCircle, XCircle } from "lucide-react";
import { useId, useState } from "react";
import { Badge, ButtonLink } from "@/components/ui";
import { MOCK_TOPICS, SUBJECT_LABELS, topicLabel } from "@/content/mocktest/topics";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { Outcome, ScoreResult, StrengthLevel } from "@/lib/mocktest/scoring";
import { dayMinutes, type StudyDay } from "@/lib/mocktest/study-plan";
import type { MockProjection, ReviewItem, RunnerTest } from "@/lib/mocktest/types";
import { answerText, formatDuration, formatNumber, OPTION_LETTERS, percent, signed, type MocktestMessages } from "./format";

/** Presentational parts of the result view: heatmap, time chart, projection, plan and solutions. */

const LEVEL_STYLE: Record<StrengthLevel, { tile: string; Icon: typeof CheckCircle2; icon: string }> = {
  strong: { tile: "border-[#9fd8bb] bg-success-soft", Icon: CheckCircle2, icon: "text-success" },
  developing: { tile: "border-[#efd27a] bg-gold-soft", Icon: MinusCircle, icon: "text-[#8b5b00]" },
  weak: { tile: "border-[#f2b8b2] bg-danger-soft", Icon: XCircle, icon: "text-danger" },
  skipped: { tile: "border-dashed border-[#b9c6d6] bg-white", Icon: CircleDashed, icon: "text-muted" },
};
const LEVELS: StrengthLevel[] = ["strong", "developing", "weak", "skipped"];

/** Topic-wise strength heatmap: one tile per topic, grouped by subject; level in text + icon + colour. */
export function TopicHeatmap({ result, test, t, lang }: { result: ScoreResult; test: RunnerTest; t: MocktestMessages["result"]; lang: Locale }) {
  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label={t.heatmapCaption}>
        {LEVELS.map((level) => {
          const { Icon, icon, tile } = LEVEL_STYLE[level];
          return (
            <li key={level} className="flex items-center gap-1.5">
              <span className={cn("inline-flex size-5 items-center justify-center rounded border", tile)}>
                <Icon aria-hidden="true" className={cn("size-3.5", icon)} />
              </span>
              <span>
                <strong>{t.level[level]}</strong> · {t.levelHint[level]}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="space-y-4">
        {test.sections.map((section) => {
          const topics = result.topics.filter((topic) => topic.subject === section.subject);
          if (topics.length === 0) return null;
          return (
            <div key={section.subject}>
              <h4 className="mb-2 text-sm font-bold text-navy">{section.label[lang]}</h4>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {topics.map((topic) => {
                  const { tile, Icon, icon } = LEVEL_STYLE[topic.level];
                  return (
                    <li key={topic.topic} className={cn("rounded-control border p-2.5", tile)}>
                      <p className="text-sm font-semibold leading-snug text-ink">{topicLabel(topic.topic, lang)}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs font-bold">
                        <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", icon)} />
                        {t.level[topic.level]}
                      </p>
                      <p className="text-xs text-muted">{format(t.topicCorrect, { correct: topic.correct, total: topic.total })}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const OUTCOME_BAR: Record<Outcome, string> = {
  correct: "bg-success",
  wrong: "bg-danger",
  unattempted: "bg-[#b9c6d6]",
};

/** Time per question: a hand-rolled bar chart (native tooltips) plus a table view. */
export function TimeChart({
  result,
  test,
  t,
  common,
  lang,
}: {
  result: ScoreResult;
  test: RunnerTest;
  t: MocktestMessages["result"];
  common: MocktestMessages["common"];
  lang: Locale;
}) {
  const max = Math.max(1, ...result.questions.map((q) => q.timeSec));
  const seen = result.questions.filter((q) => q.timeSec > 0);
  const average = seen.length > 0 ? seen.reduce((s, q) => s + q.timeSec, 0) / seen.length : 0;
  const longest = result.questions.reduce((best, q) => (q.timeSec > best.timeSec ? q : best), result.questions[0]);
  const summary = [
    format(t.timeAverage, { time: formatDuration(average, common) }),
    longest && longest.timeSec > 0 ? format(t.timeLongest, { n: longest.index + 1, time: formatDuration(longest.timeSec, common) }) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <p className="text-sm font-semibold text-ink">{summary}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {(["correct", "wrong", "unattempted"] as Outcome[]).map((outcome) => (
          <li key={outcome} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("inline-block size-3 rounded-sm", OUTCOME_BAR[outcome])} />
            {t.outcome[outcome]}
          </li>
        ))}
      </ul>
      <div className="mt-3 overflow-x-auto" role="img" aria-label={`${t.timeTitle}. ${summary}`}>
        <div className="flex min-w-max gap-3">
          {test.sections.map((section) => (
            <div key={section.subject} className="flex flex-col">
              <div className="flex h-40 items-end gap-0.5 border-b border-[#b9c6d6]">
                {result.questions.slice(section.start, section.start + section.count).map((q) => (
                  <span
                    key={q.id}
                    title={`${format(t.questionShort, { n: q.index + 1 })} · ${t.outcome[q.outcome]} · ${formatDuration(q.timeSec, common)}`}
                    className={cn("block w-2.5 rounded-t-[3px] sm:w-3", OUTCOME_BAR[q.outcome])}
                    style={{ height: `${Math.max(2, (q.timeSec / max) * 100)}%` }}
                  />
                ))}
              </div>
              <span className="mt-1 text-[11px] font-semibold text-muted">{section.label[lang]}</span>
            </div>
          ))}
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-blue">{t.timeTable}</summary>
        <div className="mt-2 max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t.timeTitle}</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-1.5 pr-3">{t.question}</th>
                <th scope="col" className="py-1.5 pr-3">{t.subject}</th>
                <th scope="col" className="py-1.5 pr-3">{t.time}</th>
                <th scope="col" className="py-1.5">{t.outcome.correct} / {t.outcome.wrong}</th>
              </tr>
            </thead>
            <tbody>
              {result.questions.map((q) => (
                <tr key={q.id} className="border-b border-line/60">
                  <th scope="row" className="py-1 pr-3 font-semibold">{q.index + 1}</th>
                  <td className="py-1 pr-3">{test.sections.find((s) => s.subject === q.subject)?.label[lang]}</td>
                  <td className="py-1 pr-3 tabular-nums">{formatDuration(q.timeSec, common)}</td>
                  <td className="py-1">{t.outcome[q.outcome]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Two decimals, rounded DOWN so 99.996 never reads as 100. */
function percentileText(value: number): string {
  return (Math.floor(value * 100) / 100).toFixed(2);
}

/** Projected rank band from the predictor; renders nothing without a projection. */
export function ProjectionPanel({
  projection,
  score,
  maxScore,
  t,
  exams,
  locale,
}: {
  projection: MockProjection | null;
  score: number;
  maxScore: number;
  t: MocktestMessages["result"];
  exams: MocktestMessages["common"]["exams"];
  locale: Locale;
}) {
  if (!projection) return null;
  const n = (value: number) => formatNumber(value, locale);
  return (
    <section aria-labelledby="mt-projection" className="rounded-card border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="mt-projection" className="text-lg font-extrabold text-navy">
          {t.projectionTitle}
        </h3>
        {projection.sample && <Badge variant="demo">{t.projectionSample}</Badge>}
      </div>
      <p className="mt-3 text-2xl font-extrabold text-navy tabular-nums">
        {format(t.projectionRank, { low: n(projection.rank.low), high: n(projection.rank.high) })}
      </p>
      <p className="mt-1 text-sm text-muted">
        {format(t.projectionPercentile, { low: percentileText(projection.percentile.low), high: percentileText(projection.percentile.high) })}
      </p>
      <p className="mt-3 text-sm">
        {format(t.projectionBody, {
          percent: percent(maxScore > 0 ? Math.max(0, score) / maxScore : 0),
          exam: exams[projection.exam],
          score: n(projection.scaledScore),
          max: n(projection.fullMaxScore),
        })}
      </p>
      <p className="mt-2 text-xs text-muted">{t.projectionCaveat}</p>
      <ButtonLink href={localePath("/tools/predictor", locale)} variant="link" className="mt-2">
        {t.projectionLink}
      </ButtonLink>
    </section>
  );
}

/** The 30-day plan: first week by default, all days on request. */
export function StudyPlanView({ plan, t, lang }: { plan: StudyDay[]; t: MocktestMessages["result"]; lang: Locale }) {
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  if (plan.length === 0) return <p className="text-sm text-muted">{t.planEmpty}</p>;
  const days = showAll ? plan : plan.slice(0, 7);
  return (
    <div>
      <ol id={listId} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {days.map((day) => (
          <li
            key={day.day}
            className={cn(
              "rounded-control border p-3",
              day.type === "study" && "border-line bg-white",
              day.type === "revision" && "border-[#d7e7fb] bg-[#eef5ff]",
              day.type === "mock" && "border-[#efd27a] bg-gold-soft",
            )}
          >
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-extrabold text-navy">{format(t.planDay, { n: day.day })}</span>
              <span className="text-xs font-bold uppercase text-muted">
                {t.planType[day.type]} · {format(t.planMinutes, { n: dayMinutes(day) })}
              </span>
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {day.blocks.map((block, i) => (
                <li key={i} className="leading-snug">
                  <strong>{t.planKind[block.kind]}</strong>
                  {block.topic && (
                    <>
                      {" · "}
                      {topicLabel(block.topic, lang)}
                      <span className="text-muted"> ({subjectOf(block.topic, lang)})</span>
                    </>
                  )}
                  <span className="text-muted"> · {format(t.planMinutes, { n: block.minutes })}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {plan.length > 7 && (
        <button
          type="button"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-sm font-bold text-blue hover:underline"
        >
          {showAll ? t.planShowLess : t.planShowAll}
        </button>
      )}
    </div>
  );
}

function subjectOf(topic: string, lang: Locale): string {
  const subject = MOCK_TOPICS[topic]?.subject;
  return subject ? SUBJECT_LABELS[subject][lang] : "";
}

type ReviewFilter = "all" | "wrong" | "unattempted";

/** Question-by-question review with the answer key and worked solutions. */
export function SolutionReview({
  result,
  review,
  test,
  t,
  common,
  locale,
}: {
  result: ScoreResult;
  review: ReviewItem[];
  test: RunnerTest;
  t: MocktestMessages["result"];
  common: MocktestMessages["common"];
  locale: Locale;
}) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [lang, setLang] = useState<Locale>(locale);
  const shown = result.questions.filter((q) => filter === "all" || q.outcome === filter);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 font-semibold">
          {t.reviewFilter}
          <select value={filter} onChange={(e) => setFilter(e.target.value as ReviewFilter)} className="min-h-10 rounded-md border border-line bg-white px-2">
            <option value="all">{t.reviewAll}</option>
            <option value="wrong">{t.reviewWrong}</option>
            <option value="unattempted">{t.reviewUnattempted}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <span className="sr-only">Language / भाषा</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as Locale)} className="min-h-10 rounded-md border border-line bg-white px-2">
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
        </label>
      </div>
      <ol className="mt-4 space-y-4">
        {shown.map((q) => {
          const question = test.questions[q.index];
          const key = review[q.index];
          const OutcomeIcon = q.outcome === "correct" ? CheckCircle2 : q.outcome === "wrong" ? XCircle : CircleDashed;
          return (
            <li key={q.id} className="rounded-card border border-line bg-white p-4" lang={lang === "hi" ? "hi" : "en"}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-navy">{format(t.questionShort, { n: q.index + 1 })}</span>
                <Badge variant={q.outcome === "correct" ? "success" : q.outcome === "wrong" ? "warning" : "neutral"}>
                  <OutcomeIcon aria-hidden="true" className="size-3.5" />
                  {t.outcome[q.outcome]}
                </Badge>
                <span className="text-xs text-muted">
                  {format(t.marksAwarded, { marks: signed(q.marks) })} · {format(t.timeOnQuestion, { time: formatDuration(q.timeSec, common) })}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line">{question.stem[lang]}</p>
              {question.type === "mcq" && question.options && (
                <ul className="mt-2 space-y-1 text-sm">
                  {question.options.map((option, i) => (
                    <li
                      key={i}
                      className={cn(
                        "rounded-md px-2 py-1",
                        key && key.correct === i && "bg-success-soft font-semibold",
                        q.answer === i && key && key.correct !== i && "bg-danger-soft",
                      )}
                    >
                      <span lang="en">({OPTION_LETTERS[i]})</span> {option[lang]}
                    </li>
                  ))}
                </ul>
              )}
              <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="inline font-semibold">{t.yourAnswer}: </dt>
                  <dd className="inline">{q.answer === null ? t.notAnswered : answerText(question, q.answer, lang)}</dd>
                </div>
                {key && (
                  <div>
                    <dt className="inline font-semibold">{t.correctAnswer}: </dt>
                    <dd className="inline">{answerText(question, question.type === "mcq" ? key.correct : String(key.correct), lang)}</dd>
                  </div>
                )}
              </dl>
              {key && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-bold text-blue">{t.solution}</summary>
                  <p className="mt-2 whitespace-pre-line rounded-control bg-surface p-3 text-sm leading-relaxed">{key.solution[lang]}</p>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
