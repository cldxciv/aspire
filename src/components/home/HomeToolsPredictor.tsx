"use client";

import { Calculator, Gauge, LoaderCircle, LockKeyhole, PencilLine } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
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
import {
  miniEstimate,
  miniGateStep,
  miniGateSummary,
  miniResultSlot,
  parseScoreInput,
  revealMiniResult,
  toolGateLayout,
  type MiniGateEffect,
} from "./home-tools";
import { AskRanchoLink } from "./HomeToolsAskRancho";
import {
  controlClass,
  controlErrorClass,
  HI_SMALL,
  labelClass,
  OUTLINE_EDGE,
  SelectField,
  STAGE_INFO,
  STAGE_INFO_LABEL,
  ToolPanel,
  ToolStage,
} from "./HomeToolsPanel";

const SUBMIT_LAYOUT =
  "mt-1.5 w-full aria-disabled:cursor-wait aria-disabled:opacity-70 @min-[22rem]:col-start-2 @min-[22rem]:row-start-1 @min-[22rem]:mt-0 @min-[22rem]:w-auto";

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
  /** "How this works" and its first steps (predictor.how), shown under the empty band from `md`. */
  how: { title: string; steps: string[] };
  /** Recap above the contact form ({exam}, {value}). */
  ready: Record<InputMode, string>;
  /** The recap's button: closes the form, focus back to the value field. */
  change: Record<InputMode, string>;
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

/**
 * Mini rank predictor (homepage tools card): exam + score or percentile → the estimated rank
 * band, computed in the browser by the predictor's pure engine on the tables the server allowed
 * (`data`: score tables only). Inputs have no `name`, so nothing typed can end up in a URL even if
 * the form were submitted before hydration. Like the full tool, the result updates live after the
 * first "Predict" (live edits are never re-gated). Renders its own ToolPanel (the stage depends on
 * its state); `head` and `exits` come from the server.
 *
 * Lead gate (docs/lead-gate-plan.md §8.2): a valid "Predict" asks `useLeadGate` first; while the
 * browser has not shared contact details, the stage shows a recap of what was entered ("Change
 * score" closes the form) and the <LeadGateForm> (its own <form>, outside the inputs), and the
 * band shows once it unlocks. Sample tables are gated too (owner decision 21 Oct 2026; the form
 * says the results use sample data). Only the exam and the score band (never the exact value) go
 * with the details and, once per "Predict" that ends in a band, to the tool-use note (with the
 * page path; sent only for a pass that records use). The up-front note sits under the inputs
 * (hidden while the form itself shows); "Not you?" under the band. Layout per state:
 * `toolGateLayout` (one gold action per state). The gate's client state is browser-only, so the
 * server HTML (and the static homepage) is unchanged. Steps: `miniGateStep` (home-tools.ts).
 */
