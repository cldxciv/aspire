"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => undefined;
const readSearch = () => window.location.search;
const serverSearch = () => "";

/**
 * `window.location.search` after hydration, "" while prerendering. Unlike `useSearchParams()` it
 * needs no <Suspense> boundary (cacheComponents), so the static form pages stay static. Use it only
 * for optional display (e.g. the predictor note); submits read `window.location` directly.
 */
export function useLocationSearch(): string {
  return useSyncExternalStore(noopSubscribe, readSearch, serverSearch);
}
