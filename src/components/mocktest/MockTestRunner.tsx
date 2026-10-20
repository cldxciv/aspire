"use client";

import { Clock, ListOrdered, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { LeadGateForm } from "@/components/lead-gate/LeadGateForm";
import { LeadGateNote } from "@/components/lead-gate/LeadGateNote";
import { useLeadGate } from "@/components/lead-gate/use-lead-gate";
import { Badge, Button, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { gateAtStart, startsAfterUnlock } from "@/lib/mocktest/lead-gate";
import {
  addLocalAttempt,
  clearProgress,
  newAttemptId,
  readPreferredLanguage,
  readProgress,
  storageAvailable,
  writePreferredLanguage,
  writeProgress,
} from "@/lib/mocktest/local-store";
import {
  createRunnerState,
  paletteCounts,
  paletteStatus,
  runnerReducer,
  timeSpentSeconds,
  type RunnerAction,
  type RunnerState,
} from "@/lib/mocktest/runner-state";
import { MAX_NUMERIC_LENGTH, parseNumeric } from "@/lib/mocktest/scoring";
import { crossedWarning, formatClock, remainingMs, shouldAutoSubmit } from "@/lib/mocktest/timer";
import type { Answer, AttemptStart, RunnerQuestion, RunnerTest } from "@/lib/mocktest/types";
import { OPTION_LETTERS, signed, type MocktestMessages } from "./format";
import { apiJson, useMounted } from "./hooks";
import { useMocktestLeadGateMessages } from "./lead-gate";
import { PaletteLegend, QuestionPalette } from "./QuestionPalette";

type Lang = "en" | "hi";
type Action = RunnerAction | { type: "load"; state: RunnerState | null };
/** A runner action without its timestamp (added when dispatched). */
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

/** How long Start waits for the server's start token before the test begins without one. */
const START_TIMEOUT_MS = 6000;

/**
 * Asks the server to time this attempt (POST /api/mocktest/start, QA-SEC-M6 M1). Never blocks the
 * test: offline, slow or failing → no token, and the attempt can only be saved as practice.
 */
async function requestStartToken(testId: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), START_TIMEOUT_MS);
  try {
    const response = await apiJson<AttemptStart>("/api/mocktest/start", { body: { testId }, signal: controller.signal });
    return response.ok ? (response.data?.token ?? null) : null;
  } finally {
    window.clearTimeout(timer);
  }
}

function reducer(state: RunnerState | null, action: Action): RunnerState | null {
  if (action.type === "load") return action.state;
  return state ? runnerReducer(state, action) : state;
}

/**
 * CBT runner (client). Renders the start / resume controls under the server-rendered instructions;
 * once started it takes over the viewport (a modal test screen without the site chrome) until the
 * test is submitted, then opens the result page. Progress is autosaved to localStorage.
 *
 * Lead gate (docs/lead-gate-plan.md §8.4): the start screen discloses the contact step from the
 * live mode (<LeadGateNote>). Tests of 60 minutes or more ask for contact details when Start is
 * pressed, BEFORE /api/mocktest/start and the timer (a long test is never held hostage at the
 * end); shorter tests ask on the result page. Resuming an unfinished attempt is never gated.
 * The start step is lead capture and fails OPEN (plan §1.5): /api/mocktest/start is not gated, so
 * if the form cannot be sent (offline, 5xx, 429 from a shared school IP, "paused") the form offers
 * "Start the test without sharing", and /api/mocktest/score asks again at the result.
 */
export function MockTestRunner({ test, t }: { test: RunnerTest; t: MocktestMessages }) {
  const mounted = useMounted();
  if (!mounted) {
    return (
      <p className="text-sm text-muted" role="status">
        {t.instructions.preparing}
      </p>
    );
  }
  return <RunnerClient test={test} t={t} />;
}

