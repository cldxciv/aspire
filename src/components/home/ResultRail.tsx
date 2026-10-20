"use client";

import { ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { InitialsAvatar } from "@/components/faculty/InitialsAvatar";
import { DemoBadge } from "@/components/ui";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";

/**
 * Client-safe result card, projected on the server by `toResultCardViews()`
 * (ResultsShowcase.tsx). Only displayed fields: no record id (it embeds the
 * student's name), `sourceRef`, consent status, school or quote. `name` is
 * already null unless canShowStudentName() allowed it, so a withheld name never
 * reaches the browser.
 */
export interface ResultCardView {
  /** Exam as recorded, e.g. "JEE Advanced", "NEET". */
  exam: string;
  /** Rank or outcome exactly as recorded, e.g. "AIR 312", "675 / 720". */
  outcome: string;
  year: number;
  name: string | null;
  destination: string | null;
  /** Placeholder record: render a DEMO badge. */
  placeholder: boolean;
}

/** Localised rail copy (from `home.results` + `common.labels.demo`, picked on the server). */
export type ResultRailMessages = {
  nameWithheld: string;
  yearPrefix: string;
  /** "{current} of {total}" */
  position: string;
  positionPrefix: string;
  previous: string;
  next: string;
  demo: string;
};

const controlClass =
  "grid size-11 place-items-center rounded-full border border-[#b9cbe0] bg-white text-navy shadow-soft transition " +
  "hover:border-blue aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:border-[#b9cbe0]";

function ResultCard({ card, t }: { card: ResultCardView; t: ResultRailMessages }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-white shadow-soft">
      <div data-surface="dark" className="bg-linear-to-br from-navy to-navy-2 p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-extrabold uppercase tracking-wide text-gold">{card.exam}</p>
          {/* Decorative: never a photo beside a name (D-019). */}
          <InitialsAvatar name={card.name} size="sm" />
        </div>
        <h3
          className={cn(
            "mt-2 break-words font-serif font-semibold leading-tight",
            card.outcome.length > 12 ? "text-xl" : "text-[1.75rem]",
          )}
        >
          {card.outcome}
        </h3>
        <p className="mt-1 text-sm text-[#d5e3f4]">
          <span className="sr-only">{t.yearPrefix} </span>
          {card.year}
        </p>
      </div>
      <div className="flex flex-1 items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className={cn("break-words", card.name ? "font-bold text-ink" : "font-semibold text-muted italic")}>
            {card.name ?? t.nameWithheld}
          </p>
          {card.destination && <p className="mt-0.5 break-words text-sm text-muted">{card.destination}</p>}
          {card.placeholder && <DemoBadge label={t.demo} className="mt-2" />}
        </div>
        {/* Generic mark instead of any institution's crest. */}
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-navy"
        >
          <GraduationCap className="size-5" strokeWidth={1.6} />
        </span>
      </div>
    </article>
  );
}

/**
 * Horizontal scroll-snap rail of result cards with 44px previous/next buttons and a
 * polite "n of N" status. No autoplay. The list itself is focusable so keyboard users
 * can scroll it with the arrow keys; the buttons stay focusable at the ends
 * (aria-disabled) so focus is never lost.
 */
export function ResultRail({
  cards,
  label,
  messages: t,
}: {
  cards: ResultCardView[];
  label: string;
  messages: ResultRailMessages;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [index, setIndex] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(cards.length <= 1);

  /** Syncs the "n of N" status and the button states with the scroll position. */
  const update = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.children) as HTMLElement[];
    if (items.length === 0) return;
    const origin = items[0].offsetLeft;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    items.forEach((item, i) => {
      const distance = Math.abs(item.offsetLeft - origin - list.scrollLeft);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    setIndex(nearest);
    setAtStart(list.scrollLeft <= 1);
    setAtEnd(list.scrollLeft + list.clientWidth >= list.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Fires once on observe, then whenever the rail resizes.
    const observer = new ResizeObserver(() => update());
    observer.observe(list);
    return () => observer.disconnect();
  }, [update]);

  function go(direction: -1 | 1) {
    const list = listRef.current;
    if (!list || (direction < 0 ? atStart : atEnd)) return;
    const items = Array.from(list.children) as HTMLElement[];
    const target = items[Math.min(Math.max(index + direction, 0), items.length - 1)];
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left: target.offsetLeft - items[0].offsetLeft, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    // Container queries: the rail sits in half the page width beside a photo on the home page (D-030).
    <div className="@container min-w-0">
      <ul
        ref={listRef}
        id={listId}
        aria-label={label}
        tabIndex={0}
        onScroll={update}
        className="relative -mx-1 flex snap-x snap-mandatory scroll-px-1 gap-4 overflow-x-auto overscroll-x-contain px-1 pt-1 pb-3 [scrollbar-width:thin]"
      >
        {cards.map((card, i) => (
          <li
            // The list is static for the page's lifetime; ids are not sent to the client (they embed names).
            key={i}
            className="w-[78%] shrink-0 snap-start @sm:w-[calc((100%-1rem)/2)] @3xl:w-[calc((100%-2rem)/3)] @5xl:w-[calc((100%-3rem)/4)]"
          >
            <ResultCard card={card} t={t} />
          </li>
        ))}
      </ul>
      {cards.length > 1 && (
        <div className="mt-3 flex items-center justify-end gap-3">
          <p aria-live="polite" className="text-sm font-semibold text-muted">
            <span className="sr-only">{t.positionPrefix} </span>
            {format(t.position, { current: index + 1, total: cards.length })}
          </p>
          <button
            type="button"
            aria-controls={listId}
            aria-disabled={atStart}
            aria-label={t.previous}
            onClick={() => go(-1)}
            className={controlClass}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-controls={listId}
            aria-disabled={atEnd}
            aria-label={t.next}
            onClick={() => go(1)}
            className={controlClass}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
