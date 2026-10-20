"use client";

import { Calculator } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, ButtonLink } from "@/components/ui";
import { useLocale } from "@/i18n/client";
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
 * Nothing the student enters leaves the browser; the share card URL carries only exam + bucket.
 */
export function PredictorApp({
  data,
  messages,
  pageUrl,
}: {
  data: PredictorData | null;
  messages: PredictorAppMessages;
  /** Absolute URL of this page in the current locale (for share text). */
  pageUrl: string;
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
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const valueInput = useRef<HTMLInputElement>(null);

  const table = exam ? scoreTableFor(exam, data) : undefined;
  const supports = table?.supports;
  const effectiveMode: InputMode = supports?.percentile ? mode : "score";
  const range = table ? valueRange(table, effectiveMode) : { low: 0, high: 0 };

  const input: PredictorInputLike | null = exam
    ? { exam, mode: effectiveMode, value: parseValue(value), category, pwd, homeState, gender }
    : null;
  // Live after the first submit: every change re-runs the engine (cheap, pure, in the browser).
  const outcome = submitted && input ? matchColleges(input, data) : null;
  const result: CollegeMatchPrediction | null = outcome?.status === "ok" ? outcome : null;
  const valueError =
    outcome?.status === "invalid" && outcome.issues.some((issue) => issue.field === "value")
      ? format(t.form.errorValue, { min: formatNumber(range.low, locale), max: formatNumber(range.high, locale) })
      : undefined;

  if (!exam || !table || !supports) return null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!input) return;
    const check = matchColleges(input, data);
    if (check.status === "ok") {
      // Let the results render, then move focus to them (screen readers and small screens).
      requestAnimationFrame(() => resultHeading.current?.focus());
    } else {
      valueInput.current?.focus();
    }
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

        <Button type="submit" className="w-full sm:w-auto sm:self-start">
          <Calculator aria-hidden="true" className="size-4" />
          {t.form.submit}
        </Button>
      </form>

      <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
        <section aria-labelledby={`${ids}-result-title`} className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-6">
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
          <div role="status" aria-live="polite" className="sr-only">
            {result
              ? `${t.result.crl[result.band.exam]}: ${formatRankRange(result.band.crl, locale, t.result.range)}. ${format(t.whatIf.counts, {
                  likely: result.options.filter((o) => o.tag === "likely").length,
                  borderline: result.options.filter((o) => o.tag === "borderline").length,
                  reach: result.options.filter((o) => o.tag === "reach").length,
                })}`
              : ""}
          </div>
          {result ? <ResultBody result={result} messages={t} sample={sample} /> : <p className="mt-3 text-sm text-muted">{t.result.empty}</p>}
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

/** Exported for tests. */
export function ResultBody({ result, messages: t, sample }: { result: CollegeMatchPrediction; messages: PredictorAppMessages; sample: boolean }) {
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

      {/* Lead capture = the existing enquiry form (D-033); nothing about the prediction is sent. */}
      <div className="flex flex-col gap-3 rounded-control bg-gold-soft p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-[#5c4a12]">{t.result.ctaText}</p>
        <ButtonLink href={localePath("/admissions#enquiry", locale)} size="sm" className="shrink-0">
          {t.result.ctaButton}
        </ButtonLink>
      </div>
    </div>
  );
}
