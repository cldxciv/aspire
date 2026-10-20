"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { DueItems, ReviewKind } from "@/lib/planner/actions";
import { diffDays, type DateKey } from "@/lib/planner/dates";
import { GRADES, previewIntervals, type Grade } from "@/lib/planner/srs";
import { toReviewState, type PlannerState } from "@/lib/planner/state";
import type { ClientTopic, SubjectId } from "@/lib/planner/types";
import { formatDate, formatNumber, SHORT_DATE, type ClientCard, type PlannerData, type PlannerMessages } from "./model";

export type SessionMode = "due" | "new" | "practice";
const NEW_PER_SESSION = 10;

interface Item {
  kind: ReviewKind;
  id: string;
  isNew: boolean;
}

interface Session {
  mode: SessionMode;
  queue: Item[];
  index: number;
  flipped: boolean;
  reviewed: number;
  xpStart: number;
  requeued: string[];
}

const GRADE_STYLE: Record<Grade, string> = {
  again: "border-[#f5c2bd] bg-danger-soft text-danger hover:border-danger",
  hard: "border-[#f2dfa0] bg-gold-soft text-[#6b4d00] hover:border-[#d9b64a]",
  good: "border-[#bfe5cf] bg-success-soft text-[#0f5a3c] hover:border-success",
  easy: "border-[#cfe0fb] bg-blue-soft text-navy hover:border-blue",
};

