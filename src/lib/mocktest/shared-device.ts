/**
 * Shared devices (QA-SEC-M6 L9): what the student tools keep in this browser's `localStorage` —
 * mock-test progress and attempts (`aspire.mocktest.v1.*`, src/lib/mocktest/local-store.ts) and the
 * study planner's guest / account copies, sync meta and reminder marker (`aspire.planner.*`,
 * src/components/planner/planner-store.ts, PlannerApp.tsx). Signing out removes all of it so the
 * next person on a shared phone or lab computer does not see the previous student's work.
 * Also the lead gate's local hints (`aspire.leadgate.*`: "this browser shared details" until a time,
 * and a remembered "Continue without sharing"; no personal data; src/components/lead-gate).
 * Client-safe; never throws (storage may be blocked).
 */

export const TOOL_STORAGE_PREFIXES = ["aspire.mocktest.", "aspire.planner.", "aspire.leadgate."] as const;

/** Removes every tool key from `storage` (default: this window's localStorage). Returns how many. */
export function clearToolStorage(storage?: Pick<Storage, "length" | "key" | "removeItem"> | null): number {
  let store = storage ?? null;
  if (storage === undefined) {
    try {
      store = typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      store = null;
    }
  }
  if (!store) return 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && TOOL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
    return keys.length;
  } catch {
    return 0;
  }
}
