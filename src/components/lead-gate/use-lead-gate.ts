"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import type { LeadGateTool, LeadGateUsageInput, LeadGateUsageKey } from "@/lib/lead-gate/contract";

import { leadGateStore, type LeadGateState, type LeadGateStore, type LeadGateUnlockEvent } from "./lead-gate-store";

/**
 * useLeadGate: what a tool host calls (docs/lead-gate-plan.md §6).
 *
 *   const gate = useLeadGate({ tool: "predictor", onUnlocked: () => setSubmitted(true) });
 *   async function onSubmit(event) {
 *     event.preventDefault();                       // synchronously, before any await
 *     if (!validInput) return;                     // validate the tool's own input FIRST (critique 1.10)
 *     if (await gate.requestAccess()) setSubmitted(true);   // false → gate.gateOpen is now true
 *   }
 *   {gate.gateOpen && <LeadGateForm {...gate.formProps} messages={t} summary={{ exam, band }} />}
 *
 * - `gateOpen` is derived (asked AND the store has not opened since), so it closes by itself when
 *   ANY host or tab unlocks; `onUnlocked({ byThisHost })` fires then. A host that sends something
 *   the user typed earlier (Rancho) should only auto-send when `byThisHost` is true, and otherwise
 *   offer "Send now" (critique 1.15).
 * - `enforced: true` for tools the server enforces (Rancho, mock-test score): on the gate 401
 *   (isLeadGateResponse) call `markRequired()`; the form then never offers "continue without saving".
 * - `sample` (from the store): the site shows sample data. Gate anyway (owner decision 21 Oct 2026);
 *   <LeadGateForm> already prints the honest sample-data line, so hosts add no copy of their own.
 * - Signed-in accounts (owner decision 22 Oct 2026) need nothing from the host: the server decides.
 *   Staff and admins see the visitor's form; a student or parent account sees it with its name and
 *   role pre-filled (store `prefill`) and is let through only with a mobile number on file.
 * - `usageKey` (planner only): a planner feature other than a study plan. The homepage widget's
 *   exam countdown uses `useLeadGate({ tool: "planner", usageKey: "countdown" })`: `recordUse({ exam })`
 *   then notes "Study planner · exam countdown · <exam>" on the family's record, and the form's
 *   button reads `messages.submitFor.countdown` ("Show my countdown").
 */

export interface UseLeadGateOptions {
  tool: LeadGateTool;
  /** Planner only: which planner feature this host is (LEAD_GATE_USAGE_KEYS, e.g. "countdown"). */
  usageKey?: LeadGateUsageKey;
  enforced?: boolean;
  onUnlocked?: (info: { byThisHost: boolean; via: LeadGateUnlockEvent["via"] }) => void;
  /** Tests / storybook only. */
  store?: LeadGateStore;
}

export interface LeadGateFormBinding {
  tool: LeadGateTool;
  hostId: string;
  enforced: boolean;
  store: LeadGateStore;
  /** Planner feature (planner hosts that passed `usageKey`), for the form's button label. */
  usageKey?: LeadGateUsageKey;
}

export interface UseLeadGate extends LeadGateState {
  /** The host asked and the store has not opened since: render <LeadGateForm {...formProps}>. */
  gateOpen: boolean;
  /** True → show the result now. False → the form is now open (`gateOpen`). Never throws. */
  requestAccess: () => Promise<boolean>;
  /** A server-enforced tool answered the gate 401: forget the stale hint and open the form. */
  markRequired: () => void;
  /** Close the form without unlocking (e.g. the user edits the tool's input instead). */
  closeGate: () => void;
  /** Note one use of a browser-only tool (predictor / planner). Fire-and-forget. */
  recordUse: (input: Omit<LeadGateUsageInput, "tool"> & { tool?: LeadGateUsageInput["tool"] }) => void;
  forget: LeadGateStore["forget"];
  formProps: LeadGateFormBinding;
}

export function useLeadGate(options: UseLeadGateOptions): UseLeadGate {
  const store = options.store ?? leadGateStore;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const hostId = useId();
  const enforced = options.enforced === true;
  const { tool } = options;
  const usageKey = tool === "planner" ? options.usageKey : undefined;

  // The unlockSeq at the time the host was refused; null = not waiting.
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const waitingRef = useRef<number | null>(null);
  const onUnlockedRef = useRef(options.onUnlocked);
  useEffect(() => {
    onUnlockedRef.current = options.onUnlocked;
  });

  useEffect(
    () =>
      store.onUnlock((event) => {
        const since = waitingRef.current;
        if (since === null || event.seq <= since) return;
        waitingRef.current = null;
        setWaitingSince(null);
        onUnlockedRef.current?.({ byThisHost: event.by === hostId, via: event.via });
      }),
    [store, hostId],
  );

  const wait = useCallback(() => {
    const since = store.getSnapshot().unlockSeq;
    waitingRef.current = since;
    setWaitingSince(since);
  }, [store]);

  const requestAccess = useCallback(async () => {
    let allowed = true;
    try {
      allowed = await store.ensure();
    } catch {
      allowed = true; // fail open; enforced tools still get the server's answer
    }
    if (!allowed) wait();
    return allowed;
  }, [store, wait]);

  const markRequired = useCallback(() => {
    store.markRequired();
    wait();
  }, [store, wait]);

  const closeGate = useCallback(() => {
    waitingRef.current = null;
    setWaitingSince(null);
  }, []);

  const recordUse = useCallback<UseLeadGate["recordUse"]>(
    (input) => {
      const usageTool = input.tool ?? (tool === "predictor" || tool === "planner" ? tool : null);
      if (!usageTool) return; // Rancho and mock-test scores are recorded by their own server routes
      const key = usageTool === "planner" ? (input.key ?? usageKey) : undefined;
      const usage: LeadGateUsageInput = { ...input, tool: usageTool };
      if (key) usage.key = key;
      else delete usage.key; // only the planner names a feature
      store.recordUse(usage);
    },
    [store, tool, usageKey],
  );

  const forget = useCallback<LeadGateStore["forget"]>((forgetOptions) => store.forget(forgetOptions), [store]);

  return {
    ...state,
    gateOpen: waitingSince !== null && waitingSince === state.unlockSeq && state.status !== "open",
    requestAccess,
    markRequired,
    closeGate,
    recordUse,
    forget,
    formProps: { tool, hostId, enforced, store, ...(usageKey ? { usageKey } : {}) },
  };
}

/** Read-only view of the gate (notes, identity line). */
export function useLeadGateState(store: LeadGateStore = leadGateStore): LeadGateState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
