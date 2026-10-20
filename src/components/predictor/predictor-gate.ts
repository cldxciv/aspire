import { predictorBand } from "@/components/forms/enquiry-context";
import { bucketRange, shareBucketFor, type CollegeMatchPrediction, type ExamScoreTable, type PredictorExam } from "@/lib/predictor/engine";

/**
 * The predictor's lead gate (docs/lead-gate-plan.md §8.1, D-043), as pure logic so it is testable
 * without a DOM. Client-safe; no React.
 *
 * Flow: the visitor's input is validated FIRST (critique 1.10); only an `ok` outcome asks the gate.
 * Owner decision (21 Oct 2026, "on now, with an honest note"): sample tables do NOT skip the gate —
 * the form itself says plainly that results use sample data. Once a result is shown on the page,
 * live edits and the what-if slider are never re-gated; "Not you?" hides it again, and an explicit
 * submit asks again whenever the browser's pass is gone (also when it was forgotten elsewhere).
 */

export type PredictorGatePhase =
  /** Nothing asked yet (or forgotten): the result area shows its empty text. */
  | "idle"
  /** An ok submit is waiting for `requestAccess()` (pending label on the submit button). */
  | "checking"
  /** The contact form is shown in the result area. */
  | "gated"
  /** The result is visible and stays live. */
  | "shown";

export interface PredictorGateState {
  phase: PredictorGatePhase;
  /** A result was shown on this page at least once: keeps the "Not you?" line (and its status) mounted. */
  everShown: boolean;
}

export const INITIAL_PREDICTOR_GATE: PredictorGateState = Object.freeze({ phase: "idle", everShown: false });

export type PredictorGateEvent =
  /** Explicit submit whose input the engine refused (the field error shows; nothing is asked). */
  | { type: "submit-invalid" }
  /**
   * Explicit submit with an ok outcome. `storeOpen`: the page's lead-gate store is open right now.
   * It can close without this page knowing (another tab's "Not you?", a stale pass answered
   * `no_pass`, Rancho's gate 401), and then the next submit asks again (plan §1.4 / §11.1).
   */
  | { type: "submit-ok"; storeOpen: boolean }
  /** `requestAccess()` answered (true also when the gate fails open: offline, 429, 5xx, no answer). */
  | { type: "access"; allowed: boolean }
  /** The store opened while this host waited (its own form, a skip, another host or tab). */
  | { type: "unlocked" }
  /** "Not you?" / "Stop Aspire contacting me" on this page's identity line. */
  | { type: "forgotten" };

/**
 * - `request`: call `gate.requestAccess()` and feed the answer back as an `access` event.
 * - `reveal`: show the result (focus its heading after a user action) and note one use.
 * - `hide`: "Not you?" hid the result and its own button: move focus to the result heading.
 */
export type PredictorGateEffect = "none" | "request" | "reveal" | "hide";

export function predictorGateStep(
  state: PredictorGateState,
  event: PredictorGateEvent,
): { state: PredictorGateState; effect: PredictorGateEffect } {
  const stay = { state, effect: "none" as const };
  const reveal = { state: { phase: "shown" as const, everShown: true }, effect: "reveal" as const };
  switch (event.type) {
    case "submit-invalid":
      // The engine's field error explains it; an open contact form keeps what was typed.
      return stay;
    case "submit-ok":
      if (state.phase === "checking") return stay; // double submit while the first one is asking
      // Already unlocked on this page and the browser still is: no second ask. If the store closed
      // meanwhile (forgotten elsewhere), the result hides and the gate is asked again.
      if (state.phase === "shown" && event.storeOpen) return reveal;
      return { state: { ...state, phase: "checking" }, effect: "request" };
    case "access":
      if (state.phase !== "checking") return stay; // stale answer (e.g. forgotten meanwhile)
      return event.allowed ? reveal : { state: { ...state, phase: "gated" }, effect: "none" };
    case "unlocked":
      return state.phase === "gated" || state.phase === "checking" ? reveal : stay;
    case "forgotten":
      // The identity line's button is gone either way, so focus always moves.
      return { state: state.phase === "idle" ? state : { ...state, phase: "idle" }, effect: "hide" };
    default:
      return stay;
  }
}

