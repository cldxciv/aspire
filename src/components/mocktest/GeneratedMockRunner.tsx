"use client";

import { Clock, Delete, ListOrdered, X } from "lucide-react";
import { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { RichText } from "@/components/qb/RichText";
import { Badge, Button } from "@/components/ui";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { clearProgress, writeProgress } from "@/lib/mocktest/local-store";
import {
  paletteCounts,
  paletteStatus,
  runnerReducer,
  timeSpentSeconds,
  type RunnerAction,
  type RunnerState,
} from "@/lib/mocktest/runner-state";
import type { Answer } from "@/lib/mocktest/scoring";
import { formatClock, remainingMs, shouldAutoSubmit } from "@/lib/mocktest/timer";
import type { Bilingual, QbPaperView, QbServedQuestion, QbServedSection } from "@/lib/qb/types";
import { OPTION_LETTERS, signed, type MocktestMessages } from "./format";
import { SubmitDialog } from "./MockTestRunner";
import {
  applyKeypadKey,
  filterNumericTyping,
  keypadKeys,
  numericAnswerValue,
  numericInputIssue,
  optionChosen,
  paperTimeWarning,
  passageRange,
  questionLanguage,
  sectionOf,
  toggleOption,
  type KeypadKey,
  type NumericFormat,
} from "./paper-model";
import { addPaperAttempt, initialPaperState, paperProgressId, type ActivePaper, type PaperLocalAttempt } from "./paper-store";
import { PaletteLegend, QuestionPalette } from "./QuestionPalette";

type Lang = "en" | "hi";
type Action = RunnerAction;
type Step =
  | { type: "answer"; value: Answer }
  | { type: "clear" }
  | { type: "goto"; index: number }
  | { type: "previous" }
  | { type: "saveNext" }
  | { type: "markNext" };

/** Timestamp of a user action (event handlers only). */
function eventTime(): number {
  return Date.now();
}

/** Text in the language asked for, falling back to English when that version is empty. */
function textIn(text: Bilingual, lang: Lang): string {
  return lang === "hi" && text.hi.trim() !== "" ? text.hi : text.en;
}

/**
 * The CBT screen of one generated paper part (QB-MOCKTEST-UI, docs/question-bank-plan.md §B12,
 * §B14 package 5). It takes over the viewport like the fixed tests' runner and keeps their NTA
 * conventions (palette, Save & Next, Mark for Review, Clear Response), plus what generated papers
 * need: section instructions with their marking, paragraphs, figures and math (`RichText`),
 * one-or-more-correct checkboxes, a signed whole-number keypad (JEE Main Section B) and a
 * two-decimal input (JEE Advanced), a per-question English / Hindi switch with "English prevails",
 * and time warnings at 30, 15, 5 and 1 minutes. Answers are autosaved on this device
 * (`progress.paper-<id>`); the paper itself never contains answers, solutions or sources.
 */
export function GeneratedMockRunner({
  paper,
  active,
  t,
  onSubmitted,
}: {
  paper: QbPaperView;
  active: ActivePaper;
  t: MocktestMessages;
  onSubmitted: (attempt: PaperLocalAttempt) => void;
}) {
  const [runner, dispatch] = useReducer((state: RunnerState, action: Action) => runnerReducer(state, action), null, () =>
    initialPaperState(paper, active, Date.now()),
  );
  const finished = useRef(false);
  const latestSubmitted = useRef(onSubmitted);
  useEffect(() => {
    latestSubmitted.current = onSubmitted;
  });

  // The clock resumes from now (time while the page was closed is not credited to a question).
  useEffect(() => {
    dispatch({ type: "resume", now: Date.now() });
  }, []);

  // Autosave every change of an unfinished paper.
  useEffect(() => {
    if (runner.submittedAt === null) writeProgress(runner);
  }, [runner]);

  // Submitted (by the student or the clock): keep it on this device, then hand over.
  useEffect(() => {
    if (runner.submittedAt === null || finished.current) return;
    finished.current = true;
    const attempt: PaperLocalAttempt = {
      id: runner.attemptId,
      slot: paper.slot,
      testId: paper.testId,
      paperId: paper.id,
      setId: paper.setId,
      part: paper.setPart,
      mode: paper.kind,
      token: active.token,
      language: paper.language,
      answers: runner.answers,
      timeSpentSec: timeSpentSeconds(runner),
      startedAt: runner.startedAt,
      submittedAt: runner.submittedAt,
      submitReason: runner.submitReason ?? "manual",
      questionCount: paper.questions.length,
      maxScore: paper.maxScore,
      durationMinutes: paper.durationMinutes,
      compensatoryMinutes: paper.compensatoryMinutes,
    };
    addPaperAttempt(attempt);
    clearProgress(paperProgressId(paper.id));
    latestSubmitted.current(attempt);
  }, [runner, paper, active.token]);

  return <PaperScreen paper={paper} t={t} runner={runner} dispatch={dispatch} />;
}

function PaperScreen({
  paper,
  t,
  runner,
  dispatch,
}: {
  paper: QbPaperView;
  t: MocktestMessages;
  runner: RunnerState;
  dispatch: (action: Action) => void;
}) {
  const tr = t.runner;
  const tp = t.paper.runner;
  const titleId = useId();
  const [now, setNow] = useState(() => Date.now());
  const [langOverride, setLangOverride] = useState<Record<number, Lang>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastRemaining = useRef(remainingMs(runner.deadline, runner.lastTickAt));

  const current = runner.current;
  const question = paper.questions[current];
  const lang = questionLanguage(question, paper.language, langOverride[current]);
  const remaining = remainingMs(runner.deadline, now);
  const statuses = useMemo(() => runner.answers.map((_, i) => paletteStatus(runner, i)), [runner]);
  const counts = useMemo(() => paletteCounts(runner), [runner]);
  const section = sectionOf(paper.sections, current);
  const submitted = runner.submittedAt !== null;
  const paperLang = paper.language;
  const title = paper.partLabel ? `${textIn(paper.title, paperLang)} · ${textIn(paper.partLabel, paperLang)}` : textIn(paper.title, paperLang);

  // One clock: accrue time to the question on screen, announce warnings, submit at the server's deadline.
  useEffect(() => {
    if (submitted) return;
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      const left = remainingMs(runner.deadline, tick);
      const warning = paperTimeWarning(lastRemaining.current, left);
      lastRemaining.current = left;
      if (warning !== null) setAnnouncement(warning === 1 ? tr.warnOne : format(tp.warnMinutes, { n: warning }));
      if (shouldAutoSubmit(runner, tick)) {
        setAnnouncement(tr.timeUp);
        dispatch({ type: "submit", now: tick, reason: "timeout" });
      } else {
        dispatch({ type: "tick", now: tick });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runner, submitted, dispatch, tr.warnOne, tr.timeUp, tp.warnMinutes]);

  // Distraction-free: the page behind the test screen does not scroll.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Focus the question heading when the screen opens and whenever the question changes.
  useEffect(() => {
    headingRef.current?.focus();
  }, [current]);

  // Only ever called from event handlers (never while rendering).
  const act = (step: Step) => dispatch({ ...step, now: eventTime() } as RunnerAction);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[60] flex flex-col bg-page text-ink" data-paper-runner={paper.id}>
      {/* Top bar: title, timer, submit */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-navy px-3 py-2 text-white sm:px-5">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-bold sm:text-base">
          <span className="sr-only">{format(tr.regionLabel, { title })}</span>
          <span aria-hidden="true">{title}</span>
        </h2>
        {paper.kind === "ranked" && <Badge variant="success">{tp.rankedBadge}</Badge>}
        {paper.short && <Badge variant="info">{tp.shortBadge}</Badge>}
        {paper.sample && <Badge variant="demo">{t.paper.sample}</Badge>}
        <div className="flex items-center gap-2 rounded-control bg-white/10 px-3 py-1.5" role="timer" aria-live="off" aria-label={`${tr.timeLeft} ${formatClock(remaining)}`}>
          <Clock aria-hidden="true" className="size-4 text-gold" />
          <span aria-hidden="true" className="text-xs text-[#d3e1f3]">
            {tr.timeLeft}
          </span>
          <span aria-hidden="true" className={cn("font-mono text-base font-bold tabular-nums", remaining <= 300_000 && "text-gold")}>
            {formatClock(remaining)}
          </span>
        </div>
        <Button onClick={() => setConfirmOpen(true)} disabled={submitted}>
          {tr.submit}
        </Button>
      </div>
      <p className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </p>

      {/* Sections */}
      <nav aria-label={tr.sections} className="border-b border-line bg-white px-3 sm:px-5">
        <ul className="flex gap-1 overflow-x-auto py-1.5">
          {paper.sections.map((s) => {
            const isActive = s.id === section?.id;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => act({ type: "goto", index: s.start })}
                  className={cn("min-h-11 rounded-control px-3 text-sm font-bold", isActive ? "bg-navy text-white" : "text-navy hover:bg-surface")}
                >
                  {textIn(s.label, paperLang)}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="relative flex min-h-0 flex-1">
        {/* Question */}
        <div className="min-w-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            {section && <SectionInstructions key={section.id} section={section} lang={paperLang} t={t} />}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <h3 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold text-navy outline-none">
                {format(tr.questionOf, { n: current + 1, total: paper.questions.length })}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-surface px-2 py-1 font-semibold text-navy">{questionTypeLabel(question, tp)}</span>
                <span className="rounded-md bg-success-soft px-2 py-1 font-bold text-[#14744d]">
                  <span aria-hidden="true">{format(tr.marking, { correct: question.marking.correct, wrong: signed(question.marking.wrong) })}</span>
                  <span className="sr-only">
                    {format(tr.markingLabel, { correct: signed(question.marking.correct), wrong: signed(question.marking.wrong) })}
                  </span>
                </span>
              </div>
            </div>
            {question.marking.partial && <p className="mt-1 text-xs text-muted">{tp.partial}</p>}
            <LanguageSwitch
              question={question}
              index={current}
              lang={lang}
              paperLanguage={paperLang}
              t={t}
              onChange={(value) => setLangOverride((prev) => ({ ...prev, [current]: value }))}
            />
            <QuestionBody key={current} paper={paper} question={question} index={current} lang={lang} answer={runner.answers[current]} t={t} act={act} />
          </div>
        </div>

        {/* Palette: side panel on large screens, slide-over on small ones */}
        <aside
          aria-label={tr.palette}
          className={cn(
            "w-[min(20rem,85vw)] shrink-0 overflow-y-auto border-l border-line bg-white p-4",
            "max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-10 max-lg:shadow-card",
            !paletteOpen && "max-lg:hidden",
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-bold text-navy">{section ? textIn(section.label, paperLang) : ""}</p>
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface lg:hidden"
              onClick={() => setPaletteOpen(false)}
              aria-label={tr.hidePalette}
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          {section && (
            <QuestionPalette
              t={tr}
              statuses={statuses}
              start={section.start}
              count={section.count}
              current={current}
              touch
              onSelect={(index) => {
                act({ type: "goto", index });
                setPaletteOpen(false);
              }}
            />
          )}
          <PaletteLegend t={tr} counts={counts} className="mt-5 border-t border-line pt-4 sm:grid-cols-1" />
        </aside>
      </div>

      {/* Actions (44 px targets) */}
      <div className="border-t border-line bg-white px-3 py-2.5 sm:px-5">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => act({ type: "previous" })} disabled={current === 0}>
            {tr.previous}
          </Button>
          <Button variant="outline" onClick={() => act({ type: "clear" })}>
            {tr.clear}
          </Button>
          <Button variant="light" className="bg-[#efe7fb] text-[#5b2a9e]" onClick={() => act({ type: "markNext" })}>
            {tr.markNext}
          </Button>
          <Button variant="dark" className="ml-auto" onClick={() => act({ type: "saveNext" })}>
            {tr.saveNext}
          </Button>
          <Button variant="outline" className="lg:hidden" aria-expanded={paletteOpen} onClick={() => setPaletteOpen((open) => !open)}>
            <ListOrdered aria-hidden="true" className="size-4" />
            {paletteOpen ? tr.hidePalette : tr.showPalette}
          </Button>
        </div>
      </div>

      <SubmitDialog
        open={confirmOpen}
        t={t}
        counts={counts}
        remaining={remaining}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          dispatch({ type: "submit", now: Date.now(), reason: "manual" });
        }}
      />
    </div>
  );
}

function questionTypeLabel(question: Pick<QbServedQuestion, "type" | "answerFormat">, tp: MocktestMessages["paper"]["runner"]): string {
  if (question.type === "multiple") return tp.typeMultiple;
  if (question.type === "numerical") return question.answerFormat === "integer" ? tp.typeInteger : tp.typeDecimal;
  return tp.typeSingle;
}

/** The section's instructions with its marking (official wording where the pattern quotes it). */
function SectionInstructions({ section, lang, t }: { section: QbServedSection; lang: Lang; t: MocktestMessages }) {
  return (
    <details className="rounded-control border border-line bg-white">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-bold text-blue">
        {t.paper.runner.instructions}: {textIn(section.label, lang)}
      </summary>
      <p className="border-t border-line px-3 py-2 text-sm leading-relaxed" lang={lang === "hi" && section.instructions.hi.trim() ? "hi" : "en"}>
        {textIn(section.instructions, lang)}
      </p>
    </details>
  );
}

/** English / Hindi for this question, with the honest notes (machine Hindi is labelled; English prevails). */
function LanguageSwitch({
  question,
  index,
  lang,
  paperLanguage,
  t,
  onChange,
}: {
  question: QbServedQuestion;
  index: number;
  lang: Lang;
  paperLanguage: Lang;
  t: MocktestMessages;
  onChange: (lang: Lang) => void;
}) {
  const tp = t.paper.runner;
  const id = useId();
  const hindiLabel = question.hiAvailable ? tp.hindi : question.hiMachine && paperLanguage === "en" ? tp.hindiMachine : null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {hindiLabel ? (
        <>
          <label htmlFor={id} className="font-semibold text-muted">
            {tp.language}
          </label>
          <select
            id={id}
            value={lang}
            onChange={(e) => onChange(e.target.value === "hi" ? "hi" : "en")}
            className="min-h-11 rounded-md border border-line bg-white px-2 text-sm text-ink"
            aria-describedby={`${id}-note`}
            data-question={index}
          >
            <option value="en">{tp.english}</option>
            <option value="hi">{hindiLabel}</option>
          </select>
          <span id={`${id}-note`} className="text-xs text-muted">
            {tp.englishPrevails}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted">{tp.noHindi}</span>
      )}
    </div>
  );
}

function QuestionBody({
  paper,
  question,
  index,
  lang,
  answer,
  t,
  act,
}: {
  paper: QbPaperView;
  question: QbServedQuestion;
  index: number;
  lang: Lang;
  answer: Answer | undefined;
  t: MocktestMessages;
  act: (step: Step) => void;
}) {
  const tr = t.runner;
  const tp = t.paper.runner;
  const range = question.passage ? passageRange(paper.questions, question.passage.id) : null;
  const multiple = question.type === "multiple";
  return (
    <div className="mt-4" lang={lang === "hi" ? "hi" : "en"}>
      {question.passage && (
        <section aria-label={range ? format(tp.paragraph, range) : tp.paragraphOnly} className="mb-4 rounded-control border border-[#d7e7fb] bg-[#f5f9ff] p-3">
          <p className="text-sm font-bold text-navy">{range ? format(tp.paragraph, range) : tp.paragraphOnly}</p>
          <RichText text={textIn(question.passage.stem, lang)} figures={question.passage.figures} slot="stem" locale={lang} className="mt-1 leading-relaxed" />
        </section>
      )}
      <RichText text={textIn(question.stem, lang)} figures={question.figures} slot="stem" locale={lang} className="text-[1.05rem] leading-relaxed text-ink" />
      {question.type === "numerical" ? (
        <NumericAnswer
          question={question}
          index={index}
          answer={answer}
          lang={lang}
          t={t}
          onChange={(value) => act(value === null ? { type: "clear" } : { type: "answer", value })}
        />
      ) : (
        <fieldset className="mt-5">
          <legend className="sr-only">{multiple ? format(tp.optionsMultiple, { n: index + 1 }) : format(tr.optionsLegend, { n: index + 1 })}</legend>
          <ul className="space-y-2.5">
            {question.options.map((option, optionIndex) => {
              const checked = optionChosen(answer, optionIndex);
              return (
                <li key={optionIndex}>
                  <label
                    className={cn(
                      "flex min-h-12 cursor-pointer items-start gap-3 rounded-control border bg-white px-3 py-2.5 transition",
                      checked ? "border-blue bg-blue-soft" : "border-line hover:border-[#b9cbe0]",
                    )}
                  >
                    <input
                      type={multiple ? "checkbox" : "radio"}
                      name={`paper-q-${index}`}
                      checked={checked}
                      onChange={() => act(multiple ? { type: "answer", value: toggleOption(answer, optionIndex) } : { type: "answer", value: optionIndex })}
                      className="mt-1 size-5 shrink-0 accent-navy"
                    />
                    <span className="font-bold text-navy" lang="en">
                      ({OPTION_LETTERS[optionIndex] ?? optionIndex + 1})
                    </span>
                    <RichText as="span" text={textIn(option, lang)} figures={question.figures} slot={`option:${optionIndex}`} locale={lang} className="block min-w-0 flex-1" />
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
    </div>
  );
}

/**
 * A numerical answer: a text box (keyboard) plus an on-screen keypad. Whole-number sections accept
 * signed integers only; two-decimal sections at most two decimals. An answer that cannot be sent is
 * never saved (the box says why), so a submission is never refused for a half-typed number.
 */
function NumericAnswer({
  question,
  index,
  answer,
  lang,
  t,
  onChange,
}: {
  question: QbServedQuestion;
  index: number;
  answer: Answer | undefined;
  lang: Lang;
  t: MocktestMessages;
  onChange: (value: string | null) => void;
}) {
  const tp = t.paper.runner;
  const numberFormat: NumericFormat = question.answerFormat === "integer" ? "integer" : "decimal2";
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState(() => (typeof answer === "string" ? answer : typeof answer === "number" ? String(answer) : ""));
  // "Clear Response" empties the saved answer: empty the box too (a half-typed, unsaved draft stays).
  const [seenAnswer, setSeenAnswer] = useState(answer);
  if (answer !== seenAnswer) {
    setSeenAnswer(answer);
    if ((answer === null || answer === undefined) && numericAnswerValue(draft, numberFormat) !== null) setDraft("");
  }
  const issue = numericInputIssue(draft, numberFormat);

  function update(next: string) {
    setDraft(next);
    onChange(numericAnswerValue(next, numberFormat));
  }

  const keyLabel = (key: KeypadKey): { text: string; label?: string } => {
    if (key === "-") return { text: "±", label: tp.keyMinus };
    if (key === ".") return { text: ".", label: tp.keyPoint };
    if (key === "backspace") return { text: "", label: tp.keyBackspace };
    if (key === "clear") return { text: tp.keyClearShort, label: tp.keyClear };
    return { text: key };
  };

  return (
    <div className="mt-5 max-w-sm">
      <label htmlFor={inputId} className="text-sm font-bold text-navy">
        {t.runner.numericalLabel}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={inputId}
          type="text"
          inputMode={numberFormat === "integer" ? "numeric" : "decimal"}
          autoComplete="off"
          spellCheck={false}
          value={draft}
          aria-describedby={hintId}
          aria-invalid={issue ? true : undefined}
          onChange={(e) => update(filterNumericTyping(e.target.value))}
          className="min-h-11 w-full rounded-control border border-line bg-white px-3 text-lg font-semibold tabular-nums"
        />
        {question.unit && <span className="text-sm font-semibold text-muted">{textIn(question.unit, lang)}</span>}
      </div>
      <p id={hintId} className={cn("mt-1.5 text-xs", issue ? "font-semibold text-danger" : "text-muted")} aria-live="polite">
        {issue ? `${tp.issues[issue]} ${tp.notSaved}` : numberFormat === "integer" ? tp.integerHint : tp.decimalHint}
      </p>
      <div role="group" aria-label={format(tp.keypad, { n: index + 1 })} className="mt-3 grid w-full max-w-[16rem] grid-cols-3 gap-2">
        {keypadKeys(numberFormat).map((key) => {
          const { text, label } = keyLabel(key);
          return (
            <button
              key={key}
              type="button"
              aria-label={label}
              onClick={() => update(applyKeypadKey(draft, key, numberFormat))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line bg-white text-base font-bold text-navy hover:border-blue"
            >
              {key === "backspace" ? <Delete aria-hidden="true" className="size-5" /> : <span aria-hidden={label ? true : undefined}>{text}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
