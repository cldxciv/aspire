import type { LeadGateForgetData, LeadGateMode, LeadGateUsageData, LeadGateUsageInput, LeadGateVia } from "@/lib/lead-gate/contract";

import {
  fetchLeadGateStatus,
  forgetLeadGate,
  sendLeadGateUsage,
  submitLeadGate,
  type LeadGateStatusOutcome,
  type LeadGateSubmitOutcome,
} from "./lead-gate-client";

/**
 * The lead gate's client state (docs/lead-gate-plan.md §6), one per page: the homepage predictor,
 * planner tab and floating Rancho all read the same store through useLeadGate(), so unlocking in
 * one opens the others. Client-safe; no React here (useSyncExternalStore adapter in use-lead-gate.ts).
 *
 * - `ensure()` answers "may this tool show its result now?" with ONE in-flight status request.
 * - Local hint `aspire.leadgate.v1` = { until, recordsUse, mode }: written only after GET
 *   /api/lead-gate CONFIRMS a pass (so a honeypot / blocked cookie never leaves a false hint),
 *   valid for at most 24 h, no personal data. Removed by sign-out (clearToolStorage) and "Not you?".
 * - Remembered skip `aspire.leadgate.skip.v1` (optional mode, 30 days; critique 0.10).
 * - FAIL-OPEN for browser-only tools (critique 1.5): no answer, 429 or 5xx → open as
 *   `unavailable` (nothing recorded, asked again next page). The enforced tools still get the
 *   server's 401 and call `markRequired()`.
 * - Every transition INTO `open` bumps `unlockSeq` and tells `onUnlock` listeners who caused it.
 * - `sample` mirrors the server's `sample` (the site shows sample data): <LeadGateForm> then says so
 *   plainly. Null until a status answer arrives; it never opens or locks anything. `loadSample()`
 *   retries a failed answer (SAMPLE_RETRY_MS, at most SAMPLE_MAX_REQUESTS per page) so the honest
 *   line is hard to lose on the demo site.
 */

export type LeadGateStatus = "unknown" | "checking" | "open" | "locked";
/** Why results are open on this page: the server's answer, a remembered skip, or fail-open. */
export type LeadGateOpenVia = LeadGateVia | "skipped" | "unavailable";

export interface LeadGateState {
  status: LeadGateStatus;
  mode: LeadGateMode | null;
  via: LeadGateOpenVia | null;
  recordsUse: boolean;
  /** Incremented on every transition into `open`. */
  unlockSeq: number;
  /** Results on this site currently use sample data (GET /api/lead-gate `sample`); null = not known yet. */
  sample: boolean | null;
}

export interface LeadGateUnlockEvent {
  seq: number;
  /** The host (useLeadGate id) whose form / skip caused it, or null (hint, other tab, status answer). */
  by: string | null;
  via: LeadGateOpenVia | null;
}

export const HINT_KEY = "aspire.leadgate.v1";
export const SKIP_KEY = "aspire.leadgate.skip.v1";
export const HINT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const SKIP_MS = 30 * 24 * 60 * 60 * 1000;
/** Waits before asking again for `sample` after a failed answer (attempt 1 → 2 → 3). */
export const SAMPLE_RETRY_MS = [2_000, 6_000] as const;
/** `sample` requests per page at most: retries plus asks from the form (focus) after they ran out. */
export const SAMPLE_MAX_REQUESTS = 5;

export const INITIAL_LEAD_GATE_STATE: LeadGateState = Object.freeze({
  status: "unknown",
  mode: null,
  via: null,
  recordsUse: false,
  unlockSeq: 0,
  sample: null,
});

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface LeadGateStoreDeps {
  fetchStatus: () => Promise<LeadGateStatusOutcome>;
  submit: (payload: Record<string, unknown>) => Promise<LeadGateSubmitOutcome>;
  forget: (withdraw: boolean) => Promise<LeadGateForgetData | null>;
  sendUsage: (input: LeadGateUsageInput) => Promise<LeadGateUsageData | null>;
  storage: () => StorageLike | null;
  now: () => number;
  online: () => boolean;
  /** Cross-tab sync; returns an unsubscribe. */
  listenStorage: (onKey: (key: string | null) => void) => () => void;
  /** Runs `run` after `ms` (loadSample retries). Optional: setTimeout when absent. */
  schedule?: (run: () => void, ms: number) => void;
}

