"use client";

import { CalendarCheck, CalendarDays, LoaderCircle, LockKeyhole, PencilLine } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode, type Ref } from "react";
import { LeadGateForm } from "@/components/lead-gate/LeadGateForm";
import { LeadGateIdentity } from "@/components/lead-gate/LeadGateIdentity";
import { LeadGateNote } from "@/components/lead-gate/LeadGateNote";
import { useLeadGate } from "@/components/lead-gate/use-lead-gate";
import { Button } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { addDays, istDateKey, type DateKey } from "@/lib/planner/dates";
import { PLAN_LIMITS } from "@/lib/planner/plan";
import { EXAM_IDS, type ExamId } from "@/lib/planner/types";
import {
  countdownGateStep,
  countdownRanchoDetail,
  countdownShowsDays,
  countdownSlot,
  examCountdown,
  msUntilNextIstMidnight,
  revealCountdown,
  splitTemplate,
  toolGateLayout,
  type CountdownGateEffect,
  type ExamCountdown,
} from "./home-tools";
import { AskRanchoLink } from "./HomeToolsAskRancho";
import { controlClass, controlErrorClass, labelClass, OUTLINE_EDGE, SelectField, ToolPanel, ToolStage } from "./HomeToolsPanel";

const SUBMIT_LAYOUT = "w-full aria-disabled:cursor-wait aria-disabled:opacity-70 @min-[22rem]:w-auto";

/** Strings from `planner` (form, exams, today), `predictor.form.checking` and `home.tools.planner`, picked on the server. */
export interface HomeToolsPlannerMessages {
  exam: string;
  exams: Record<ExamId, string>;
  examDate: string;
  prompt: string;
  daysLeft: string;
  today: string;
  tomorrow: string;
  past: string;
  tooFar: string;
  /** "Show days left". */
  submit: string;
  /** Submit label while the lead gate is asked (predictor.form.checking). */
  pending: string;
  /** "Show days left" pressed without a date. */
  dateMissing: string;
  /** A valid date is chosen but the countdown is not shown yet ({button}: the submit label). */
  pressToShow: string;
  /** Recap above the contact form ({exam}). */
  ready: string;
  /** The recap's button: closes the form, focus back to the date field. */
  change: string;
  askRancho: string;
  askRanchoPrompt: string;
  askRanchoContext: string;
}

/**
 * Tells React to re-read "today" at the next IST midnight (then re-arms), and when the tab is
 * shown again (background tabs may delay timers), so an idle page rolls the countdown and the
 * date input's min / max over to the new day. Snapshots are strings, so a re-read that finds the
 * same day does not re-render.
 */
function subscribeToday(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    timer = setTimeout(() => {
      onChange();
      arm();
    }, msUntilNextIstMidnight(Date.now()));
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") onChange();
  };
  arm();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
/** Today in India time, read in the browser only (never during the server render, CLAUDE.md). */
const browserToday = (): DateKey => istDateKey(Date.now());
const serverToday = (): DateKey | null => null;

/**
 * Exam countdown for the homepage tools card: exam + date → "N days to go", computed in the
 * browser with the planner's IST date helpers. The inputs have no `name`, so nothing typed can
 * reach a URL. Renders its own ToolPanel; `head`, `exits` and `extras` (what the full planner
 * does) come from the server.
 *
 * Lead gate (owner update, 22 Oct 2026): the countdown is gated like the predictor. "Show days
 * left" is the only way to ask for it (picking a date never opens the form, WCAG 3.2.2); the date
 * is validated first (missing, past or too far → a notice, never the form); a valid date asks
 * `useLeadGate({ tool: "planner", usageKey: "countdown" })`, and while the browser has not shared
 * contact details the stage shows a recap and <LeadGateForm> (its button reads "Show my
 * countdown"). Once revealed the countdown follows the inputs live, never re-gated. One tool-use
 * note per press that ends in days, and one on unlock: the exam only (the hook adds the tool and
 * the "countdown" key), never the date or the days. Signed-in students and parents skip the form
 * only with a mobile number on their account (the server decides). Steps: `countdownGateStep`.
 */
