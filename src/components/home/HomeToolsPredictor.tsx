"use client";

import { Calculator } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { formatNumber, formatPercentileRange, formatRankRange } from "@/components/predictor/format";
import { Button } from "@/components/ui";
import { predictorRanchoDetail } from "@/components/predictor/rancho";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import {
  loadedExams,
  scoreTableFor,
  valueRange,
  type InputMode,
  type PredictorData,
  type PredictorExam,
  type RankBandPrediction,
} from "@/lib/predictor/engine";
import { miniEstimate } from "./home-tools";
import { AskRanchoLink } from "./HomeToolsAskRancho";

/** Strings from the `predictor` namespace (form + result) and `home.tools.predictor`, picked on the server. */
export interface HomeToolsPredictorMessages {
  exam: string;
  exams: Record<PredictorExam, string>;
  mode: string;
  modes: Record<InputMode, string>;
  score: string;
  scoreHint: string;
  percentile: string;
  percentileHint: string;
  errorValue: string;
  submit: string;
  empty: string;
  crl: Record<PredictorExam, string>;
  range: string;
  percentileBand: string;
  percentileYours: string;
  basedOn: string;
  basedOnSample: string;
  bandNote: string;
  rangeScore: string;
  rangePercentile: string;
  askRancho: string;
  askRanchoPrompt: string;
  askRanchoContext: string;
  askRanchoSample: string;
}

export const controlClass =
  "block min-h-11 w-full min-w-0 rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px] text-ink transition-colors focus:border-blue";
export const labelClass = "mb-1.5 block text-[13px] font-bold text-[#354b66]";

/**
 * Mini rank predictor (homepage tools widget): exam + score or percentile → the estimated rank
 * band, computed in the browser by the predictor's pure engine on the tables the server allowed
 * (`data`: score tables only). Inputs have no `name`, so nothing typed can end up in a URL even if
 * the form were submitted before hydration; nothing is stored or sent. Like the full tool, the
 * result updates live after the first "Predict".
 */
