"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` during server rendering and hydration, `true` once React runs in the browser.
 * Forms use it to keep their submit button disabled until the JS handler exists, so a
 * credential form can never fall back to a native submit.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
