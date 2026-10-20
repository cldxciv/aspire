import type { LeadGateStore } from "@/components/lead-gate/lead-gate-store";
import type { PlannerSettings } from "@/lib/planner/state";
import type { ExamId } from "@/lib/planner/types";

/**
 * The study planner's lead gate (docs/lead-gate-plan.md §8.5). DOM-free, so it is unit-tested
 * (planner-gate.test.ts); PlannerClient wires it to useLeadGate().
 *
 * Gated: ONE action only, a guest building a plan when this browser has none (the first plan, or a
 * new one after "Start over"). The submitted settings are held (`pending`, the latest submit wins)
 * while <LeadGateForm> shows under the plan form; when the gate opens (this form, another tool or
 * another tab) the held plan is built and its exam noted (`recordUse`; the lead-gate store sends it
 * only when this browser's pass records use), unless this browser has a plan by then (another tab
 * built one): that plan is kept. Focus moves to the plan only after this host's own action.
 *
 * Never gated: signed-in students (account mode; a signed-in parent in guest mode is let through by
 * the server, which skips the gate for any session), plan edits and a plan already stored in this
 * browser (data the family already has), and anything while offline (fail-open; nothing noted).
 * Sample data does NOT skip the gate (owner decision, 21 Oct 2026): <LeadGateForm> itself says that
 * results currently use sample data.
 */

export interface PlanGateContext {
  /** The planner store's mode ("account" = a signed-in student synced with the account). */
  mode: "guest" | "account";
  /** This browser already has a plan: the submit is an edit. */
  hasPlan: boolean;
  /** `navigator.onLine` at submit time. */
  online: boolean;
}

export function planNeedsGate({ mode, hasPlan, online }: PlanGateContext): boolean {
  return mode === "guest" && !hasPlan && online;
}

/** `applied`: the plan was built. `gated`: the form is open, the settings are held. `waiting`: an earlier submit is still asking (it builds the latest settings). */
export type PlanSubmitOutcome = "applied" | "gated" | "waiting";

export interface PlannerGateDeps {
  /**
   * Builds the plan from these settings (PlannerClient: plannerStore.update + applySettings).
   * `explicit`: this host's own action built it (the plan form, or the planner's own contact form),
   * so focus may move to the plan. False when another host or tab opened the gate (critique 1.15:
   * never pull focus out of, say, the floating Rancho panel).
   */
  apply: (settings: PlannerSettings, explicit: boolean) => void;
  /** Notes one use: the exam only, never dates, hours, weak topics or progress. */
  recordUse: (exam: ExamId) => void;
  /**
   * This browser has a plan NOW (e.g. built in another tab while this one waited). A held plan is
   * then dropped, never built over it: that plan is data the family already has.
   */
  hasPlan?: () => boolean;
  /** The "may I show the plan?" check is running (PlanForm shows a pending label). */
  onBusyChange?: (busy: boolean) => void;
}

export interface PlannerGate {
  readonly pending: PlannerSettings | null;
  readonly busy: boolean;
  /**
   * The empty-state plan form was submitted (input already validated by PlanForm).
   * `requestAccess` is useLeadGate().requestAccess (wrapped by `planAccess`): true → build now;
   * false → the form opens (useLeadGate's `gateOpen`) and the settings are held. Never throws.
   */
  submit(settings: PlannerSettings, context: PlanGateContext, requestAccess: () => Promise<boolean>): Promise<PlanSubmitOutcome>;
  /**
   * useLeadGate `onUnlocked`: build the held plan (no-op without one, or when this browser has a
   * plan by now). Pass useLeadGate's `byThisHost`. True when a plan was built.
   */
  unlocked(info?: { byThisHost?: boolean }): boolean;
  /** Forget the held settings. */
  cancel(): void;
}

export function createPlannerGate(deps: PlannerGateDeps): PlannerGate {
  let pending: PlannerSettings | null = null;
  let busy = false;

  const setBusy = (next: boolean) => {
    if (busy === next) return;
    busy = next;
    deps.onBusyChange?.(next);
  };

  const create = (explicit: boolean): boolean => {
    const settings = pending;
    if (!settings) return false;
    pending = null;
    if (deps.hasPlan?.()) return false; // another tab made a plan meanwhile: keep it, note nothing
    deps.apply(settings, explicit);
    deps.recordUse(settings.exam);
    return true;
  };

  return {
    get pending() {
      return pending;
    },
    get busy() {
      return busy;
    },
    async submit(settings, context, requestAccess) {
      if (!planNeedsGate(context)) {
        pending = null;
        deps.apply(settings, true); // never gated, never noted
        return "applied";
      }
      pending = settings;
      if (busy) return "waiting";
      setBusy(true);
      let allowed = true;
      try {
        allowed = await requestAccess();
      } catch {
        allowed = true; // browser-only tool: fail open
      } finally {
        setBusy(false);
      }
      if (!allowed) return "gated";
      create(true); // may already have run from `unlocked()` if the store opened meanwhile
      return "applied";
    },
    unlocked: (info) => create(info?.byThisHost === true),
    cancel() {
      pending = null;
    },
  };
}

/**
 * The access check for a new plan. The planner is offline-first: a page that loaded offline, or
 * where the status check failed, holds the lead-gate store open as `unavailable` (fail-open) for
 * the rest of the page. Now that the device is online again, ask the server once more before
 * deciding (it fails open again if it still cannot answer).
 */
export async function planAccess(
  store: Pick<LeadGateStore, "getSnapshot" | "refresh">,
  requestAccess: () => Promise<boolean>,
): Promise<boolean> {
  if (store.getSnapshot().via === "unavailable") {
    try {
      await store.refresh();
    } catch {
      // refresh never throws; fail open below either way
    }
  }
  return requestAccess();
}
