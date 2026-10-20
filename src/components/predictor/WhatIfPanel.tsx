"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import {
  OPTION_TAGS,
  matchColleges,
  withExtraMarks,
  type CollegeMatchPrediction,
  type CollegeOption,
  type ExamScoreTable,
  type PredictorData,
} from "@/lib/predictor/engine";
import { formatNumber, formatRankRange } from "./format";
import { OptionList } from "./OptionList";

const optionKey = (option: CollegeOption) => `${option.institute.id}|${option.program}`;

/** Options that are new or carry a better tag than in `before`. */
export function improvedOptions(before: CollegeOption[], after: CollegeOption[]): CollegeOption[] {
  const previous = new Map(before.map((option) => [optionKey(option), OPTION_TAGS.indexOf(option.tag)]));
  return after.filter((option) => {
    const was = previous.get(optionKey(option));
    return was === undefined || OPTION_TAGS.indexOf(option.tag) < was;
  });
}

/** Slider step and maximum for an exam: 5-mark steps up to ~20 % of the paper (1-mark steps on short papers). */
export function whatIfScale(table: ExamScoreTable): { step: number; max: number; initial: number } {
  const step = table.maxScore >= 300 ? 5 : 1;
  const max = Math.max(step, Math.round((table.maxScore * 0.2) / step) * step);
  return { step, max, initial: Math.min(20, max) };
}

/** "What if I add 20 marks": re-runs the engine in the browser for the score plus extra marks. */
export function WhatIfPanel({
  result,
  data,
  table,
  messages,
  sample,
}: {
  result: CollegeMatchPrediction;
  data: PredictorData | null;
  table: ExamScoreTable;
  messages: Pick<Messages<"predictor">, "whatIf" | "result">;
  sample: boolean;
}) {
  const locale = useLocale();
  const ids = useId();
  const t = messages.whatIf;
  const scale = whatIfScale(table);
  const [extra, setExtra] = useState(scale.initial);
  const marks = Math.min(scale.max, Math.max(0, extra));
  const titleId = `${ids}-title`;

  if (result.band.input.mode !== "score") {
    return (
      <section aria-labelledby={titleId} className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-6">
        <h2 id={titleId} className="font-serif text-2xl font-bold text-navy">
          {t.title}
        </h2>
        <p className="mt-2 text-sm text-muted">{t.percentileOnly}</p>
      </section>
    );
  }

  const input = withExtraMarks(result.band.input, marks, table);
  const next = matchColleges(input, data);
  if (next.status !== "ok") return null;
  const better = improvedOptions(result.options, next.options);
  const count = (tag: (typeof OPTION_TAGS)[number]) => formatNumber(next.options.filter((o) => o.tag === tag).length, locale);
  const sliderId = `${ids}-slider`;
  const valueText = format(t.value, { marks: `+${formatNumber(marks, locale)}` });

  return (
    <section aria-labelledby={titleId} className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-6">
      <h2 id={titleId} className="font-serif text-2xl font-bold text-navy">
        {t.title}
      </h2>
      <div className="mt-4 flex flex-col gap-2">
        <label htmlFor={sliderId} className="text-[13px] font-bold text-[#354b66]">
          {t.label}: <output htmlFor={sliderId}>{valueText}</output>
        </label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label={t.decrease}
            disabled={marks <= 0}
            onClick={() => setExtra(Math.max(0, marks - scale.step))}
            className="size-11 shrink-0 p-0"
          >
            <Minus aria-hidden="true" className="size-4" />
          </Button>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={scale.max}
            step={scale.step}
            value={marks}
            aria-valuetext={valueText}
            onChange={(event) => setExtra(Number(event.target.value))}
            className="h-11 min-w-0 flex-1 cursor-pointer accent-navy"
          />
          <Button
            variant="outline"
            size="sm"
            aria-label={t.increase}
            disabled={marks >= scale.max}
            onClick={() => setExtra(Math.min(scale.max, marks + scale.step))}
            className="size-11 shrink-0 p-0"
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      <div role="status" aria-live="polite" className="mt-4 rounded-control bg-surface p-3 text-navy">
        <p className="font-bold">
          {format(t.summary, {
            score: formatNumber(input.value, locale, 2),
            crl: messages.result.crl[next.band.exam],
            band: formatRankRange(next.band.crl, locale, messages.result.range),
          })}
        </p>
        <p className="mt-1 text-sm text-muted">
          {format(t.counts, { likely: count("likely"), borderline: count("borderline"), reach: count("reach") })}
        </p>
      </div>

      {marks > 0 && (
        <div className="mt-5">
          <h3 className="mb-3 text-lg font-extrabold text-navy">{t.improved}</h3>
          {better.length > 0 ? (
            <OptionList options={better} locale={locale} sample={sample} messages={messages.result} />
          ) : (
            <p className="text-sm text-muted">{t.unchanged}</p>
          )}
        </div>
      )}
    </section>
  );
}
