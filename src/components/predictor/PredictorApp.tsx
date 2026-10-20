"use client";

import { Calculator, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toolEnquiryHref } from "@/components/forms/enquiry-context";
import { AskRanchoLink } from "@/components/home/HomeToolsAskRancho";
import { LeadGateForm } from "@/components/lead-gate/LeadGateForm";
import { LeadGateIdentity } from "@/components/lead-gate/LeadGateIdentity";
import { LeadGateNote } from "@/components/lead-gate/LeadGateNote";
import { useLeadGate } from "@/components/lead-gate/use-lead-gate";
import type { LeadGateStore } from "@/components/lead-gate/lead-gate-store";
import { Badge, Button, ButtonLink } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import {
  GENDERS,
  HOME_STATES,
  PREDICTOR_CATEGORIES,
  hasSampleData,
  loadedExams,
  matchColleges,
  scoreTableFor,
  valueRange,
  type CollegeMatchPrediction,
  type ExamScoreTable,
  type Gender,
  type HomeState,
  type InputMode,
  type PredictorCategory,
  type PredictorData,
  type PredictorExam,
  type PredictorInputLike,
} from "@/lib/predictor/engine";
import { formatNumber, formatPercentileRange, formatRankRange } from "./format";
import { OptionList } from "./OptionList";
import {
  INITIAL_PREDICTOR_GATE,
  PredictorGateController,
  predictorSummary,
  type PredictorGateState,
  type PredictorSummary,
} from "./predictor-gate";
import { predictorRanchoDetail } from "./rancho";
import { SharePanel } from "./SharePanel";
import { WhatIfPanel } from "./WhatIfPanel";

type PredictorMessages = Messages<"predictor">;
export type PredictorAppMessages = Pick<PredictorMessages, "form" | "result" | "whatIf" | "share">;

const controlClass =
  "w-full min-h-11 rounded-lg border border-[#d8e2ef] bg-white px-3 py-2.5 text-[15px] text-ink transition-colors focus:border-blue";
const labelClass = "text-[13px] font-bold text-[#354b66]";
const pillClass =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#d8e2ef] bg-white px-3 py-2 text-sm font-semibold text-navy transition-colors " +
  "has-checked:border-navy has-checked:bg-navy has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Parses "182", "182.5" or "99,5" (comma decimal); NaN when empty or not a number. */
function parseValue(raw: string): number {
  const text = raw.trim().replace(",", ".");
  return text === "" ? Number.NaN : Number(text);
}

/**
 * Rank & college predictor (client). Runs the pure engine in the browser on the tables the
 * server decided may be shown (`data`; null → nothing renders here, the page shows "coming soon").
 *
 * Lead gate (D-043, docs/lead-gate-plan.md §8.1; ./predictor-gate.ts): an explicit submit is
 * validated first; an ok result is shown only once this browser is unlocked (contact details
 * shared, signed in, gate off, or the gate failing open). Sample tables are gated too (owner
 * decision, 21 Oct 2026); the form says so itself. The exact score, category, PwD, home state and
 * gender never leave the browser: the gate and the usage note carry only the exam and the share
 * card's score band. The share card URL carries only exam + bucket.
 */
