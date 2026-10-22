"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { HeroProgramCard } from "./HeroProgramCard";
import { HeroFactsStrip } from "./HeroStats";
import type { HeroLink } from "./NextBatchCard";
import { HERO_CHIP, HERO_GRID } from "./hero-styles";
import type { PickerProgram } from "./program-picker-data";

/** Strings from the Programs page messages (and `common`), in the page locale. */
export type PickerLabels = {
  /** Accessible name of the chips (and of the no-JS link list), e.g. "Choose a program". */
  group: string;
  /** The card's main link, e.g. "See the full program". */
  seeProgram: string;
  /** Announced after a change, "{title}" filled in, e.g. "Showing {title}". */
  selected: string;
  /** `common.labels.demo`. */
  demo: string;
};

/**
 * D · program picker (client island) for the Programs hero, inside `HeroPanel art="ridges"`: the
 * page's `HeroCopy`, then one chip per program (`aria-pressed`) that switches a facts strip under
 * the chips and the white program card beside them (`HeroProgramCard`).
 *
 * - Server render: `defaultSlug` (else the first program) is selected, so the facts and the card
 *   are in the HTML before any JavaScript (Cache Components: the shell stays static).
 * - Without JavaScript the chips are hidden and a plain list of program links shows instead.
 * - A change is announced politely ("Showing …"); focus stays on the chip.
 * - Only data from `pickerProgram()`: missing facts disappear, nothing is estimated.
 * - No programs: the copy alone (with `fallback` beside it when given).
 */
export function ProgramPicker({
  copy,
  programs,
  defaultSlug,
  labels: t,
  secondary,
  fallback,
  className,
}: {
  /** The page's `HeroCopy` (server-rendered). */
  copy: ReactNode;
  programs: readonly PickerProgram[];
  defaultSlug?: string;
  labels: PickerLabels;
  /** Second call to action on the card, e.g. { label: "Book counselling", href: "/admissions#enquiry" }. */
  secondary?: HeroLink;
  /** Beside the copy when there are no programs (production while the records are placeholders). */
  fallback?: ReactNode;
  className?: string;
}) {
  const baseId = useId();
  const cardId = `${baseId}-card`;
  const [slug, setSlug] = useState(() => programs.find((p) => p.slug === defaultSlug)?.slug ?? programs[0]?.slug);
  const [changed, setChanged] = useState(false);
  const current = programs.find((p) => p.slug === slug) ?? programs[0];

  if (!current) {
    return (
      <div className={cn(fallback ? HERO_GRID.editorial : "max-w-3xl", className)}>
        {copy}
        {fallback && <div className="min-w-0">{fallback}</div>}
      </div>
    );
  }

  const pick = (next: string) => {
    if (next === current.slug) return;
    setSlug(next);
    setChanged(true);
  };

  return (
    <div className={cn(HERO_GRID.editorial, className)}>
      <div className="flex min-w-0 flex-col gap-5">
        {copy}
        {programs.length > 1 && (
          <>
            <div role="group" aria-label={t.group} className="flex flex-wrap gap-2.5 noscript:hidden">
              {programs.map((program) => (
                <button
                  key={program.slug}
                  type="button"
                  aria-pressed={program.slug === current.slug}
                  aria-controls={cardId}
                  onClick={() => pick(program.slug)}
                  className={cn(HERO_CHIP, "max-w-full text-left")}
                >
                  <span className="truncate">{program.chip}</span>
                </button>
              ))}
            </div>
            <ul aria-label={t.group} className="m-0 hidden list-none flex-wrap gap-2.5 p-0 noscript:flex">
              {programs.map((program) => (
                <li key={program.slug}>
                  <Link href={program.href} className={cn(HERO_CHIP, "border-white/35 font-semibold text-white")}>
                    {program.chip}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <HeroFactsStrip facts={current.facts} label={current.title} />
        <p aria-live="polite" className="sr-only">
          {changed ? format(t.selected, { title: current.title }) : ""}
        </p>
      </div>
      <div className="min-w-0">
        <HeroProgramCard
          id={cardId}
          program={current}
          action={{ label: t.seeProgram, href: current.href }}
          secondary={secondary}
          demoLabel={t.demo}
        />
      </div>
    </div>
  );
}
