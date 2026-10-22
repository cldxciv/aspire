import { ArrowRight, Award, CalendarRange, Flame, MessageCircleQuestion, PlugZap, Timer, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, ButtonLink, DemoBadge, EmptyState, Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { BadgeId } from "@/lib/mocktest/badges";
import {
  formatCount,
  formatPercent,
  formatPortalDate,
  formatPortalDateKey,
  type ActivityItem,
  type DoubtsView,
  type LearnerTools,
  type MockTestsView,
  type PlannerView,
  type ToolAudience,
} from "./learner-tools-view";

/**
 * Practice-tool panels for the student and parent portals (M6 phase 2). Presentational and
 * synchronous: data arrives already authorised and shaped (learner-tools.ts → learner-tools-view.ts),
 * copy from `portal.tools`. Level 2 panels are page sections (`<h2>`); level 3 are sub-sections
 * inside a learner's panel on the parent pages (`<h3>`), so the heading order never skips.
 */

type PortalMessages = Messages<"portal">;
type Level = 2 | 3;

type BlockProps = {
  id: string;
  level: Level;
  audience: ToolAudience;
  locale: Locale;
  t: PortalMessages;
  /** Overview cards (fewer rows, no breakdowns) vs the progress pages. */
  compact?: boolean;
};

export function ToolSection({
  id,
  level,
  title,
  icon: Icon,
  badge,
  description,
  action,
  className,
  children,
}: {
  id: string;
  level: Level;
  title: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "min-w-0",
        level === 2 ? "rounded-card border border-line bg-white p-5 shadow-soft md:p-6" : "rounded-control border border-line bg-[#fbfdff] p-4",
        className,
      )}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {Icon && (
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-soft text-blue">
                <Icon className="size-4" />
              </span>
            )}
            <Heading id={id} className={cn("break-words font-extrabold text-navy", level === 2 && "text-lg")}>
              {title}
            </Heading>
            {badge}
          </div>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

type Fact = { label: string; value: string; srValue?: string };

/**
 * Small label/value grid, two columns until its own container is wide enough for four (the
 * panels sit side by side on wide screens). A value with `srValue` shows "—" and announces `srValue`.
 */
function FactGrid({ facts, className }: { facts: Fact[]; className?: string }) {
  return (
    <div className={cn("@container", className)}>
      <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {facts.map(({ label, value, srValue }) => (
        <div key={label} className="min-w-0 rounded-md bg-[#f4f8fd] px-3 py-2">
          <dt className="break-words text-xs font-semibold text-muted">{label}</dt>
          <dd className="mt-0.5 break-words text-lg font-extrabold tabular-nums text-navy">
            {srValue ? (
              <>
                <span aria-hidden="true">{value}</span>
                <span className="sr-only">{srValue}</span>
              </>
            ) : (
              value
            )}
          </dd>
        </div>
        ))}
      </dl>
    </div>
  );
}

/** A heading one level below the section's own (`<h3>` in a page panel, `<h4>` in a learner sub-section). */
function SubHeading({ level, id, className, children }: { level: Level; id: string; className?: string; children: ReactNode }) {
  return level === 2 ? (
    <h3 id={id} className={className}>
      {children}
    </h3>
  ) : (
    <h4 id={id} className={className}>
      {children}
    </h4>
  );
}

// ---------------------------------------------------------------------------------------------
// Mock tests

const BADGE_ICON: Record<BadgeId, LucideIcon> = { "first-test": Award, "streak-3": Flame, "top-10": Trophy };

function badgeText(id: BadgeId, t: PortalMessages["tools"]["mock"]["badges"]): [string, string] {
  if (id === "first-test") return [t.firstTest, t.firstTestBody];
  if (id === "streak-3") return [t.streak3, t.streak3Body];
  return [t.top10, t.top10Body];
}

export function MockTestsBlock({ id, level, audience, locale, t, compact = false, view }: BlockProps & { view: MockTestsView }) {
  const m = t.tools.mock;
  const student = audience === "student";
  const hasData = view.status === "ready" && view.totalAttempts > 0;
  return (
    <ToolSection
      id={id}
      level={level}
      icon={Timer}
      title={m.title}
      description={m.description}
      action={
        student && compact && hasData ? (
          <ButtonLink href={localePath("/student/progress", locale)} variant="outline" size="sm">
            {m.seeAll}
            <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        ) : undefined
      }
    >
      {view.status === "comingSoon" ? (
        <EmptyState title={m.comingSoonTitle} description={<p>{m.comingSoonBody}</p>} />
      ) : !hasData ? (
        <EmptyState
          title={m.emptyTitle}
          description={<p>{student ? m.emptyBody : m.emptyBodyParent}</p>}
          action={
            <ButtonLink href={localePath("/tools/mock-tests", locale)} variant={student ? "primary" : "outline"}>
              {student ? m.cta : m.ctaParent}
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-5">
          <div>
            <FactGrid
              facts={[
                { label: m.totals.attempts, value: formatCount(view.totalAttempts, locale) },
                { label: m.totals.tests, value: formatCount(view.testsTaken, locale) },
                view.averageAccuracy === null
                  ? { label: m.totals.accuracy, value: "—", srValue: m.noAnswers }
                  : { label: m.totals.accuracy, value: formatPercent(view.averageAccuracy, locale) },
                { label: m.totals.streak, value: formatCount(view.longestStreakDays, locale) },
              ]}
            />
            <p className="mt-2 text-xs text-muted">{m.accuracyHelp}</p>
          </div>

          {view.anySample && <Notice variant="warning">{t.tools.sampleNote}</Notice>}

          <div>
            <SubHeading level={level} id={`${id}-recent`} className="font-bold text-navy">
              {m.recentTitle}
            </SubHeading>
            <ol aria-labelledby={`${id}-recent`} className="mt-2 grid gap-2">
              {view.recent.slice(0, compact ? 3 : undefined).map((attempt) => {
                const date = formatPortalDate(attempt.submittedAt, locale);
                const context = format(m.links.context, { test: attempt.title, date });
                return (
                  <li key={attempt.id} className="min-w-0 rounded-control border border-line bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
                          <span className="break-words">{attempt.title}</span>
                          {attempt.sample && <DemoBadge label={t.tools.sampleTest} />}
                        </p>
                        <p className="text-xs text-muted">{format(m.finished, { date })}</p>
                      </div>
                      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <div>
                          <dt className="text-xs text-muted">{m.score}</dt>
                          <dd className="font-extrabold tabular-nums text-ink">
                            {format(m.scoreOf, { score: formatCount(attempt.score, locale), max: formatCount(attempt.maxScore, locale) })}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">{m.accuracy}</dt>
                          <dd className="font-extrabold tabular-nums text-ink">
                            {attempt.accuracy === null ? m.noAnswers : formatPercent(attempt.accuracy, locale)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    {!compact && (
                      <p className="mt-1 text-xs text-muted">
                        {format(m.breakdown, {
                          correct: formatCount(attempt.correct, locale),
                          wrong: formatCount(attempt.wrong, locale),
                          skipped: formatCount(attempt.unattempted, locale),
                        })}
                      </p>
                    )}
                    {student && (
                      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {/* Fixed tests: result, certificate, report; exam-pattern papers: their result only. */}
                        {attempt.links.map(({ page, path }) => (
                          <li key={page}>
                            <Link
                              href={localePath(path, locale)}
                              className="inline-flex min-h-9 items-center font-bold text-blue hover:underline"
                            >
                              {m.links[page]}
                              <span className="sr-only">: {context}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {!compact && view.best.length > 0 && (
            <div>
              <SubHeading level={level} id={`${id}-best`} className="font-bold text-navy">
                {m.bestTitle}
              </SubHeading>
              <ul aria-labelledby={`${id}-best`} className="mt-2 grid gap-2 sm:grid-cols-2">
                {view.best.map((entry) => (
                  <li key={entry.testId} className="min-w-0 rounded-control border border-line bg-white p-3">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
                      <span className="break-words">{entry.title}</span>
                      {entry.sample && <DemoBadge label={t.tools.sampleTest} />}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-ink">
                      {format(m.best, {
                        score: format(m.scoreOf, { score: formatCount(entry.bestScore, locale), max: formatCount(entry.maxScore, locale) }),
                      })}
                      <span className="text-muted"> · {format(m.attemptsCount, { n: formatCount(entry.attempts, locale) })}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <SubHeading level={level} id={`${id}-badges`} className="font-bold text-navy">
              {m.badgesTitle}
            </SubHeading>
            {view.badges.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{m.noBadges}</p>
            ) : (
              <ul aria-labelledby={`${id}-badges`} className="mt-2 flex flex-wrap gap-2">
                {view.badges.map((badge) => {
                  const Icon = BADGE_ICON[badge];
                  const [title, body] = badgeText(badge, m.badges);
                  return (
                    <li key={badge} className="flex min-w-0 items-center gap-2 rounded-control border border-[#efd27a] bg-gold-soft px-3 py-2">
                      <Icon aria-hidden="true" className="size-5 shrink-0 text-[#8b5b00]" />
                      <span className="min-w-0">
                        <strong className="block text-sm text-ink">{title}</strong>
                        {!compact && <span className="text-xs text-muted">{body}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </ToolSection>
  );
}

// ---------------------------------------------------------------------------------------------
// Study planner

export function PlannerBlock({ id, level, audience, locale, t, compact = false, view }: BlockProps & { view: PlannerView }) {
  const p = t.tools.planner;
  const student = audience === "student";
  const n = (value: number) => formatCount(value, locale);
  return (
    <ToolSection
      id={id}
      level={level}
      icon={CalendarRange}
      title={p.title}
      description={p.description}
      badge={view.status === "ready" && view.sample ? <DemoBadge label={t.tools.samplePlan} /> : undefined}
    >
      {view.status === "comingSoon" ? (
        <EmptyState title={p.comingSoonTitle} description={<p>{p.comingSoonBody}</p>} />
      ) : view.status === "empty" ? (
        <EmptyState
          title={p.emptyTitle}
          description={<p>{student ? p.emptyBody : p.emptyBodyParent}</p>}
          action={
            <ButtonLink href={localePath("/tools/planner", locale)} variant={student ? "primary" : "outline"}>
              {student ? p.cta : p.ctaParent}
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-4">
          {student && view.exam && (
            <p className="flex flex-wrap gap-x-2 text-sm font-semibold text-navy">
              <span>{format(p.exam, { exam: p.exams[view.exam] })}</span>
              {view.daysToExam !== null && <span className="text-muted">· {format(p.examCountdown, { n: n(view.daysToExam) })}</span>}
            </p>
          )}
          <FactGrid
            facts={[
              { label: p.totals.streak, value: n(view.streak.current) },
              { label: p.totals.best, value: n(view.streak.best) },
              { label: p.totals.activeDays, value: `${n(view.activeDaysLast30)}/30` },
              ...(view.xp ? [{ label: p.totals.xpWeek, value: n(view.xp.thisWeek) }] : []),
              ...(!compact && view.xp ? [{ label: p.totals.xpTotal, value: n(view.xp.total) }] : []),
              ...(!compact
                ? [
                    { label: p.totals.blocks, value: n(view.blocksDoneLast30) },
                    { label: p.totals.reviews, value: n(view.reviewsLast30) },
                  ]
                : []),
            ]}
          />
          <p className="text-sm font-semibold text-ink">{view.streak.todayDone ? p.todayDone : p.todayNotYet}</p>
          <div>
            <SubHeading level={level} id={`${id}-strip`} className="text-sm font-bold text-navy">
              {p.stripTitle}
            </SubHeading>
            <ol aria-labelledby={`${id}-strip`} className="mt-2 grid max-w-md grid-cols-10 gap-1">
              {view.last30Days.map((day) => {
                const label = format(day.active ? p.stripActive : p.stripIdle, { date: formatPortalDateKey(day.date, locale) });
                return (
                  <li key={day.date} title={label}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "block aspect-square rounded-[4px] border",
                        day.active ? "border-[#14845a] bg-success" : "border-line bg-white",
                      )}
                    />
                    <span className="sr-only">{label}</span>
                  </li>
                );
              })}
            </ol>
            {view.lastActiveDate && (
              <p className="mt-2 text-xs text-muted">{format(p.lastActive, { date: formatPortalDateKey(view.lastActiveDate, locale) })}</p>
            )}
          </div>
          <p className="text-xs text-muted">{p.syncNote}</p>
        </div>
      )}
    </ToolSection>
  );
}

// ---------------------------------------------------------------------------------------------
// Ask Aspire doubt topics

export function DoubtsBlock({ id, level, audience, locale, t, compact = false, view }: BlockProps & { view: DoubtsView }) {
  const d = t.tools.doubts;
  const student = audience === "student";
  return (
    <ToolSection
      id={id}
      level={level}
      icon={MessageCircleQuestion}
      title={d.title}
      description={d.description}
      badge={
        view.status === "notConnected" ? (
          <Badge variant="neutral">
            <PlugZap aria-hidden="true" className="size-3" />
            {t.blocks.notConnected}
          </Badge>
        ) : undefined
      }
    >
      {view.status === "notConnected" ? (
        <EmptyState title={d.notConnectedTitle} description={<p>{d.notConnectedBody}</p>} />
      ) : view.topics.length === 0 ? (
        <EmptyState
          title={d.emptyTitle}
          description={<p>{student ? d.emptyBody : d.emptyBodyParent}</p>}
          action={
            <ButtonLink href={localePath("/tools/ask", locale)} variant={student ? "primary" : "outline"}>
              {student ? d.cta : d.ctaParent}
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-4">
          {!compact && (
            <div>
              <SubHeading level={level} id={`${id}-subjects`} className="font-bold text-navy">
                {d.bySubjectTitle}
              </SubHeading>
              <FactGrid
                className="mt-2"
                facts={view.bySubject.map(({ subject, count }) => ({ label: d.subjects[subject], value: formatCount(count, locale) }))}
              />
            </div>
          )}
          <div>
            <SubHeading level={level} id={`${id}-topics`} className="font-bold text-navy">
              {d.topTitle}
            </SubHeading>
            <ol aria-labelledby={`${id}-topics`} className="mt-2 grid gap-2">
              {view.topics.slice(0, compact ? 5 : undefined).map((topic) => (
                <li
                  key={`${topic.subject}:${topic.topic}`}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control border border-line bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="break-words font-bold text-navy" lang="en">
                      {topic.topic}
                    </p>
                    <p className="text-xs text-muted">
                      {d.subjects[topic.subject]}
                      {!compact && Number.isFinite(topic.lastSeen) && (
                        <> · {format(d.lastAsked, { date: formatPortalDate(topic.lastSeen, locale) })}</>
                      )}
                    </p>
                  </div>
                  <Badge variant="info">{format(d.count, { n: formatCount(topic.count, locale) })}</Badge>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-muted">{d.aiNote}</p>
        </div>
      )}
    </ToolSection>
  );
}

// ---------------------------------------------------------------------------------------------
// Parent overview: one-line facts per learner; parent updates: recent activity

function mockFact(view: MockTestsView, t: PortalMessages["tools"], locale: Locale): string {
  if (view.status === "comingSoon") return t.comingSoon;
  if (view.totalAttempts === 0) return t.noneYet;
  const count = formatCount(view.totalAttempts, locale);
  return view.averageAccuracy === null
    ? format(t.facts.mockValueNoAccuracy, { n: count })
    : format(t.facts.mockValue, { n: count, accuracy: formatPercent(view.averageAccuracy, locale) });
}

function plannerFact(view: PlannerView, t: PortalMessages["tools"], locale: Locale): string {
  if (view.status === "comingSoon") return t.comingSoon;
  if (view.status === "empty") return t.noneYet;
  return format(t.facts.plannerValue, { streak: formatCount(view.streak.current, locale), active: formatCount(view.activeDaysLast30, locale) });
}

function NotConnectedBadge({ label }: { label: string }) {
  return (
    <Badge variant="neutral">
      <PlugZap aria-hidden="true" className="size-3" />
      {label}
    </Badge>
  );
}

/** Compact facts for a learner card on the parent dashboard (`<dl>`; the card's `<h3>` names the learner). */
export function LearnerToolFacts({ tools, locale, t }: { tools: LearnerTools; locale: Locale; t: PortalMessages }) {
  const f = t.tools.facts;
  const doubts = tools.doubts;
  const items: { label: string; value: ReactNode }[] = [
    { label: f.mockTests, value: mockFact(tools.mockTests, t.tools, locale) },
    { label: f.planner, value: plannerFact(tools.planner, t.tools, locale) },
    {
      label: f.doubts,
      value:
        doubts.status === "notConnected" ? (
          <NotConnectedBadge label={t.blocks.notConnected} />
        ) : doubts.totalDoubts === 0 ? (
          t.tools.noneYet
        ) : (
          format(f.doubtsValue, { n: formatCount(doubts.totalDoubts, locale), topics: formatCount(doubts.topicCount, locale) })
        ),
    },
    { label: f.attendance, value: <NotConnectedBadge label={t.blocks.notConnected} /> },
  ];
  return (
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0 rounded-md bg-[#f8fbff] px-3 py-2">
          <dt className="text-xs font-semibold text-muted">{label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Newest-first activity list (parent "Updates"). `labelledBy` is the id of the heading that names it. */
export function ActivityList({
  items,
  labelledBy,
  emptyText,
  locale,
  t,
}: {
  items: ActivityItem[];
  labelledBy: string;
  emptyText: string;
  locale: Locale;
  t: PortalMessages;
}) {
  const a = t.tools.activity;
  if (items.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ol aria-labelledby={labelledBy} className="grid gap-2">
      {items.map((item, index) => (
        <li key={`${item.kind}-${index}`} className="flex min-w-0 flex-col gap-0.5 rounded-control border border-line bg-white px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3">
          <time dateTime={new Date(item.at).toISOString()} className="shrink-0 text-xs font-semibold text-muted sm:w-28">
            {formatPortalDate(item.at, locale)}
          </time>
          <p className="min-w-0 break-words text-sm text-ink">
            {item.kind === "mockTest" ? (
              <>
                <strong className="text-navy">{a.mockTest}</strong> · {item.title} ·{" "}
                <span className="tabular-nums">
                  {format(t.tools.mock.scoreOf, { score: formatCount(item.score, locale), max: formatCount(item.maxScore, locale) })}
                </span>
                {item.sample && (
                  <>
                    {" "}
                    <DemoBadge label={t.tools.sampleTest} />
                  </>
                )}
              </>
            ) : item.kind === "planner" ? (
              <strong className="text-navy">{a.planner}</strong>
            ) : (
              <>
                <strong className="text-navy">{a.doubt}</strong> · <span lang="en">{item.topic}</span> · {t.tools.doubts.subjects[item.subject]}
              </>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Data-free stand-in for the tool panels in previews (D-014). */
export function ToolsPreview({ id, t }: { id: string; t: PortalMessages }) {
  return (
    <ToolSection id={id} level={2} title={t.tools.previewTitle}>
      <p className="rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-6 text-center text-sm text-muted">
        {t.tools.previewBody}
      </p>
    </ToolSection>
  );
}
