"use client";

import { Calculator, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from "react";
import { LeadGateForm } from "@/components/lead-gate/LeadGateForm";
import { LeadGateIdentity } from "@/components/lead-gate/LeadGateIdentity";
import { LeadGateNote } from "@/components/lead-gate/LeadGateNote";
import { useLeadGate } from "@/components/lead-gate/use-lead-gate";
import { formatNumber, formatPercentileRange, formatRankRange } from "@/components/predictor/format";
import { Button } from "@/components/ui";
import { predictorRanchoDetail } from "@/components/predictor/rancho";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
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
import { miniEstimate, miniGateStep, miniGateSummary, miniResultSlot, revealMiniResult, type MiniGateEffect } from "./home-tools";
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
  /** Submit label while the lead gate is asked whether the band may show (predictor.form.checking). */
  pending: string;
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
 * the form were submitted before hydration. Like the full tool, the result updates live after the
 * first "Predict" (live edits are never re-gated).
 *
 * Lead gate (docs/lead-gate-plan.md §8.2): a valid "Predict" asks `useLeadGate` first; while the
 * browser has not shared contact details, the compact <LeadGateForm> takes the result slot (its
 * own <form>, outside this one) and the band shows once it unlocks. Sample tables are gated too
 * (owner decision 21 Oct 2026; the form says the results use sample data). Only the exam and the
 * score band (never the exact value) go with the details and, once per "Predict" that ends in a
 * band, to the tool-use note (with the page path; sent only for a pass that records use). The
 * up-front note sits under the inputs (it reads the gate's status, GET /api/lead-gate, when the
 * page loads); "Not you?" under the band. The gate's client state is browser-only, so the server
 * HTML (and the static homepage) is unchanged. Steps: `miniGateStep` (home-tools.ts).
 */
export function HomeToolsPredictor({
  data,
  locale,
  messages: t,
  gateMessages,
}: {
  data: PredictorData;
  locale: Locale;
  messages: HomeToolsPredictorMessages;
  /** The `leadGate` namespace, picked on the server. */
  gateMessages: Messages<"leadGate">;
}) {
  const ids = useId();
  const exams = loadedExams(data);
  const [exam, setExam] = useState<PredictorExam | undefined>(exams[0]);
  const [mode, setMode] = useState<InputMode>("score");
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  /** This widget may show bands (the gate let it); false again after "Not you?". */
  const [revealed, setRevealed] = useState(false);
  /** "Not you?" was used: keeps its confirmation line in place under the placeholder. */
  const [forgotten, setForgotten] = useState(false);
  /** Remounts the identity line after a new unlock, so an old "forgotten" message never lingers. */
  const [identityKey, setIdentityKey] = useState(0);
  /** The gate's status request is in flight (first "Predict" on this page). */
  const [pending, setPending] = useState(false);
  const asking = useRef(false);
  const focusAfterUnlock = useRef(false);
  const valueInput = useRef<HTMLInputElement>(null);
  /** The band's first line (the rank-list label): where focus goes after this widget's own form unlocks. */
  const bandLabel = useRef<HTMLParagraphElement>(null);

  const table = exam ? scoreTableFor(exam, data) : undefined;
  const supportsPercentile = table?.supports.percentile === true;
  const effectiveMode: InputMode = supportsPercentile ? mode : "score";

  const gate = useLeadGate({
    tool: "predictor",
    // The form (or another tool on this page / another tab) unlocked: the band for the current input.
    onUnlocked: ({ byThisHost }) => {
      if (exam) apply(miniGateStep({ kind: "unlocked", byThisHost }, miniEstimate(exam, effectiveMode, value, data), table));
    },
  });

  /** Runs one gate step: show the band, note the use (the store sends it only for a pass that records use), move focus. */
  function apply(effect: MiniGateEffect) {
    if (effect.reveal) reveal();
    if (effect.note) gate.recordUse({ ...effect.note, page: window.location.pathname });
    if (effect.focus === "value") valueInput.current?.focus();
    // The band is not rendered yet: focus it once it is (the form that held focus is going).
    if (effect.focus === "result") focusAfterUnlock.current = true;
  }

  function reveal() {
    setRevealed(true);
    if (forgotten) {
      setForgotten(false);
      setIdentityKey((key) => key + 1);
    }
  }

  useEffect(() => {
    if (!focusAfterUnlock.current) return;
    focusAfterUnlock.current = false;
    (bandLabel.current ?? valueInput.current)?.focus();
  });

  if (!exam || !table) return null;

  const range = valueRange(table, effectiveMode);
  const outcome = submitted ? miniEstimate(exam, effectiveMode, value, data) : null;
  const slot = miniResultSlot({ outcome, revealed, gateOpen: gate.gateOpen });
  const band = slot === "result" && outcome?.status === "ok" ? outcome.band : null;
  const gateSummary = outcome?.status === "ok" ? miniGateSummary(outcome.band, table) : undefined;
  const error =
    outcome?.status === "invalid"
      ? format(t.errorValue, { min: formatNumber(outcome.min, locale), max: formatNumber(outcome.max, locale) })
      : undefined;
  // What screen readers hear (like the full predictor's sr-only status): a short band summary,
  // with the sample label when it applies, or the value error. Empty before the first "Predict"
  // and while the contact form shows (its heading takes focus), so the band is announced only
  // after the gate unlocks; the placeholder and the long band note are never announced. When this
  // widget's own form unlocks, focus lands on the band's short first line (the rank-list label)
  // and this region reads the band itself, as the full predictor does with its result heading.
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); // synchronously, before any await
    setSubmitted(true);
    if (!exam || asking.current) return;
    const current = miniEstimate(exam, effectiveMode, value, data);
    if (current.status !== "ok") {
      // Validated first: an invalid value never asks for contact details.
      apply(miniGateStep({ kind: "predict", decision: "invalid" }, current, table));
      return;
    }
    asking.current = true;
    // Only a real status request is worth a label (an open or locked gate answers at once).
    const checking = gate.status === "unknown" || gate.status === "checking";
    if (checking) setPending(true);
    const decision = await revealMiniResult(current, gate.requestAccess);
    asking.current = false;
    if (checking) setPending(false);
    // "gated": the contact form now takes the result slot; `onUnlocked` finishes the step.
    apply(miniGateStep({ kind: "predict", decision }, current, table));
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
            <Button
              type="submit"
              variant="dark"
              aria-disabled={pending || undefined}
              className="shrink-0 aria-disabled:cursor-wait aria-disabled:opacity-70"
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Calculator aria-hidden="true" className="size-4" />
              )}
              {pending ? t.pending : t.submit}
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
      {/* Up-front disclosure from the live gate mode (nothing while unknown, off or already satisfied). */}
      <LeadGateNote messages={gateMessages} className="mt-3" />

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      <div className="mt-4">
        {slot === "gate" ? (
          // Its own <form>, outside the inputs above; never inside the live region.
          <LeadGateForm {...gate.formProps} messages={gateMessages} summary={gateSummary} variant="compact" headingLevel={3} />
        ) : band ? (
          <div>
            <HomeToolsBand band={band} locale={locale} messages={t} labelRef={bandLabel} />
            {/* Exam, score range and rank band only (predictor/rancho.ts), like the full predictor. */}
            <AskRanchoLink
              href={localePath("/tools/ask", locale)}
              detail={predictorRanchoDetail(band, table, locale, t)}
              size="sm"
              className="mt-3"
            >
              {t.askRancho}
            </AskRanchoLink>
          </div>
        ) : (
          <p className="flex min-h-[6.5rem] items-center rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-4 text-sm text-muted">
            {t.empty}
          </p>
        )}
        {/* "Not you?" / "Stop Aspire contacting me" (renders only for a pass, or with its own confirmation). */}
        {(revealed || forgotten) && (
          <LeadGateIdentity
            key={identityKey}
            messages={gateMessages}
            className="mt-3"
            onForgotten={() => {
              setRevealed(false);
              setForgotten(true);
              // The pressed button goes with the pass: keep focus in the widget (the confirmation
              // line stays and is announced by its own status region).
              valueInput.current?.focus();
            }}
          />
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
  labelRef,
}: {
  band: RankBandPrediction;
  locale: Locale;
  messages: Pick<HomeToolsPredictorMessages, "crl" | "range" | "percentileBand" | "percentileYours" | "basedOn" | "basedOnSample" | "bandNote" | "exams">;
  /** Makes the first line (the rank-list label) a focus target (tabIndex -1; the global gold focus ring on navy). */
  labelRef?: Ref<HTMLParagraphElement>;
}) {
  const percentileLabel = band.input.mode === "percentile" ? t.percentileYours : t.percentileBand;
  return (
    <div>
      <div className="rounded-control bg-navy p-4 text-white" data-surface="dark">
        <p ref={labelRef} tabIndex={labelRef ? -1 : undefined} className="text-xs font-bold text-[#d3e1f3]">
          {t.crl[band.exam]}
        </p>
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