export function HomeToolsPredictor({
  data,
  locale,
  messages: t,
  gateMessages,
  head,
  exits,
}: {
  data: PredictorData;
  locale: Locale;
  messages: HomeToolsPredictorMessages;
  /** The `leadGate` namespace, picked on the server. */
  gateMessages: Messages<"leadGate">;
  /** Server-built PanelHead (title, tagline, sample tag, lead). */
  head: ReactNode;
  /** Server-built exit links. */
  exits: ReactNode;
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
  /** Bumped to guarantee a render after which `focusTarget` is applied. */
  const [, setFocusTick] = useState(0);
  const asking = useRef(false);
  /** Where focus goes after the next render (the field may be display:none until then). */
  const focusTarget = useRef<"result" | "input" | null>(null);
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

  function focusAfterRender(target: "result" | "input") {
    focusTarget.current = target;
    setFocusTick((tick) => tick + 1);
  }

  /** Runs one gate step: show the band, note the use (the store sends it only for a pass that records use), move focus. */
  function apply(effect: MiniGateEffect) {
    if (effect.reveal) reveal();
    if (effect.note) gate.recordUse({ ...effect.note, page: window.location.pathname });
    // The band (or the field, hidden below `md` while the form shows) is not rendered yet: focus it once it is.
    if (effect.focus === "result") focusAfterRender("result");
    if (effect.focus === "value") focusAfterRender("input");
  }

  function reveal() {
    setRevealed(true);
    if (forgotten) {
      setForgotten(false);
      setIdentityKey((key) => key + 1);
    }
  }

  /** The recap's "Change score": close the form (what was typed in it is dropped) and edit the value. */
  function change() {
    gate.closeGate();
    focusAfterRender("input");
  }

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    (target === "result" ? (bandLabel.current ?? valueInput.current) : valueInput.current)?.focus();
  });

  if (!exam || !table) return null;

  const range = valueRange(table, effectiveMode);
  const outcome = submitted ? miniEstimate(exam, effectiveMode, value, data) : null;
  const slot = miniResultSlot({ outcome, revealed, gateOpen: gate.gateOpen });
  const layout = toolGateLayout(slot);
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
    // "gated": the contact form now takes the stage; `onUnlocked` finishes the step.
    apply(miniGateStep({ kind: "predict", decision }, current, table));
  }

  const controls = (
    <>
      <form onSubmit={onSubmit} noValidate>
        <div className="grid gap-3 @min-[20rem]:grid-cols-2">
          <div className={supportsPercentile ? "min-w-0" : "min-w-0 @min-[20rem]:col-span-2"}>
            <label htmlFor={examId} className={labelClass}>
              {t.exam}
            </label>
            <SelectField id={examId} value={exam} onChange={(event) => setExam(event.target.value as PredictorExam)}>
              {exams.map((option) => (
                <option key={option} value={option}>
                  {t.exams[option]}
                </option>
              ))}
            </SelectField>
          </div>
          {supportsPercentile && (
            <div className="min-w-0">
              <label htmlFor={modeId} className={labelClass}>
                {t.mode}
              </label>
              <SelectField id={modeId} value={effectiveMode} onChange={(event) => setMode(event.target.value as InputMode)}>
                {(["score", "percentile"] as const).map((option) => (
                  <option key={option} value={option}>
                    {t.modes[option]}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
        </div>
        <div className="mt-3 min-w-0">
          <label htmlFor={valueId} className={labelClass}>
            {effectiveMode === "percentile" ? t.percentile : t.score}
          </label>
          {/* DOM order: input, its hint and error, then the button (beside the input from 22rem). */}
          <div className="grid gap-x-3 gap-y-1.5 @min-[22rem]:grid-cols-[minmax(0,1fr)_auto]">
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
              className={cn(error ? controlErrorClass : controlClass, "@min-[22rem]:col-start-1 @min-[22rem]:row-start-1")}
            />
            <p id={`${valueId}-hint`} className={cn("text-xs text-muted @min-[22rem]:col-start-1", HI_SMALL)}>
              {hint}
            </p>
            {error && (
              <p id={`${valueId}-error`} className="text-xs font-semibold text-danger @min-[22rem]:col-start-1">
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant={layout.submitVariant}
              aria-disabled={pending || undefined}
              className={layout.submitVariant === "outline" ? `${SUBMIT_LAYOUT} ${OUTLINE_EDGE}` : SUBMIT_LAYOUT}
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Calculator aria-hidden="true" className="size-4" />
              )}
              {pending ? t.pending : t.submit}
            </Button>
          </div>
        </div>
      </form>
      {/* Up-front disclosure from the live gate mode (nothing while unknown, off or already satisfied); the form's own lead says it while the form shows. */}
      {layout.note && <LeadGateNote messages={gateMessages} className="mt-3" />}
    </>
  );

  const stage = (
    <ToolStage tone={layout.stageTone}>
      {slot === "gate" ? (
        <>
          {/* Local values only; not a live region (the form's heading takes focus). Hidden while the value is invalid (its own error shows). */}
          {layout.recap && outcome?.status === "ok" && (
            <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface p-3 sm:p-4">
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-gold">
                <LockKeyhole className="size-4" />
              </span>
              <p className="min-w-0 flex-1 basis-48 text-sm leading-snug font-semibold text-navy">
                {format(t.ready[effectiveMode], { exam: t.exams[exam], value: formatNumber(parseScoreInput(value), locale, 2) })}
              </p>
              <Button variant="outline" className={`w-full sm:w-auto ${OUTLINE_EDGE}`} onClick={change}>
                <PencilLine aria-hidden="true" className="size-4" />
                {t.change[effectiveMode]}
              </Button>
            </div>
          )}
          {/* Its own <form>, outside the inputs; never inside a live region. */}
          <LeadGateForm {...gate.formProps} messages={gateMessages} summary={gateSummary} variant="panel" headingLevel={3} className="mt-3" />
        </>
      ) : band ? (
        <>
          <HomeToolsBand band={band} locale={locale} messages={t} labelRef={bandLabel} />
          {/* Exam, score range and rank band only (predictor/rancho.ts), like the full predictor. */}
          <AskRanchoLink
            href={localePath("/tools/ask", locale)}
            detail={predictorRanchoDetail(band, table, locale, t)}
            size="md"
            variant="light"
            className="mt-3 self-start"
          >
            {t.askRancho}
          </AskRanchoLink>
        </>
      ) : (
        <>
          {/* A greyed outline of the band to come, at the band's own size (decorative). */}
          <div aria-hidden="true" className="rounded-control bg-navy/[0.05] p-5">
            <div className="h-3 w-32 max-w-full rounded-full bg-navy/10" />
            <div className="mt-2.5 h-9 w-52 max-w-full rounded-md bg-navy/10" />
            <div className="mt-2.5 h-3 w-40 max-w-full rounded-full bg-navy/10" />
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Gauge aria-hidden="true" className="size-4 shrink-0 text-blue" />
            {t.empty}
          </p>
          {/* From `md` the stage is a tall column: say what happens to the score (phones keep it short). */}
          <div className={`${STAGE_INFO} max-md:hidden`}>
            <p className={STAGE_INFO_LABEL}>{t.how.title}</p>
            <ol className="mt-2.5 grid gap-2">
              {t.how.steps.map((step, index) => (
                <li key={step} className="flex items-center gap-2.5 text-sm leading-snug text-ink">
                  <span
                    aria-hidden="true"
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-blue ring-1 ring-[#d3e2f5]"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
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
            focusAfterRender("input");
          }}
        />
      )}
    </ToolStage>
  );

  return (
    <>
      {/* Out of flow (sr-only is absolutely positioned), so it takes no cell in the tab panel's grid. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      <ToolPanel gated={layout.gated} head={head} controls={controls} stage={stage} exits={exits} />
    </>
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
      <div className="rounded-control bg-navy p-5 text-white" data-surface="dark">
        <p ref={labelRef} tabIndex={labelRef ? -1 : undefined} className="text-xs font-bold text-[#d3e1f3]">
          {t.crl[band.exam]}
        </p>
        <p className="mt-1 text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-extrabold text-gold">
          {formatRankRange(band.crl, locale, t.range)}
        </p>
        <p className={cn("mt-1 text-xs text-[#d3e1f3]", HI_SMALL)}>
          {percentileLabel}: {formatPercentileRange(band.percentile, locale, t.range)}
        </p>
      </div>
      {/* D-032: sample tables never read as official data. */}
      <p className={cn("mt-2 text-xs font-semibold text-muted", HI_SMALL)}>
        {format(band.sample ? t.basedOnSample : t.basedOn, { exam: t.exams[band.exam], year: band.year })}
      </p>
      <p className={cn("mt-1 text-xs leading-relaxed text-muted", HI_SMALL)}>{t.bandNote}</p>
    </div>
  );
}
