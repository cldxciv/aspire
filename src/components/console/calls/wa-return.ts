/**
 * "Did you send it?" after WhatsApp opens (docs/admin-phase-1b-plan.md §5.D, O16; owner: 1B-CALLS).
 * Opening WhatsApp LOGS NOTHING: the composer only keeps `{ leadId, templateKey, lang, openedAt }` in
 * this browser's sessionStorage (no text, no number, no name). The question is asked in the open
 * dialog and, after a reload or a discarded tab, by the lead page when it regains focus. Only "Yes,
 * I sent it" logs a contact. Reuses `sessionStore` and the two-hour expiry of call-return.ts; every
 * storage access is wrapped so a blocked storage never breaks the page. Client-safe.
 */
import { CALL_RETURN_WINDOW_MS, sessionStore } from "@/components/crm/call-return";
import { TEMPLATE_KEY_PATTERN, TEMPLATE_LANGS, type TemplateLang } from "@/lib/crm/console/types";

export { sessionStore };

export const WA_RETURN_KEY = "aspire.crm.wa.v1";
/** Same-tab signal when the mark changes (the storage event only reaches OTHER tabs). */
export const WA_MARK_EVENT = "aspire:crm-wa-mark";

export interface WaMark {
  leadId: string;
  /** The approved template used, or null for "Write my own message". */
  templateKey: string | null;
  lang: TemplateLang;
  openedAt: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const LEAD_ID = /^[A-Za-z0-9_-]{1,64}$/;

function isLang(value: unknown): value is TemplateLang {
  return typeof value === "string" && (TEMPLATE_LANGS as readonly string[]).includes(value);
}

/** The stored mark, or null (missing, malformed, unreadable storage). */
export function readWaMark(storage: StorageLike | null | undefined): WaMark | null {
  try {
    const raw = storage?.getItem(WA_RETURN_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { leadId, templateKey, lang, openedAt } = value as Record<string, unknown>;
    if (typeof leadId !== "string" || !LEAD_ID.test(leadId)) return null;
    if (templateKey !== null && (typeof templateKey !== "string" || !TEMPLATE_KEY_PATTERN.test(templateKey))) return null;
    if (!isLang(lang) || typeof openedAt !== "number" || !Number.isFinite(openedAt)) return null;
    return { leadId, templateKey, lang, openedAt };
  } catch {
    return null;
  }
}

function signal(): void {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(WA_MARK_EVENT));
  } catch {
    // Nothing to do.
  }
}

/** Remembers that WhatsApp was opened for this lead (nothing is logged). */
export function markWaOpened(storage: StorageLike | null | undefined, mark: WaMark): void {
  if (!LEAD_ID.test(mark.leadId) || !isLang(mark.lang)) return;
  if (mark.templateKey !== null && !TEMPLATE_KEY_PATTERN.test(mark.templateKey)) return;
  try {
    storage?.setItem(WA_RETURN_KEY, JSON.stringify({ leadId: mark.leadId, templateKey: mark.templateKey, lang: mark.lang, openedAt: mark.openedAt }));
  } catch {
    // Private mode / blocked storage: the question is still asked in the open dialog.
  }
  signal();
}

export function clearWaMark(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(WA_RETURN_KEY);
  } catch {
    // Nothing to do.
  }
  signal();
}

/** Whether to ask "Did you send it?" for `leadId` now (a mark for this lead, under two hours old). */
export function shouldPromptWaReturn(mark: WaMark | null, leadId: string, now: number): boolean {
  if (!mark || mark.leadId !== leadId) return false;
  const elapsed = now - mark.openedAt;
  return elapsed >= 0 && elapsed <= CALL_RETURN_WINDOW_MS;
}