export function PredictorApp({
  data,
  messages,
  leadGate,
  pageUrl,
  gateStore,
}: {
  data: PredictorData | null;
  messages: PredictorAppMessages;
  /** Namespace `leadGate`, loaded by the server parent (D-028). */
  leadGate: Messages<"leadGate">;
  /** Absolute URL of this page in the current locale (for share text). */
  pageUrl: string;
  /** Tests only: a lead-gate store with fake dependencies. */
  gateStore?: LeadGateStore;
}) {
  const locale = useLocale();
  const t = messages;
  const ids = useId();
  const exams = loadedExams(data);
  const [exam, setExam] = useState<PredictorExam | undefined>(exams[0]);
  const [mode, setMode] = useState<InputMode>("score");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState<PredictorCategory>("GEN");
  const [pwd, setPwd] = useState(false);
  const [homeState, setHomeState] = useState<HomeState>("HP");
  const [gender, setGender] = useState<Gender>("other");
  const [submitted, setSubmitted] = useState(false);
  const [gateState, setGateState] = useState<PredictorGateState>(INITIAL_PREDICTOR_GATE);
  /** Exam + score band of the last ok submit (fallback when the live input no longer gives a result). */
  const [pending, setPending] = useState<PredictorSummary | null>(null);
  // The gate's steps and effects (./predictor-gate.ts); bound to this render's values below.
  const [controller] = useState(() => new PredictorGateController());
  const resultSection = useRef<HTMLElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const valueInput = useRef<HTMLInputElement>(null);

  const gate = useLeadGate({
    tool: "predictor",
    store: gateStore,
    onUnlocked: ({ byThisHost }) => controller.unlocked(byThisHost),
  });

  const table = exam ? scoreTableFor(exam, data) : undefined;
  const supports = table?.supports;
  const effectiveMode: InputMode = supports?.percentile ? mode : "score";
  const range = table ? valueRange(table, effectiveMode) : { low: 0, high: 0 };

  const input: PredictorInputLike | null = exam
    ? { exam, mode: effectiveMode, value: parseValue(value), category, pwd, homeState, gender }
    : null;
  // Live after the first submit: every change re-runs the engine (cheap, pure, in the browser).
  const outcome = submitted && input ? matchColleges(input, data) : null;
  const shown = gateState.phase === "shown";
  // Computed live, but shown only once this page is unlocked.
  const result: CollegeMatchPrediction | null = shown && outcome?.status === "ok" ? outcome : null;
  const checking = gateState.phase === "checking";
  const gateFormOpen = (gateState.phase === "gated" || checking) && gate.gateOpen;
  const valueError =
    outcome?.status === "invalid" && outcome.issues.some((issue) => issue.field === "value")
      ? format(t.form.errorValue, { min: formatNumber(range.low, locale), max: formatNumber(range.high, locale) })
      : undefined;
  // What the lead (the form's attribution) and the usage note carry: the exam + band of the result
  // that will be shown, i.e. the live one (inputs edited while the contact form is open count),
  // else the last ok submit.
  const liveSummary = outcome?.status === "ok" ? predictorSummary(outcome, table) : null;

  const { requestAccess, recordUse } = gate;
  const store = gate.formProps.store;
  useEffect(() => {
    controller.connect({
      requestAccess,
      storeOpen: () => store.getSnapshot().status === "open",
      summary: () => liveSummary,
      recordUse: (usage) => recordUse({ ...usage, page: window.location.pathname }),
      focusInResult: () => !!resultSection.current?.contains(document.activeElement),
      // Let the new state render first (screen readers and small screens).
      focusResult: () => requestAnimationFrame(() => resultHeading.current?.focus()),
      render: setGateState,
    });
  }, [controller, requestAccess, recordUse, store, liveSummary]);

  if (!exam || !table || !supports) return null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); // synchronously, before the gate is asked
    setSubmitted(true);
    if (!input) return;
    // Validate the tool's own input FIRST: an invalid value never opens the contact form.
    const check = matchColleges(input, data);
    if (check.status !== "ok") {
      controller.submitInvalid();
      valueInput.current?.focus();
      return;
    }
    const summary = predictorSummary(check, table);
    setPending(summary);
    controller.submitOk(summary);
  }

  const sample = result ? result.band.sample || !!result.cutoffs?.sample : hasSampleData(data);
  const valueId = `${ids}-value`;
  const valueLabel = effectiveMode === "percentile" ? t.form.percentile : t.form.score;
  const valueHint =
    effectiveMode === "percentile"
      ? t.form.percentileHint
      : format(t.form.scoreHint, { min: formatNumber(range.low, locale), max: formatNumber(range.high, locale) });

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <form
        onSubmit={onSubmit}
        noValidate
        aria-labelledby={`${ids}-form-title`}
        className="flex flex-col gap-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-6 lg:col-span-5 lg:self-start"
      >
        <div>
          <h2 id={`${ids}-form-title`} className="font-serif text-2xl font-bold text-navy">
            {t.form.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{t.form.privacy}</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className={cn(labelClass, "mb-2")}>{t.form.exam}</legend>
          <div className="flex flex-wrap gap-2">
            {exams.map((option) => (
              <label key={option} className={pillClass}>
                <input
                  type="radio"
                  name="exam"
                  value={option}
                  checked={exam === option}
                  onChange={() => setExam(option)}
                  className="sr-only"
                />
                <span lang={locale === "hi" ? undefined : "en"}>{t.form.exams[option]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {supports.percentile && (
          <fieldset className="flex flex-col gap-2">
            <legend className={cn(labelClass, "mb-2")}>{t.form.mode}</legend>
            <div className="flex flex-wrap gap-2">
              {(["score", "percentile"] as const).map((option) => (
                <label key={option} className={pillClass}>
                  <input
                    type="radio"
                    name="mode"
                    value={option}
                    checked={effectiveMode === option}
                    onChange={() => setMode(option)}
                    className="sr-only"
                  />
                  {t.form.modes[option]}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <Field id={valueId} label={valueLabel} hint={valueHint} error={valueError}>
          <input
            ref={valueInput}
            id={valueId}
            name="value"
            type="number"
            inputMode="decimal"
            step="any"
            min={range.low}
            max={range.high}
            required
            aria-required="true"
            aria-invalid={valueError ? true : undefined}
            aria-describedby={[`${valueId}-hint`, valueError ? `${valueId}-error` : null].filter(Boolean).join(" ")}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className={cn(controlClass, valueError && "border-danger bg-danger-soft/40")}
          />
        </Field>

        {supports.category || supports.homeState || supports.gender ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {supports.category && (
              <Field id={`${ids}-category`} label={t.form.category}>
                <select
                  id={`${ids}-category`}
                  name="category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as PredictorCategory)}
                  className={controlClass}
                >
                  {PREDICTOR_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {t.form.categories[option]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {supports.homeState && (
              <Field id={`${ids}-home`} label={t.form.homeState} hint={t.form.homeStateHint}>
                <select
                  id={`${ids}-home`}
                  name="homeState"
                  value={homeState}
                  aria-describedby={`${ids}-home-hint`}
                  onChange={(event) => setHomeState(event.target.value as HomeState)}
                  className={controlClass}
                >
                  {HOME_STATES.map((option) => (
                    <option key={option} value={option}>
                      {t.form.homeStates[option]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {supports.gender && (
              <Field id={`${ids}-gender`} label={t.form.gender} hint={t.form.genderHint}>
                <select
                  id={`${ids}-gender`}
                  name="gender"
                  value={gender}
                  aria-describedby={`${ids}-gender-hint`}
                  onChange={(event) => setGender(event.target.value as Gender)}
                  className={controlClass}
                >
                  {GENDERS.map((option) => (
                    <option key={option} value={option}>
                      {t.form.genders[option]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{t.form.bohNote}</p>
        )}

        {supports.pwd && (
          <div className="flex items-center gap-3 rounded-lg bg-surface p-3">
            <input
              id={`${ids}-pwd`}
              name="pwd"
              type="checkbox"
              checked={pwd}
              onChange={(event) => setPwd(event.target.checked)}
              className="size-5 shrink-0 cursor-pointer accent-navy"
            />
            <label htmlFor={`${ids}-pwd`} className="cursor-pointer text-sm text-[#354b66]">
              {t.form.pwd}
            </label>
          </div>
        )}

        <LeadGateNote messages={leadGate} store={gateStore} />

        <Button
          type="submit"
          aria-disabled={checking || undefined}
          className="w-full aria-disabled:cursor-wait aria-disabled:opacity-70 sm:w-auto sm:self-start"
        >
          {checking ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Calculator aria-hidden="true" className="size-4" />
          )}
          {checking ? t.form.checking : t.form.submit}
        </Button>
      </form>

      <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
        <section ref={resultSection} aria-labelledby={`${ids}-result-title`} className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id={`${ids}-result-title`}
              ref={resultHeading}
              tabIndex={-1}
              className="font-serif text-2xl font-bold text-navy focus:outline-none"
            >
              {t.result.title}
            </h2>
            {sample && <Badge variant="demo">{t.result.sample}</Badge>}
          </div>
          {gateState.everShown && (
            // Keyed by the store's unlock count: a fresh line each time this browser is unlocked
            // again, so an earlier "no longer has your details" status never sits beside "shared".
            <LeadGateIdentity
              key={gate.unlockSeq}
              messages={leadGate}
              store={gateStore}
              onForgotten={() => controller.forgotten()}
              className="mt-1"
            />
          )}
          <div role="status" aria-live="polite" className="sr-only">
            {result
              ? `${t.result.crl[result.band.exam]}: ${formatRankRange(result.band.crl, locale, t.result.range)}. ${format(t.whatIf.counts, {
                  likely: result.options.filter((o) => o.tag === "likely").length,
                  borderline: result.options.filter((o) => o.tag === "borderline").length,
                  reach: result.options.filter((o) => o.tag === "reach").length,
                })}`
              : ""}
          </div>
          {result ? (
            <ResultBody result={result} messages={t} sample={sample} table={table} />
          ) : gateFormOpen ? (
            // Its own <form>, outside the predictor's input form; never inside the live region above.
            <LeadGateForm
              {...gate.formProps}
              messages={leadGate}
              summary={liveSummary ?? pending ?? undefined}
              headingLevel={3}
              className="mt-4"
            />
          ) : (
            <p className="mt-3 text-sm text-muted">{t.result.empty}</p>
          )}
        </section>

        {result && (
          <WhatIfPanel
            result={result}
            data={data}
            table={table}
            messages={{ whatIf: t.whatIf, result: t.result }}
            sample={sample}
          />
        )}
        {result && <SharePanel result={result} data={data} table={table} messages={{ share: t.share, result: t.result, form: t.form }} pageUrl={pageUrl} />}
      </div>
    </div>
  );
}

/**
 * "Talk to a counsellor" link (D-039): the enquiry form with `from=predictor`, the exam and the
 * score/percentile band of the share card (e.g. 180–189 marks) — never the exact value, category,
 * state, gender or anything personal. The form tells the visitor these are added to the enquiry.
 */
export function predictorEnquiryHref(result: CollegeMatchPrediction, table: ExamScoreTable | undefined, locale: Locale): string {
  return toolEnquiryHref("predictor", locale, predictorSummary(result, table));
}

/**
 * Exported for tests. `table` (the exam's score table) adds the score band to the counsellor link
 * and enables "Ask Rancho how to improve" (exam, score range and rank band only; ./rancho.ts).
 */
export function ResultBody({
  result,
  messages: t,
  sample,
  table,
}: {
  result: CollegeMatchPrediction;
  messages: PredictorAppMessages;
  sample: boolean;
  table?: ExamScoreTable;
}) {
  const locale = useLocale();
  const { band } = result;
  const categoryLabel = t.form.categories[band.input.category];
  const percentileTemplate = band.input.mode === "percentile" ? t.result.percentileYours : t.result.percentileBand;
  const ranks: { label: string; value: string }[] = [
    { label: t.result.crl[band.exam], value: formatRankRange(band.crl, locale, t.result.range) },
    ...(band.categoryRank
      ? [{ label: format(t.result.categoryRank, { category: categoryLabel }), value: formatRankRange(band.categoryRank, locale, t.result.range) }]
      : []),
    ...(band.pwdRank ? [{ label: t.result.pwdRank, value: formatRankRange(band.pwdRank, locale, t.result.range) }] : []),
    ...(band.categoryPwdRank
      ? [
          {
            label: format(t.result.categoryPwdRank, { category: categoryLabel }),
            value: formatRankRange(band.categoryPwdRank, locale, t.result.range),
          },
        ]
      : []),
  ];
  const boh = band.exam === "boh";
  return (
    <div className="mt-4 flex flex-col gap-5">
      <p className="text-xs font-semibold text-muted">
        {/* D-032: sample tables never read as official data. */}
        {format(band.sample ? t.result.basedOnSample : t.result.basedOn, { exam: t.form.exams[band.exam], year: band.year })}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {ranks.map((rank, index) => (
          <div
            key={rank.label}
            className={cn("rounded-control p-3", index === 0 ? "bg-navy text-white sm:col-span-2" : "bg-surface text-navy")}
            data-surface={index === 0 ? "dark" : undefined}
          >
            <dt className={cn("text-xs font-bold", index === 0 ? "text-[#d3e1f3]" : "text-muted")}>{rank.label}</dt>
            <dd className={cn("font-extrabold", index === 0 ? "text-[clamp(1.6rem,5vw,2.2rem)] text-gold" : "text-xl")}>{rank.value}</dd>
          </div>
        ))}
        <div className="rounded-control bg-surface p-3 text-navy">
          <dt className="text-xs font-bold text-muted">{percentileTemplate}</dt>
          <dd className="text-xl font-extrabold">{formatPercentileRange(band.percentile, locale, t.result.range)}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted">{t.result.bandNote}</p>
      {table && (
        <div>
          <AskRanchoLink
            href={localePath("/tools/ask", locale)}
            detail={predictorRanchoDetail(band, table, locale, {
              exams: t.form.exams,
              crl: t.result.crl,
              range: t.result.range,
              rangeScore: t.share.rangeScore,
              rangePercentile: t.share.rangePercentile,
              askRanchoPrompt: t.result.askRanchoPrompt,
              askRanchoContext: t.result.askRanchoContext,
              askRanchoSample: t.result.askRanchoSample,
            })}
          >
            {t.result.askRancho}
          </AskRanchoLink>
        </div>
      )}

      <div>
        <h3 className="text-lg font-extrabold text-navy">{boh ? t.result.optionsTitleBoh : t.result.optionsTitle}</h3>
        {result.cutoffs ? (
          <>
            <p className="mt-1 mb-4 text-sm text-muted">
              {result.cutoffs.sample
                ? t.result.optionsLeadSample
                : format(t.result.optionsLead, { counselling: result.cutoffs.counselling, year: result.cutoffs.year })}
            </p>
            {result.options.length > 0 ? (
              <OptionList options={result.options} locale={locale} sample={sample} messages={t.result} />
            ) : (
              <p className="text-sm text-muted">{t.result.noOptions}</p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">{t.result.noCutoffs}</p>
        )}
      </div>

      {/* "Talk to a counsellor" = the enquiry form (D-039): the link carries only the exam + score band, which
          the form discloses. Contact details before results come from the lead gate (D-043, PredictorApp). */}
      <div className="flex flex-col gap-3 rounded-control bg-gold-soft p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-[#5c4a12]">{t.result.ctaText}</p>
        <ButtonLink href={predictorEnquiryHref(result, table, locale)} size="sm" className="shrink-0">
          {t.result.ctaButton}
        </ButtonLink>
      </div>
    </div>
  );
}
