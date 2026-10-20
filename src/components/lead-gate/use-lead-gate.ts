"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import type { LeadGateTool, LeadGateUsageInput } from "@/lib/lead-gate/contract";

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
 */

export interface UseLeadGateOptions {
  tool: LeadGateTool;
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
      store.recordUse({ ...input, tool: usageTool });
    },
    [store, tool],
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
    formProps: { tool, hostId, enforced, store },
  };
}

/** Read-only view of the gate (notes, identity line). */
export function useLeadGateState(store: LeadGateStore = leadGateStore): LeadGateState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