const scheduleWithTimeout = (run: () => void, ms: number): void => {
  setTimeout(run, ms);
};

interface Hint {
  until: number;
  recordsUse: boolean;
  mode: LeadGateMode;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const browserLeadGateDeps: LeadGateStoreDeps = {
  fetchStatus: () => fetchLeadGateStatus(),
  submit: (payload) => submitLeadGate(payload),
  forget: (withdraw) => forgetLeadGate(withdraw),
  sendUsage: (input) => sendLeadGateUsage(input),
  storage: browserStorage,
  now: () => Date.now(),
  online: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  listenStorage: (onKey) => {
    if (typeof window === "undefined") return () => undefined;
    const handler = (event: StorageEvent) => onKey(event.key);
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  },
  schedule: scheduleWithTimeout,
};

export class LeadGateStore {
  private state: LeadGateState = INITIAL_LEAD_GATE_STATE;
  private readonly listeners = new Set<() => void>();
  private readonly unlockListeners = new Set<(event: LeadGateUnlockEvent) => void>();
  private inflight: Promise<boolean> | null = null;
  /** A `sample` request is in flight or its retry is waiting. */
  private sampleBusy = false;
  private sampleRequests = 0;
  private stopStorage: (() => void) | null = null;

  constructor(private readonly deps: LeadGateStoreDeps = browserLeadGateDeps) {}