/** What the controller needs from its page (PredictorApp) or a test. */
export interface PredictorGateHost {
  /** `gate.requestAccess()`: true → show the result now; false → the contact form is open. */
  requestAccess(): Promise<boolean>;
  /** The lead-gate store is open right now (`status === "open"`). */
  storeOpen(): boolean;
  /**
   * The exam + band of the live outcome as last rendered (the input may have been edited while the
   * contact form was open), or null when it gives no result. The controller then falls back to the
   * last ok submit (e.g. the very first submit, before it has rendered).
   */
  summary(): PredictorSummary | null;
  /** `gate.recordUse(...)` (the store sends it only with a pass that records use). */
  recordUse(summary: PredictorSummary): void;
  /** Keyboard focus is inside the result section (e.g. in the contact form that is about to go). */
  focusInResult(): boolean;
  /** Move focus to the result heading once the new state has rendered. */
  focusResult(): void;
  /** Render the new state. */
  render(state: PredictorGateState): void;
}

/**
 * Runs the steps above and their effects; PredictorApp and the tests share it (no React here).
 * Focus moves to the result heading after this page's own action (submit, its form, "Not you?"),
 * and after an unlock from elsewhere only when focus was in the contact form that just closed.
 */
export class PredictorGateController {
  private current: PredictorGateState = INITIAL_PREDICTOR_GATE;
  private host: PredictorGateHost | null = null;
  private submitted: PredictorSummary | null = null;

  /** (Re)binds the host; PredictorApp calls it after every render so the callbacks see current values. */
  connect(host: PredictorGateHost): void {
    this.host = host;
  }

  get state(): PredictorGateState {
    return this.current;
  }

  /** An explicit submit whose outcome is ok; `summary` = that outcome's exam + band. */
  submitOk(summary: PredictorSummary): void {
    this.submitted = summary;
    this.apply({ type: "submit-ok", storeOpen: this.host?.storeOpen() ?? false }, true);
  }

  submitInvalid(): void {
    this.apply({ type: "submit-invalid" }, true);
  }

  /** useLeadGate's `onUnlocked`. */
  unlocked(byThisHost: boolean): void {
    this.apply({ type: "unlocked" }, byThisHost);
  }

  /** LeadGateIdentity's `onForgotten`. */
  forgotten(): void {
    this.apply({ type: "forgotten" }, true);
  }

  private apply(event: PredictorGateEvent, userAction: boolean): void {
    const host = this.host;
    if (!host) return;
    // Read before the new state renders: the contact form may be about to unmount.
    const focusWasInResult = host.focusInResult();
    const { state, effect } = predictorGateStep(this.current, event);
    this.current = state;
    host.render(state);
    if (effect === "request") {
      void host.requestAccess().then(
        (allowed) => this.apply({ type: "access", allowed }, userAction),
        () => this.apply({ type: "access", allowed: true }, userAction), // fail open, as useLeadGate does
      );
    } else if (effect === "reveal") {
      // One note per explicit submit with an ok result (merged per day on the server; only with a
      // recording pass). Live edits and the what-if slider are not re-gated or re-noted.
      // What is shown is the LIVE outcome, so the note carries its band, not the one submitted.
      const usage = host.summary() ?? this.submitted;
      if (usage) host.recordUse(usage);
      if (userAction || focusWasInResult) host.focusResult();
    } else if (effect === "hide") {
      host.focusResult();
    }
  }
}

/** The exam and score band of one result (the gate's attribution, the usage note, the counsellor link). */
export interface PredictorSummary {
  exam: PredictorExam;
  /** "score-180-189" / "percentile-98-99"; absent when the band can't be expressed. */
  band?: string;
}

/**
 * What the lead keeps about one predictor result: the exam and the score/percentile band of the
 * share card (e.g. "score-180-189") — never the exact value, category, PwD, home state or gender.
 * Same band as the counsellor link and the share card. No table → exam only.
 */
export function predictorSummary(result: CollegeMatchPrediction, table: ExamScoreTable | undefined): PredictorSummary {
  const exam = result.band.exam;
  if (!table) return { exam };
  const bucket = shareBucketFor(result.band.input, table);
  const range = bucketRange(bucket, table);
  const band = predictorBand(bucket.mode, Math.floor(range.low), Math.floor(range.high));
  return band ? { exam, band } : { exam };
}