export function ReviewView({
  t,
  locale,
  data,
  today,
  state,
  cards,
  topics,
  due,
  initialMode,
  sample,
  onReview,
}: {
  t: PlannerMessages;
  locale: Locale;
  data: PlannerData;
  today: DateKey;
  state: PlannerState;
  cards: ClientCard[];
  topics: ClientTopic[];
  due: DueItems;
  initialMode: SessionMode | null;
  sample: boolean;
  onReview: (kind: ReviewKind, id: string, grade: Grade) => void;
}) {
  const [subject, setSubject] = useState<SubjectId | "all">("all");
  const subjects = [...new Set(topics.map((topic) => topic.subject))];
  const inSubject = (s: SubjectId | undefined) => subject === "all" || s === subject;
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const dueCards = due.cards.filter((cardId) => inSubject(cardById.get(cardId)?.subject));
  const dueTopics = due.topics.filter((topicId) => inSubject(data.topics[topicId]?.subject));
  const newCards = cards.filter((card) => !state.cards[card.id] && inSubject(card.subject));
  const practiceCards = cards.filter((card) => inSubject(card.subject));

  function build(mode: SessionMode): Session {
    let queue: Item[];
    if (mode === "due") {
      queue = [
        ...dueTopics.map((id) => ({ kind: "topic" as const, id, isNew: false })),
        ...dueCards.map((id) => ({ kind: "card" as const, id, isNew: false })),
      ];
    } else if (mode === "new") {
      queue = newCards.slice(0, NEW_PER_SESSION).map((card) => ({ kind: "card" as const, id: card.id, isNew: true }));
    } else {
      queue = practiceCards.map((card) => ({ kind: "card" as const, id: card.id, isNew: !state.cards[card.id] }));
    }
    return { mode, queue, index: 0, flipped: false, reviewed: 0, xpStart: state.activity[today]?.[0] ?? 0, requeued: [] };
  }

  const [session, setSession] = useState<Session | null>(() => (initialMode ? build(initialMode) : null));
  const sessionRef = useRef<HTMLDivElement>(null);
  const current = session && session.index < session.queue.length ? session.queue[session.index] : null;

  useEffect(() => {
    if (session && session.index === 0 && !session.flipped) sessionRef.current?.focus();
  }, [session]);

  function flip() {
    setSession((s) => (s ? { ...s, flipped: true } : s));
  }

  function advance(grade: Grade | null) {
    if (!session || !current) return;
    if (grade && session.mode !== "practice") onReview(current.kind, current.id, grade);
    setSession((s) => {
      if (!s) return s;
      const requeue = grade === "again" && s.mode !== "practice" && !s.requeued.includes(current.id);
      return {
        ...s,
        queue: requeue ? [...s.queue, { ...current, isNew: false }] : s.queue,
        requeued: requeue ? [...s.requeued, current.id] : s.requeued,
        index: s.index + 1,
        flipped: false,
        reviewed: s.reviewed + (grade && s.mode !== "practice" ? 1 : 0),
      };
    });
    sessionRef.current?.focus();
  }

  // Keyboard: Space / Enter flips, 1–4 grade (practice: Space / Enter for the next card).
  const live = useRef({ session, current, advance, flip });
  useEffect(() => {
    live.current = { session, current, advance, flip };
  });
  const active = current !== null;
  useEffect(() => {
    if (!active) return;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const { session: s, current: item, advance: next, flip: turn } = live.current;
      if (!s || !item) return;
      const target = event.target as HTMLElement | null;
      const inside = !target || target === document.body || !!sessionRef.current?.contains(target);
      if (!inside || target?.closest("input, select, textarea, [contenteditable='true']")) return;
      const onButton = !!target?.closest("button");
      if ((event.key === " " || event.key === "Enter") && !onButton) {
        event.preventDefault();
        if (!s.flipped) turn();
        else if (s.mode === "practice") next(null);
        return;
      }
      const index = ["1", "2", "3", "4"].indexOf(event.key);
      if (index >= 0 && s.flipped && s.mode !== "practice") {
        event.preventDefault();
        next(GRADES[index]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const n = (value: number) => formatNumber(value, locale);

  if (session) {
    if (!current) {
      const xp = Math.max(0, (state.activity[today]?.[0] ?? 0) - session.xpStart);
      return (
        <div className="grid gap-4 rounded-card border border-line bg-white p-6 text-center shadow-soft" role="status">
          <h2 className="font-serif text-2xl font-bold text-navy">{t.review.doneTitle}</h2>
          <p className="text-muted">{format(t.review.doneBody, { count: n(session.reviewed), xp: n(xp) })}</p>
          <div>
            <Button variant="dark" onClick={() => setSession(null)}>
              {t.review.end}
            </Button>
          </div>
        </div>
      );
    }

    const card = current.kind === "card" ? cardById.get(current.id) : undefined;
    const topic = current.kind === "topic" ? data.topics[current.id] : undefined;
    const stored = current.kind === "card" ? state.cards[current.id] : state.topics[current.id];
    const preview = previewIntervals(stored ? toReviewState(stored) : undefined, today);
    const subjectId = card?.subject ?? topic?.subject;

    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-muted" aria-live="polite">
            {format(t.review.progress, { current: n(session.index + 1), total: n(session.queue.length) })}
          </p>
          <Button size="sm" variant="outline" onClick={() => setSession(null)}>
            {t.review.end}
          </Button>
        </div>
        {session.mode === "practice" && (
          <Notice variant="info" role="note">
            {t.review.practiceNote}
          </Notice>
        )}

        <div
          ref={sessionRef}
          tabIndex={-1}
          className="grid gap-4 rounded-card border border-line bg-white p-5 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-blue sm:p-7"
        >
          <div className="flex flex-wrap gap-2">
            {subjectId && <Badge variant="neutral">{t.subjects[subjectId]}</Badge>}
            {topic && <Badge variant="info">{t.review.topicBadge}</Badge>}
            {current.isNew && <Badge variant="success">{t.review.newBadge}</Badge>}
            {card && sample && <Badge variant="demo">{t.sample.cardsBadge}</Badge>}
          </div>

          <div aria-live="polite" className="min-h-28">
            <p className="text-xs font-bold uppercase text-muted">{card ? t.review.question : t.review.topicPrompt}</p>
            <p className="mt-1 text-xl font-bold text-navy sm:text-2xl">{card ? card.front : topic?.name}</p>
            {session.flipped && (
              <div className="mt-4 border-t border-line pt-4">
                {card ? (
                  <>
                    <p className="text-xs font-bold uppercase text-muted">{t.review.answer}</p>
                    <p className="mt-1 whitespace-pre-line text-lg text-ink">{card.back}</p>
                  </>
                ) : (
                  <p className="text-sm text-ink">{t.review.topicChecklist}</p>
                )}
              </div>
            )}
          </div>

          {!session.flipped ? (
            <div>
              <Button variant="dark" onClick={flip}>
                <RotateCcw aria-hidden="true" className="size-4" />
                {t.review.showAnswer}
              </Button>
              <p className="mt-2 text-xs text-muted">{t.review.flipHint}</p>
            </div>
          ) : session.mode === "practice" ? (
            <div>
              <Button variant="dark" onClick={() => advance(null)}>
                {t.review.next}
              </Button>
            </div>
          ) : (
            <div role="group" aria-label={t.review.gradesLabel}>
              <p className="mb-2 text-sm font-semibold text-navy">{t.review.gradesLabel}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADES.map((grade, index) => {
                  const days = preview[grade];
                  const when = days === 0 ? t.review.againToday : format(t.review.inDays, { days: n(days) });
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => advance(grade)}
                      className={`flex min-h-14 flex-col items-center justify-center rounded-control border px-2 py-2 text-sm font-bold ${GRADE_STYLE[grade]}`}
                    >
                      <span>
                        <span aria-hidden="true" className="mr-1 text-xs opacity-70">
                          {index + 1}
                        </span>
                        {t.grades[grade]}
                      </span>
                      <span className="text-xs font-medium opacity-80">{format(t.review.nextIn, { when })}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const studied = topics
    .filter((topic) => state.topics[topic.id] && inSubject(topic.subject))
    .map((topic) => ({ topic, due: state.topics[topic.id][4] }))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const dueTotal = dueCards.length + dueTopics.length;

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-serif text-2xl font-bold text-navy">{t.review.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t.review.intro}</p>
      </div>

      <label className="block max-w-xs text-sm font-semibold text-navy">
        {t.review.subject}
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value as SubjectId | "all")}
          className="mt-1 block min-h-11 w-full rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-sm text-ink"
        >
          <option value="all">{t.review.allSubjects}</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {t.subjects[s]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={dueTotal === 0} onClick={() => setSession(build("due"))}>
          {format(t.review.startDue, { count: n(dueTotal) })}
        </Button>
        <Button variant="dark" disabled={newCards.length === 0} onClick={() => setSession(build("new"))}>
          {format(t.review.startNew, { count: n(Math.min(NEW_PER_SESSION, newCards.length)) })}
        </Button>
        <Button variant="outline" disabled={practiceCards.length === 0} onClick={() => setSession(build("practice"))}>
          {t.review.practiceAll}
        </Button>
      </div>
      {dueTotal === 0 && <p className="text-sm text-muted">{t.review.nothingDue}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="planner-cards" className="rounded-card border border-line bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="planner-cards" className="font-extrabold text-navy">
              {t.review.cardsHeading}
            </h3>
            {sample && <Badge variant="demo">{t.sample.cardsBadge}</Badge>}
          </div>
          {cards.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t.review.noCards}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              <li>
                <Badge variant="warning">{format(t.review.due, { count: n(dueCards.length) })}</Badge>
              </li>
              <li>
                <Badge variant="info">{format(t.review.newCards, { count: n(newCards.length) })}</Badge>
              </li>
            </ul>
          )}
        </section>

        <section aria-labelledby="planner-topics" className="rounded-card border border-line bg-white p-4 shadow-soft">
          <h3 id="planner-topics" className="font-extrabold text-navy">
            {t.review.topicsHeading}
          </h3>
          {studied.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t.review.noTopics}</p>
          ) : (
            <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto text-sm">
              {studied.map(({ topic, due: dueDate }) => {
                const isDue = diffDays(dueDate, today) >= 0;
                return (
                  <li key={topic.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                    <span className="min-w-0 text-ink">{topic.name}</span>
                    <span className={`text-xs ${isDue ? "font-bold text-[#8b5b00]" : "text-muted"}`}>
                      {format(t.review.nextIn, { when: isDue ? t.review.againToday : formatDate(dueDate, locale, SHORT_DATE) })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