export function HomeToolsPredictor({
  data,
  locale,
  messages: t,
}: {
  data: PredictorData;
  locale: Locale;
  messages: HomeToolsPredictorMessages;
}) {
  const ids = useId();
  const exams = loadedExams(data);
  const [exam, setExam] = useState<PredictorExam | undefined>(exams[0]);
  const [mode, setMode] = useState<InputMode>("score");
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const valueInput = useRef<HTMLInputElement>(null);

  const table = exam ? scoreTableFor(exam, data) : undefined;
  if (!exam || !table) return null;

  const supportsPercentile = table.supports.percentile;
  const effectiveMode: InputMode = supportsPercentile ? mode : "score";
  const range = valueRange(table, effectiveMode);
  const outcome = submitted ? miniEstimate(exam, effectiveMode, value, data) : null;
  const band = outcome?.status === "ok" ? outcome.band : null;
  const error =
    outcome?.status === "invalid"
      ? format(t.errorValue, { min: formatNumber(outcome.min, locale), max: formatNumber(outcome.max, locale) })
      : undefined;
  // What screen readers hear (like the full predictor's sr-only status): a short band summary,
  // with the sample label when it applies, or the value error. Empty before the first "Predict",
  // so the placeholder and the long band note are never announced.
  const announcement = band
    ? `${t.crl[band.exam]}: ${formatRankRange(band.crl, locale, t.range)}.` +
      (band.sample ? ` ${format(t.basedOnSample, { exam: t.exams[band.exam], year: band.year })}` : "")
    : (error ?? "");

  const examId = `${ids}-exam`;
  const modeId = `${ids}-mode`;
  const valueId = `${ids}-value`;
  const hint =
    effectiveMode === "percentile"
      ? t.percentileHint
      : format(t.scoreHint, { min: formatNumber(range.low, locale), max: formatNumber(range.high, locale) });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (exam && miniEstimate(exam, effectiveMode, value, data).status !== "ok") valueInput.current?.focus();
  }

  return (
    <div>
      <form onSubmit={onSubmit} noValidate className="grid gap-3 @sm:grid-cols-2">
        <div className={cn("min-w-0", !supportsPercentile && "@sm:col-span-2")}>
          <label htmlFor={examId} className={labelClass}>
            {t.exam}
          </label>
          <select id={examId} value={exam} onChange={(event) => setExam(event.target.value as PredictorExam)} className={controlClass}>
            {exams.map((option) => (
              <option key={option} value={option}>
                {t.exams[option]}
              </option>
            ))}
          </select>
        </div>
        {supportsPercentile && (
          <div className="min-w-0">
            <label htmlFor={modeId} className={labelClass}>
              {t.mode}
            </label>
            <select id={modeId} value={effectiveMode} onChange={(event) => setMode(event.target.value as InputMode)} className={controlClass}>
              {(["score", "percentile"] as const).map((option) => (
                <option key={option} value={option}>
                  {t.modes[option]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="min-w-0 @sm:col-span-2">
          <label htmlFor={valueId} className={labelClass}>
            {effectiveMode === "percentile" ? t.percentile : t.score}
          </label>
          <div className="flex flex-col gap-3 @md:flex-row">
            <input
              ref={valueInput}
              id={valueId}
              type="number"
              inputMode="decimal"
              step="any"
              min={range.low}
              max={range.high}
              autoComplete="off"
              required
              aria-required="true"
              aria-invalid={error ? true : undefined}
              aria-describedby={[`${valueId}-hint`, error ? `${valueId}-error` : null].filter(Boolean).join(" ")}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className={cn(controlClass, "@md:flex-1", error && "border-danger bg-danger-soft/40")}
            />
            <Button type="submit" variant="dark" className="shrink-0">
              <Calculator aria-hidden="true" className="size-4" />
              {t.submit}
            </Button>
          </div>
          <p id={`${valueId}-hint`} className="mt-1.5 text-xs text-muted">
            {hint}
          </p>
          {error && (
            <p id={`${valueId}-error`} className="mt-1 text-xs font-semibold text-danger">
              {error}
            </p>
          )}
        </div>
      </form>

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      <div className="mt-4">
        {band ? (
          <>
            <HomeToolsBand band={band} locale={locale} messages={t} />
            {/* Exam, score range and rank band only (predictor/rancho.ts), like the full predictor. */}
            <AskRanchoLink
              href={localePath("/tools/ask", locale)}
              detail={predictorRanchoDetail(band, table, locale, t)}
              size="sm"
              className="mt-3"
            >
              {t.askRancho}
            </AskRanchoLink>
          </>
        ) : (
          <p className="flex min-h-[6.5rem] items-center rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-4 text-sm text-muted">
            {t.empty}
          </p>
        )}
      </div>
    </div>
  );
}

/** The computed band (exported for tests): common-rank-list band, percentile and the sample / band notes. */
export function HomeToolsBand({
  band,
  locale,
  messages: t,
}: {
  band: RankBandPrediction;
  locale: Locale;
  messages: Pick<HomeToolsPredictorMessages, "crl" | "range" | "percentileBand" | "percentileYours" | "basedOn" | "basedOnSample" | "bandNote" | "exams">;
}) {
  const percentileLabel = band.input.mode === "percentile" ? t.percentileYours : t.percentileBand;
  return (
    <div>
      <div className="rounded-control bg-navy p-4 text-white" data-surface="dark">
        <p className="text-xs font-bold text-[#d3e1f3]">{t.crl[band.exam]}</p>
        <p className="mt-0.5 text-[clamp(1.6rem,4.5vw,2.1rem)] leading-tight font-extrabold text-gold">
          {formatRankRange(band.crl, locale, t.range)}
        </p>
        <p className="mt-1 text-xs text-[#d3e1f3]">
          {percentileLabel}: {formatPercentileRange(band.percentile, locale, t.range)}
        </p>
      </div>
      {/* D-032: sample tables never read as official data. */}
      <p className="mt-2 text-xs font-semibold text-muted">
        {format(band.sample ? t.basedOnSample : t.basedOn, { exam: t.exams[band.exam], year: band.year })}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t.bandNote}</p>
    </div>
  );
}
