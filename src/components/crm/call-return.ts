/**
 * "Back from the call?" (docs/lead-routing-plan.md §20, A6): staff who tap a `tel:` link on a lead
 * page often forget to log the call. A tap on a `tel:` link records `{ leadId, at }` in this
 * browser's sessionStorage; when the page becomes visible again (or reloads) within two hours,
 * the lead page offers "Log the call". Pure helpers + storage access, all wrapped so a blocked or
 * missing storage never breaks the page. Client-safe; no personal data is stored (a lead id and a
 * time only).
 */

export const CALL_RETURN_KEY = "aspire.crm.call.v1";
/** A mark older than this is ignored (the call was long ago). */
export const CALL_RETURN_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Coming back within this time is not "after a call" (e.g. the dialler did not open). */
export const CALL_RETURN_MIN_MS = 5_000;

export interface CallMark {
  leadId: string;
  at: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const LEAD_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The stored mark, or null (missing, malformed, unreadable storage). */
export function readCallMark(storage: StorageLike | null | undefined): CallMark | null {
  try {
    const raw = storage?.getItem(CALL_RETURN_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { leadId, at } = value as Record<string, unknown>;
    return typeof leadId === "string" && LEAD_ID.test(leadId) && typeof at === "number" && Number.isFinite(at) ? { leadId, at } : null;
  } catch {
    return null;
  }
}

export function markCallStarted(storage: StorageLike | null | undefined, leadId: string, now: number): void {
  if (!LEAD_ID.test(leadId)) return;
  try {
    storage?.setItem(CALL_RETURN_KEY, JSON.stringify({ leadId, at: now }));
  } catch {
    // Private mode / blocked storage: the prompt simply does not appear.
  }
}

export function clearCallMark(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(CALL_RETURN_KEY);
  } catch {
    // Nothing to do.
  }
}

/** Whether to offer "Log the call" for `leadId` now. */
export function shouldPromptCallReturn(mark: CallMark | null, leadId: string, now: number): boolean {
  if (!mark || mark.leadId !== leadId) return false;
  const elapsed = now - mark.at;
  return elapsed >= CALL_RETURN_MIN_MS && elapsed <= CALL_RETURN_WINDOW_MS;
}

/** The `tel:` link a click landed on, if any. */
export function telLinkOf(target: EventTarget | null): Element | null {
  if (!target || typeof (target as Element).closest !== "function") return null;
  const link = (target as Element).closest("a[href]");
  return link && typeof link.getAttribute === "function" && link.getAttribute("href")?.startsWith("tel:") ? link : null;
}

/** sessionStorage when the browser allows it, else null. */
export function sessionStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