export function HomeToolsPlanner({
  locale,
  messages: t,
  gateMessages,
  head,
  exits,
  extras,
}: {
  locale: Locale;
  messages: HomeToolsPlannerMessages;
  /** The `leadGate` namespace, picked on the server. */
  gateMessages: Messages<"leadGate">;
  /** Server-built PanelHead. */
  head: ReactNode;
  /** Server-built exit links (and the planner's sample / unavailable tag). */
  exits: ReactNode;
  /** Server-built "What the planner does" list, at the foot of the stage while no form shows. */
  extras: ReactNode;
}) {
  const ids = useId();
  const today = useSyncExternalStore(subscribeToday, browserToday, serverToday);
  const [exam, setExam] = useState<ExamId>(EXAM_IDS[0]);
  const [examDate, setExamDate] = useState("");
  /** "Show days left" was pressed at least once. */
  const [submitted, setSubmitted] = useState(false);
  /** The gate let this host show the countdown; false again after "Not you?". */
  const [revealed, setRevealed] = useState(false);
  /** "Not you?" was used: keeps its confirmation line in place. */
  const [forgotten, setForgotten] = useState(false);
  /** Remounts the identity line after a new unlock, so an old "forgotten" message never lingers. */
  const [identityKey, setIdentityKey] = useState(0);
  /** The gate's status request is in flight (first press on this page). */
  const [pending, setPending] = useState(false);
  /** Bumped to guarantee a render after which `focusTarget` is applied. */
  const [, setFocusTick] = useState(0);
  const asking = useRef(false);
  /** Where focus goes after the next render (the field may be display:none until then). */
  const focusTarget = useRef<"result" | "input" | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  /** The countdown box: where focus goes after this host's own form unlocks. */
  const resultRef = useRef<HTMLParagraphElement>(null);

  const countdown = examCountdown(examDate, today);
  const examLabel = t.exams[exam];

  const gate = useLeadGate({
    tool: "planner",
    usageKey: "countdown",
    // The form (or another tool on this page / another tab) unlocked: the countdown for the current inputs.
    onUnlocked: ({ byThisHost }) => apply(countdownGateStep({ kind: "unlocked", byThisHost }, examCountdown(examDate, today), exam)),
  });

  function focusAfterRender(target: "result" | "input") {
    focusTarget.current = target;
    setFocusTick((tick) => tick + 1);
  }

  /** Runs one gate step: show the countdown, note the use (exam only; sent only for a pass that records use), move focus. */
  function apply(effect: CountdownGateEffect) {
    if (effect.reveal) reveal();
    if (effect.note) gate.recordUse(effect.note);
    if (effect.focus === "result") focusAfterRender("result");
    if (effect.focus === "date") focusAfterRender("input");
  }

  function reveal() {
    setRevealed(true);
    if (forgotten) {
      setForgotten(false);
      setIdentityKey((key) => key + 1);
    }
  }

  /** The recap's "Change exam or date": close the form (what was typed in it is dropped) and edit the date. */
  function change() {
    gate.closeGate();
    focusAfterRender("input");
  }

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    (target === "result" ? (resultRef.current ?? dateInput.current) : dateInput.current)?.focus();
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); // synchronously, before any await
    setSubmitted(true);
    if (asking.current) return;
    const current = examCountdown(examDate, today);
    if (!countdownShowsDays(current)) {
      // Validated first: a missing, past or too-far date never asks for contact details.
      apply(countdownGateStep({ kind: "submit", decision: "invalid" }, current, exam));
      return;
    }
    asking.current = true;
    // Only a real status request is worth a label (an open or locked gate answers at once).
    const checking = gate.status === "unknown" || gate.status === "checking";
    if (checking) setPending(true);
    const decision = await revealCountdown(current, gate.requestAccess);
    asking.current = false;
    if (checking) setPending(false);
    // "gated": the contact form now takes the stage; `onUnlocked` finishes the step.
    apply(countdownGateStep({ kind: "submit", decision }, current, exam));
  }

  const slot = countdownSlot({ countdown, submitted, revealed, gateOpen: gate.gateOpen });
  const layout = toolGateLayout(slot);
  // Worked out apart from the slot: from `md` the date stays editable while the contact form shows,
  // and a date made invalid there still needs its error (the "invalid" slot never comes up then).
  const invalid = submitted && !countdownShowsDays(countdown);
  const liveId = `${ids}-countdown`;
  const ranchoDetail = slot === "result" ? countdownRanchoDetail(countdown, examLabel, t) : null;

  const controls = (
    <>
      <form onSubmit={onSubmit} noValidate className="grid gap-3 @min-[20rem]:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${ids}-exam`} className={labelClass}>
            {t.exam}
          </label>
          <SelectField id={`${ids}-exam`} value={exam} onChange={(event) => setExam(event.target.value as ExamId)}>
            {EXAM_IDS.map((option) => (
              <option key={option} value={option}>
                {t.exams[option]}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-date`} className={labelClass}>
            {t.examDate}
          </label>
          <input
            ref={dateInput}
            id={`${ids}-date`}
            type="date"
            autoComplete="off"
            min={today ?? undefined}
            max={today ? addDays(today, PLAN_LIMITS.maxDays) : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? liveId : undefined}
            value={examDate}
            onChange={(event) => setExamDate(event.target.value)}
            className={invalid ? controlErrorClass : controlClass}
          />
        </div>
        <div className="@min-[20rem]:col-span-2">
          <Button
            type="submit"
            variant={layout.submitVariant}
            aria-disabled={pending || undefined}
            className={layout.submitVariant === "outline" ? `${SUBMIT_LAYOUT} ${OUTLINE_EDGE}` : SUBMIT_LAYOUT}
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <CalendarCheck aria-hidden="true" className="size-4" />
            )}
            {pending ? t.pending : t.submit}
          </Button>
        </div>
      </form>
      {/* Up-front disclosure from the live gate mode; the form's own lead says it while the form shows. */}
      {layout.note && <LeadGateNote messages={gateMessages} className="mt-3" />}
    </>
  );

  const changeButton = (className: string) => (
    <Button variant="outline" className={`${className} ${OUTLINE_EDGE}`} onClick={change}>
      <PencilLine aria-hidden="true" className="size-4" />
      {t.change}
    </Button>
  );

  const stage = (
    <ToolStage tone={layout.stageTone}>
      {slot === "empty" && (
        // A calendar page (decorative), outside the live region.
        <div aria-hidden="true" className="mx-auto w-28 rounded-xl bg-white shadow-soft ring-1 ring-[#d3e2f5]">
          <div className="flex h-6 items-center justify-center gap-6 rounded-t-xl bg-navy">
            <span className="size-1.5 rounded-full bg-gold" />
            <span className="size-1.5 rounded-full bg-gold" />
          </div>
          <div className="grid h-20 place-items-center">
            <CalendarDays className="size-9 text-blue" strokeWidth={1.6} />
          </div>
        </div>
      )}
      {/* Always mounted; never holds the form. While the form shows it carries only a date error. */}
      <div id={liveId} aria-live="polite" aria-atomic="true">
        {slot === "empty" &&
          (countdownShowsDays(countdown) ? (
            // A date is chosen (or kept after "Change" / "Not you?"): point to the button, not the date.
            <p className={PROMPT_CLASS}>{format(t.pressToShow, { button: t.submit })}</p>
          ) : (
            <CountdownView countdown={{ kind: "empty" }} exam={examLabel} messages={t} />
          ))}
        {(slot === "invalid" || (slot === "gate" && invalid)) && <CountdownView countdown={countdown} exam={examLabel} messages={t} submitted />}
        {slot === "result" && <CountdownView countdown={countdown} exam={examLabel} messages={t} resultRef={resultRef} />}
      </div>
      {slot === "gate" && (
        <>
          {invalid ? (
            // The date stopped giving days while the form was open: keep a way back to it.
            changeButton("mt-3 w-full sm:w-auto sm:self-start")
          ) : (
            // Local values only; not a live region (the form's heading takes focus).
            <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface p-3 sm:p-4">
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-gold">
                <LockKeyhole className="size-4" />
              </span>
              <p className="min-w-0 flex-1 basis-48 text-sm leading-snug font-semibold text-navy">{format(t.ready, { exam: examLabel })}</p>
              {changeButton("w-full sm:w-auto")}
            </div>
          )}
          {/* Its own <form>, outside the inputs; never inside the live region. */}
          <LeadGateForm {...gate.formProps} messages={gateMessages} variant="panel" headingLevel={3} className="mt-3" />
        </>
      )}
      {ranchoDetail && (
        // The exam and the days left only (home-tools.ts countdownRanchoDetail).
        <AskRanchoLink href={localePath("/tools/ask", locale)} detail={ranchoDetail} size="md" variant="light" className="mt-3 self-start">
          {t.askRancho}
        </AskRanchoLink>
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
            focusAfterRender("input");
          }}
        />
      )}
      {/* "What the planner does": fills the stage's tall column from `md` (hidden while the form shows). */}
      {layout.extras && extras}
    </ToolStage>
  );

  return <ToolPanel gated={layout.gated} head={head} controls={controls} stage={stage} exits={exits} />;
}

const COUNTDOWN_BOX = "rounded-control bg-navy p-5 text-center text-base font-semibold text-white";
const PROMPT_CLASS = "mt-4 text-center text-sm text-balance text-muted";

/** Exported for tests. `submitted`: "Show days left" was pressed (an empty date then reads "choose a date first"). */
export function CountdownView({
  countdown,
  exam,
  messages: t,
  submitted = false,
  resultRef,
}: {
  countdown: ExamCountdown;
  exam: string;
  messages: Pick<HomeToolsPlannerMessages, "prompt" | "daysLeft" | "today" | "tomorrow" | "past" | "tooFar" | "dateMissing">;
  submitted?: boolean;
  /** Makes the countdown a focus target (tabIndex -1, with the global focus ring). */
  resultRef?: Ref<HTMLParagraphElement>;
}) {
  const tabIndex = resultRef ? -1 : undefined;
  if (countdown.kind === "days") {
    const [before, after] = splitTemplate(t.daysLeft, "days");
    return (
      <p ref={resultRef} tabIndex={tabIndex} data-surface="dark" className={COUNTDOWN_BOX}>
        {format(before, { exam })}
        <span className="block font-serif text-[clamp(2.75rem,7vw,3.75rem)] leading-none font-semibold text-gold">
          {countdown.days.toLocaleString("en-IN")}
        </span>
        {format(after, { exam })}
      </p>
    );
  }
  if (countdown.kind === "today" || countdown.kind === "tomorrow") {
    return (
      <p ref={resultRef} tabIndex={tabIndex} data-surface="dark" className={COUNTDOWN_BOX}>
        {format(countdown.kind === "today" ? t.today : t.tomorrow, { exam })}
      </p>
    );
  }
  if (countdown.kind === "past" || countdown.kind === "tooFar" || submitted) {
    return (
      <p className="rounded-control border border-[#f2dfa0] bg-gold-soft p-4 text-sm font-semibold text-[#5c4a12]">
        {countdown.kind === "past" ? t.past : countdown.kind === "tooFar" ? t.tooFar : t.dateMissing}
      </p>
    );
  }
  return <p className={PROMPT_CLASS}>{t.prompt}</p>;
}