  // ── useSyncExternalStore adapter ──
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.stopStorage ??= this.deps.listenStorage((key) => this.handleStorage(key));
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.stopStorage) {
        this.stopStorage();
        this.stopStorage = null;
      }
    };
  };
  getSnapshot = (): LeadGateState => this.state;
  getServerSnapshot = (): LeadGateState => INITIAL_LEAD_GATE_STATE;

  onUnlock(listener: (event: LeadGateUnlockEvent) => void): () => void {
    this.unlockListeners.add(listener);
    return () => this.unlockListeners.delete(listener);
  }

  private set(next: Partial<LeadGateState>, by: string | null = null): void {
    const previous = this.state;
    let state: LeadGateState = { ...previous, ...next };
    const opened = state.status === "open" && previous.status !== "open";
    if (opened) state = { ...state, unlockSeq: previous.unlockSeq + 1 };
    this.state = state;
    for (const listener of [...this.listeners]) listener();
    if (opened) {
      const event = { seq: state.unlockSeq, by, via: state.via };
      for (const listener of [...this.unlockListeners]) listener(event);
    }
  }

  // ── local hints (never personal data; every access guarded) ──
  private read<T>(key: string, parse: (value: Record<string, unknown>) => T | null): T | null {
    try {
      const raw = this.deps.storage()?.getItem(key);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      return typeof value === "object" && value !== null ? parse(value as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    try {
      this.deps.storage()?.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked: the next page simply asks the server again
    }
  }

  private remove(key: string): void {
    try {
      this.deps.storage()?.removeItem(key);
    } catch {
      // blocked storage
    }
  }

  private readHint(): Hint | null {
    const now = this.deps.now();
    return this.read(HINT_KEY, (value) => {
      const until = value.until;
      const mode = value.mode;
      if (typeof until !== "number" || until <= now || until > now + HINT_MAX_AGE_MS) return null;
      if (mode !== "optional" && mode !== "required") return null;
      return { until, recordsUse: value.recordsUse === true, mode };
    });
  }

  private readSkip(): boolean {
    const now = this.deps.now();
    return this.read(SKIP_KEY, (value) => (typeof value.until === "number" && value.until > now && value.until <= now + SKIP_MS ? true : null)) === true;
  }

  // ── public API ──

  /**
   * May a result be shown now? Open → true; locked → false (the host shows the form). Otherwise a
   * valid hint or remembered skip opens at once; offline opens as `unavailable`; else one shared
   * GET /api/lead-gate decides, failing open.
   */
  ensure(): Promise<boolean> {
    if (this.state.status === "open") return Promise.resolve(true);
    if (this.state.status === "locked") return Promise.resolve(false);
    if (this.inflight) return this.inflight;
    const hint = this.readHint();
    if (hint) {
      this.set({ status: "open", via: "pass", mode: hint.mode, recordsUse: hint.recordsUse });
      return Promise.resolve(true);
    }
    if (this.readSkip()) {
      this.set({ status: "open", via: "skipped", mode: "optional", recordsUse: false });
      return Promise.resolve(true);
    }
    if (!this.deps.online()) {
      this.set({ status: "open", via: "unavailable", recordsUse: false });
      return Promise.resolve(true);
    }
    return this.check();
  }

  /** Asks the server now (ignores hints). */
  refresh(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    return this.check();
  }

  private check(): Promise<boolean> {
    if (this.state.status !== "open") this.set({ status: "checking" });
    const run = this.deps
      .fetchStatus()
      .catch((): LeadGateStatusOutcome => ({ kind: "failed" }))
      .then((outcome) => {
        this.inflight = null;
        if (outcome.kind === "failed") {
          if (this.state.status !== "open") this.set({ status: "open", via: "unavailable", recordsUse: false });
          return true;
        }
        const data = outcome.data;
        const sample = data.sample === true;
        if (data.unlocked) {
          if (data.via === "pass" && data.expiresAt) {
            const expiresAt = Date.parse(data.expiresAt);
            const now = this.deps.now();
            this.write(HINT_KEY, { until: Math.min(Number.isFinite(expiresAt) ? expiresAt : now, now + HINT_MAX_AGE_MS), recordsUse: data.recordsUse, mode: data.mode });
          } else {
            this.remove(HINT_KEY);
          }
          this.set({ status: "open", mode: data.mode, via: data.via, recordsUse: data.via === "pass" && data.recordsUse, sample });
          return true;
        }
        this.remove(HINT_KEY);
        if (data.mode === "optional" && this.readSkip()) {
          this.set({ status: "open", mode: data.mode, via: "skipped", recordsUse: false, sample });
          return true;
        }
        this.set({ status: "locked", mode: data.mode, via: null, recordsUse: false, sample });
        return false;
      });
    this.inflight = run;
    return run;
  }

  /**
   * <LeadGateForm> needs `sample` when this page never had a status answer (a hint opened the
   * store, then an enforced tool got the gate 401 → markRequired). One GET, of which only `sample`
   * is kept: the gate state stays as it is (the 401 was the truth). No-op while known, while a
   * status request is in flight (it brings `sample`), while its own request or retry is pending, or
   * after SAMPLE_MAX_REQUESTS. A failed answer (429, 5xx, timeout) is retried after
   * SAMPLE_RETRY_MS; once those run out, the form asks again when the family starts typing.
   * Never throws; until an answer arrives `sample` stays unknown (the form claims nothing).
   */
  loadSample(): void {
    if (this.state.sample !== null || this.inflight || this.sampleBusy || this.sampleRequests >= SAMPLE_MAX_REQUESTS) return;
    this.sampleBusy = true;
    const attempt = ++this.sampleRequests;
    void this.deps
      .fetchStatus()
      .catch((): LeadGateStatusOutcome => ({ kind: "failed" }))
      .then((outcome) => {
        if (outcome.kind === "ok") {
          this.sampleBusy = false;
          if (this.state.sample === null) this.set({ sample: outcome.data.sample === true });
          return;
        }
        const wait: number | undefined = SAMPLE_RETRY_MS[attempt - 1];
        if (wait === undefined) {
          this.sampleBusy = false;
          return;
        }
        (this.deps.schedule ?? scheduleWithTimeout)(() => {
          this.sampleBusy = false;
          this.loadSample();
        }, wait);
      });
  }

  /** A server-enforced tool got the gate 401 (isLeadGateResponse): the hint was stale; show the form. */
  markRequired(): void {
    this.remove(HINT_KEY);
    this.set({ status: "locked", mode: "required", via: null, recordsUse: false });
  }

  /** Sends the form (LeadGateForm calls this). On success the store opens; a status check then confirms the pass before any hint is written. */
  async submit(payload: Record<string, unknown>, by: string | null = null): Promise<LeadGateSubmitOutcome> {
    let outcome: LeadGateSubmitOutcome;
    try {
      outcome = await this.deps.submit(payload);
    } catch {
      outcome = { kind: "network" };
    }
    if (outcome.kind === "unlocked") {
      const { via, recordsUse } = outcome.data;
      this.set({ status: "open", via, recordsUse: via === "pass" && recordsUse }, by);
      if (via === "pass") void this.confirmPass();
    }
    return outcome;
  }

  private async confirmPass(): Promise<void> {
    let outcome: LeadGateStatusOutcome;
    try {
      outcome = await this.deps.fetchStatus();
    } catch {
      return;
    }
    if (outcome.kind !== "ok" || outcome.data.via !== "pass" || !outcome.data.expiresAt) return;
    const expiresAt = Date.parse(outcome.data.expiresAt);
    const now = this.deps.now();
    if (!Number.isFinite(expiresAt)) return;
    this.write(HINT_KEY, { until: Math.min(expiresAt, now + HINT_MAX_AGE_MS), recordsUse: outcome.data.recordsUse, mode: outcome.data.mode });
    this.set({ mode: outcome.data.mode, recordsUse: outcome.data.recordsUse, sample: outcome.data.sample === true });
  }

  /** "Continue without sharing" (optional mode only), remembered for 30 days. */
  skip(by: string | null = null): void {
    if (this.state.mode !== "optional") return;
    this.write(SKIP_KEY, { until: this.deps.now() + SKIP_MS });
    this.set({ status: "open", via: "skipped", recordsUse: false }, by);
  }

  /** Browser-only tools after a failure that is not the visitor's: show the result, record nothing. */
  continueWithoutSaving(by: string | null = null): void {
    this.set({ status: "open", via: "unavailable", recordsUse: false }, by);
  }

  /** "Not you?" (and `withdraw` = "Stop Aspire contacting me"). Clears hints; the next result asks again. */
  async forget(options: { withdraw?: boolean } = {}): Promise<LeadGateForgetData | null> {
    let result: LeadGateForgetData | null;
    try {
      result = await this.deps.forget(options.withdraw === true);
    } catch {
      result = null;
    }
    if (result) {
      this.remove(HINT_KEY);
      this.remove(SKIP_KEY);
      this.set({ status: "unknown", via: null, recordsUse: false });
    }
    return result;
  }

  /**
   * Notes one use of a browser-only tool (predictor, planner) when this browser's pass records use.
   * Fire-and-forget; never throws. A `no_pass` answer means the hint was stale: forget it.
   */
  recordUse(input: LeadGateUsageInput): void {
    if (this.state.via !== "pass" || !this.state.recordsUse) return;
    void this.deps
      .sendUsage(input)
      .catch(() => null)
      .then((result) => {
        if (result && !result.recorded && result.reason === "no_pass") {
          this.remove(HINT_KEY);
          if (this.state.via === "pass") this.set({ status: "unknown", via: null, recordsUse: false });
        }
      });
  }

  private handleStorage(key: string | null): void {
    if (key !== null && key !== HINT_KEY) return;
    const hint = this.readHint();
    if (hint && this.state.status !== "open") this.set({ status: "open", via: "pass", mode: hint.mode, recordsUse: hint.recordsUse });
    else if (!hint && this.state.via === "pass") this.set({ status: "unknown", via: null, recordsUse: false });
  }
}

/** The page-wide store. */
export const leadGateStore = new LeadGateStore();
