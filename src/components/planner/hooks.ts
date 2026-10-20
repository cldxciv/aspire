"use client";

import { useSyncExternalStore } from "react";
import { istDateKey, type DateKey } from "@/lib/planner/dates";
import { plannerStore, type PlannerSnapshot } from "./planner-store";

/** The planner state, or `null` during SSR / hydration. */
export function usePlannerSnapshot(): PlannerSnapshot | null {
  return useSyncExternalStore(plannerStore.subscribe, plannerStore.getSnapshot, plannerStore.getServerSnapshot);
}

function subscribeClock(callback: () => void): () => void {
  const timer = setInterval(callback, 30_000);
  document.addEventListener("visibilitychange", callback);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", callback);
  };
}

/** Today's IST date key in the browser (re-checked every 30 s and on tab focus); `null` on the server. */
export function useToday(): DateKey | null {
  return useSyncExternalStore(
    subscribeClock,
    () => istDateKey(Date.now()),
    () => null,
  );
}

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** `navigator.onLine` (true during SSR / hydration). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

const noopSubscribe = () => () => {};

/** Reads a browser-only value once mounted (`fallback` during SSR / hydration). */
export function useBrowserValue<T>(read: () => T, fallback: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => fallback);
}