function RunnerClient({ test, t }: { test: RunnerTest; t: MocktestMessages }) {
  const locale = useLocale();
  const router = useRouter();
  const total = test.questions.length;
  const [saved] = useState(() => readProgress(test.id, total));
  const [canStore] = useState(() => storageAvailable());
  const [now, setNow] = useState(() => Date.now());
  const [defaultLang, setDefaultLang] = useState<Lang>(() => readPreferredLanguage() ?? locale);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [runner, dispatch] = useReducer(reducer, null);
  const finishing = useRef(false);
  const tGate = useMocktestLeadGateMessages();
  const asksAtStart = gateAtStart(test.durationMinutes);
  // Start was pressed and the contact form opened instead: start once THIS form unlocks.
  const startAfterUnlock = useRef(false);
  // Not `enforced`: a failed send offers to start anyway (fail-open, see above).
  const gate = useLeadGate({
    tool: "mock-test",
    onUnlocked: ({ byThisHost }) => {
      const pending = startAfterUnlock.current;
      startAfterUnlock.current = false;
      // Unlocked by another tool or tab: the form closes and Start works again (no surprise timer).
      if (startsAfterUnlock(pending, byThisHost)) void begin();
    },
  });
  // Focus goes to the reason for asking now, which sits right before the form's own heading.
  const introRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (gate.gateOpen) introRef.current?.focus();
  }, [gate.gateOpen]);

  const savedExpired = saved ? shouldAutoSubmit(saved, now) : false;

  const start = useCallback(
    (state: RunnerState) => {
      writePreferredLanguage(defaultLang);
      dispatch({ type: "load", state });
      dispatch({ type: "resume", now: Date.now() });
    },
    [defaultLang],
  );

  async function startFresh() {
    if (starting) return;
    setStarting(true);
    if (asksAtStart && !(await gate.requestAccess())) {
      // The contact form opens below; nothing is discarded or timed until it is sent.
      startAfterUnlock.current = true;
      setStarting(false);
      return;
    }
    await begin();
  }

  async function begin() {
    setStarting(true);
    clearProgress(test.id);
    const startToken = await requestStartToken(test.id);
    const startedAt = Date.now();
    setStarting(false);
    start(
      createRunnerState({ testId: test.id, attemptId: newAttemptId(), questionCount: total, durationMinutes: test.durationMinutes, now: startedAt, startToken }),
    );
  }

  function submitExpired() {
    if (!saved) return;
    dispatch({ type: "load", state: saved });
    dispatch({ type: "submit", now: Date.now(), reason: "timeout" });
  }

  // Autosave every change of an unfinished attempt.
  useEffect(() => {
    if (runner && runner.submittedAt === null) writeProgress(runner);
  }, [runner]);

  // Finished: keep the attempt on this device and open the result page.
  useEffect(() => {
    if (!runner || runner.submittedAt === null || finishing.current) return;
    finishing.current = true;
    addLocalAttempt({
      id: runner.attemptId,
      testId: test.id,
      answers: runner.answers,
      timeSpentSec: timeSpentSeconds(runner),
      startedAt: runner.startedAt,
      submittedAt: runner.submittedAt,
      submitReason: runner.submitReason ?? "manual",
      startToken: runner.startToken ?? null,
    });
    clearProgress(test.id);
    router.push(localePath(`/tools/mock-tests/${test.id}/result?attempt=${encodeURIComponent(runner.attemptId)}`, locale));
  }, [runner, test.id, router, locale]);

  if (runner) {
    return <TestScreen test={test} t={t} runner={runner} dispatch={dispatch} defaultLang={defaultLang} />;
  }

  const ti = t.instructions;
  // The up-front note follows the live mode; a long test says it asks before the start.
  const noteMessages = asksAtStart
    ? { ...tGate, note: { ...tGate.note, required: t.gate.noteStartRequired, optional: t.gate.noteStartOptional } }
    : tGate;
  // After a failed send the escape starts the test (not "show my result").
  const startFormMessages = { ...tGate, continueWithoutSaving: t.gate.startWithoutSaving };
  return (
    <div className="space-y-5">
      <LeadGateNote messages={noteMessages} />
      {!canStore && <Notice variant="warning">{ti.storageWarning}</Notice>}
      {saved && !savedExpired && (
        <Notice variant="info" title={ti.resumeTitle}>
          <p>{format(ti.resumeBody, { time: formatClock(remainingMs(saved.deadline, now)) })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => start(saved)}>{ti.resume}</Button>
            <Button variant="outline" disabled={starting} onClick={() => { setNow(Date.now()); void startFresh(); }}>
              {starting ? ti.preparing : ti.discard}
            </Button>
          </div>
        </Notice>
      )}
      {saved && savedExpired && (
        <Notice variant="warning" title={ti.resumeTitle}>
          <p>{ti.expiredBody}</p>
          <Button className="mt-3" onClick={submitExpired}>
            {ti.submitExpired}
          </Button>
        </Notice>
      )}
      {!saved && (
        <form
          className="space-y-4 rounded-card border border-line bg-white p-5 shadow-soft"
          onSubmit={(event) => {
            event.preventDefault();
            if (agreed) void startFresh();
          }}
        >
          <fieldset>
            <legend className="text-sm font-bold text-navy">{ti.languageLabel}</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {(["en", "hi"] as const).map((lang) => (
                <label key={lang} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mt-lang"
                    value={lang}
                    checked={defaultLang === lang}
                    onChange={() => setDefaultLang(lang)}
                    className="size-4 accent-navy"
                  />
                  <span lang={lang === "hi" ? "hi" : "en"}>{lang === "hi" ? "हिन्दी" : "English"}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="size-4 accent-navy" />
            {ti.agree}
          </label>
          <Button type="submit" disabled={!agreed || starting || gate.gateOpen} aria-busy={starting || undefined}>
            {starting ? ti.preparing : ti.start}
          </Button>
        </form>
      )}
      {gate.gateOpen && (
        <div className="space-y-3" data-mocktest-gate="start">
          <p ref={introRef} tabIndex={-1} className="text-sm text-muted outline-none">
            {format(t.gate.startIntro, { n: test.durationMinutes })}
          </p>
          {/* Its own form, after the start form (never nested); focus moved to the line above after the click. */}
          <LeadGateForm
            {...gate.formProps}
            messages={startFormMessages}
            variant="compact"
            headingLevel={2}
            submitLabel={t.gate.startSubmit}
            focusOnMount={false}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Test screen

function TestScreen({
  test,
  t,
  runner,
  dispatch,
  defaultLang,
}: {
  test: RunnerTest;
  t: MocktestMessages;
  runner: RunnerState;
  dispatch: (action: Action) => void;
  defaultLang: Lang;
}) {
  const tr = t.runner;
  const titleId = useId();
  const [now, setNow] = useState(() => Date.now());
  const [langOverride, setLangOverride] = useState<Record<number, Lang>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastRemaining = useRef(remainingMs(runner.deadline, runner.lastTickAt));

  const current = runner.current;
  const question = test.questions[current];
  const lang = langOverride[current] ?? defaultLang;
  const remaining = remainingMs(runner.deadline, now);
  const statuses = useMemo(() => runner.answers.map((_, i) => paletteStatus(runner, i)), [runner]);
  const counts = useMemo(() => paletteCounts(runner), [runner]);
  const section = test.sections.find((s) => current >= s.start && current < s.start + s.count) ?? test.sections[0];
  const submitted = runner.submittedAt !== null;

  // One clock: accrue time to the question on screen, announce warnings, auto-submit at zero.
  useEffect(() => {
    if (submitted) return;
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      const left = remainingMs(runner.deadline, tick);
      const warning = crossedWarning(lastRemaining.current, left);
      lastRemaining.current = left;
      if (warning) setAnnouncement(warning === "one" ? tr.warnOne : tr.warnFive);
      if (shouldAutoSubmit(runner, tick)) {
        setAnnouncement(tr.timeUp);
        dispatch({ type: "submit", now: tick, reason: "timeout" });
      } else {
        dispatch({ type: "tick", now: tick });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runner, submitted, dispatch, tr.warnOne, tr.warnFive, tr.timeUp]);

  // Distraction-free: the page behind the test screen does not scroll.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Focus the question heading when the test screen opens and whenever the question changes.
  useEffect(() => {
    headingRef.current?.focus();
  }, [current]);

  // Only ever called from event handlers (never while rendering).
  const act = (step: Step) => dispatch({ ...step, now: eventTime() } as RunnerAction);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[60] flex flex-col bg-page text-ink"
    >
      {/* Top bar: title, timer, submit */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-navy px-3 py-2 text-white sm:px-5">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-bold sm:text-base">
          <span className="sr-only">{format(tr.regionLabel, { title: test.title[defaultLang] })}</span>
          <span aria-hidden="true">{test.title[defaultLang]}</span>
        </h2>
        {test.sample && <Badge variant="demo">{t.common.sample}</Badge>}
        <div className="flex items-center gap-2 rounded-control bg-white/10 px-3 py-1.5" role="timer" aria-live="off">
          <Clock aria-hidden="true" className="size-4 text-gold" />
          <span className="text-xs text-[#d3e1f3]">{tr.timeLeft}</span>
          <span className={cn("font-mono text-base font-bold tabular-nums", remaining <= 300_000 && "text-gold")}>
            {formatClock(remaining)}
          </span>
        </div>
        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={submitted}>
          {tr.submit}
        </Button>
      </div>
      <p className="sr-only" aria-live="assertive">
        {announcement}
      </p>

      {/* Subject tabs */}
      <nav aria-label={tr.sections} className="border-b border-line bg-white px-3 sm:px-5">
        <ul className="flex gap-1 overflow-x-auto py-1.5">
          {test.sections.map((s) => {
            const active = s === section;
            return (
              <li key={s.subject} className="shrink-0">
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => act({ type: "goto", index: s.start })}
                  className={cn(
                    "min-h-10 rounded-control px-3 text-sm font-bold",
                    active ? "bg-navy text-white" : "text-navy hover:bg-surface",
                  )}
                >
                  {s.label[defaultLang]}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold text-navy outline-none">
                {format(tr.questionOf, { n: current + 1, total: test.questions.length })}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-surface px-2 py-1 font-semibold text-navy">
                  {question.type === "numerical" ? tr.numericalType : tr.mcqType}
                </span>
                <span
                  className="rounded-md bg-success-soft px-2 py-1 font-bold text-[#14744d]"
                  title={format(tr.markingLabel, { correct: signed(question.marking.correct), wrong: signed(question.marking.wrong) })}
                >
                  <span aria-hidden="true">{format(tr.marking, { correct: question.marking.correct, wrong: signed(question.marking.wrong) })}</span>
                  <span className="sr-only">
                    {format(tr.markingLabel, { correct: signed(question.marking.correct), wrong: signed(question.marking.wrong) })}
                  </span>
                </span>
                <label className="flex items-center gap-1.5 font-semibold text-muted">
                  {tr.viewIn}
                  <select
                    value={lang}
                    onChange={(e) => setLangOverride((prev) => ({ ...prev, [current]: e.target.value as Lang }))}
                    className="min-h-9 rounded-md border border-line bg-white px-2 text-sm text-ink"
                  >
                    <option value="en">English</option>
                    <option value="hi">हिन्दी</option>
                  </select>
                </label>
              </div>
            </div>

            <QuestionBody key={current} question={question} index={current} lang={lang} runner={runner} t={tr} act={act} />
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
          <div className="mb-3 flex items-center justify-between">
            <p className="font-bold text-navy">{section.label[defaultLang]}</p>
            <button
              type="button"
              className="rounded-md p-2 text-muted hover:bg-surface lg:hidden"
              onClick={() => setPaletteOpen(false)}
              aria-label={tr.hidePalette}
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <QuestionPalette
            t={tr}
            statuses={statuses}
            start={section.start}
            count={section.count}
            current={current}
            onSelect={(index) => {
              act({ type: "goto", index });
              setPaletteOpen(false);
            }}
          />
          <PaletteLegend t={tr} counts={counts} className="mt-5 border-t border-line pt-4 sm:grid-cols-1" />
        </aside>
      </div>

      {/* Actions */}
      <div className="border-t border-line bg-white px-3 py-2.5 sm:px-5">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => act({ type: "previous" })} disabled={current === 0}>
            {tr.previous}
          </Button>
          <Button size="sm" variant="outline" onClick={() => act({ type: "clear" })}>
            {tr.clear}
          </Button>
          <Button size="sm" variant="light" className="bg-[#efe7fb] text-[#5b2a9e]" onClick={() => act({ type: "markNext" })}>
            {tr.markNext}
          </Button>
          <Button size="sm" variant="dark" className="ml-auto" onClick={() => act({ type: "saveNext" })}>
            {tr.saveNext}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="lg:hidden"
            aria-expanded={paletteOpen}
            onClick={() => setPaletteOpen((open) => !open)}
          >
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

function QuestionBody({
  question,
  index,
  lang,
  runner,
  t,
  act,
}: {
  question: RunnerQuestion;
  index: number;
  lang: Lang;
  runner: RunnerState;
  t: MocktestMessages["runner"];
  act: (step: Step) => void;
}) {
  const answer = runner.answers[index];
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState(() => (typeof answer === "string" ? answer : ""));
  const invalid = draft.trim() !== "" && parseNumeric(draft) === null;

  return (
    <div className="mt-4" lang={lang === "hi" ? "hi" : "en"}>
      <p className="whitespace-pre-line text-[1.05rem] leading-relaxed text-ink">{question.stem[lang]}</p>
      {question.type === "mcq" && question.options ? (
        <fieldset className="mt-5">
          <legend className="sr-only">{format(t.optionsLegend, { n: index + 1 })}</legend>
          <ul className="space-y-2.5">
            {question.options.map((option, optionIndex) => {
              const checked = answer === optionIndex;
              return (
                <li key={optionIndex}>
                  <label
                    className={cn(
                      "flex min-h-12 cursor-pointer items-start gap-3 rounded-control border bg-white px-3 py-2.5 transition",
                      checked ? "border-blue bg-blue-soft" : "border-line hover:border-[#b9cbe0]",
                    )}
                  >
                    <input
                      type="radio"
                      name={`q-${index}`}
                      checked={checked}
                      onChange={() => act({ type: "answer", value: optionIndex })}
                      className="mt-1 size-4 shrink-0 accent-navy"
                    />
                    <span className="font-bold text-navy" lang="en">
                      ({OPTION_LETTERS[optionIndex]})
                    </span>
                    <span className="whitespace-pre-line">{option[lang]}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : (
        <div className="mt-5 max-w-xs">
          <label htmlFor={inputId} className="text-sm font-bold text-navy">
            {t.numericalLabel}
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id={inputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              maxLength={MAX_NUMERIC_LENGTH}
              value={draft}
              aria-describedby={hintId}
              aria-invalid={invalid || undefined}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.+-]/g, "");
                setDraft(value);
                const parsed = parseNumeric(value);
                act({ type: "answer", value: parsed === null ? null : value.trim() });
              }}
              className="min-h-11 w-full rounded-control border border-line bg-white px-3 text-lg font-semibold tabular-nums"
            />
            {question.unit && <span className="text-sm font-semibold text-muted">{question.unit[lang]}</span>}
          </div>
          <p id={hintId} className={cn("mt-1.5 text-xs", invalid ? "font-semibold text-danger" : "text-muted")}>
            {invalid ? t.numericalInvalid : t.numericalHint}
          </p>
        </div>
      )}
    </div>
  );
}

function SubmitDialog({
  open,
  t,
  counts,
  remaining,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  t: MocktestMessages;
  counts: ReturnType<typeof paletteCounts>;
  remaining: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const tr = t.runner;
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-line bg-white p-0 text-ink shadow-card backdrop:bg-navy/60"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-lg font-extrabold text-navy">
          {tr.confirmTitle}
        </h2>
        <p id={bodyId} className="mt-1 text-sm text-muted">
          {tr.confirmBody} {format(tr.confirmTime, { time: formatClock(remaining) })}
        </p>
        <PaletteLegend t={tr} counts={counts} className="mt-4 sm:grid-cols-1" />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onCancel} autoFocus>
            {tr.confirmCancel}
          </Button>
          <Button variant="dark" onClick={onConfirm}>
            {tr.confirmSubmit}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
