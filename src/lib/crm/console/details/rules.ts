/**
 * More enquiry details — the rules shared by the form and the server (docs/admin-phase-1b-plan.md
 * §5.E; owner: 1B-FAMILY). PURE and client-safe.
 */
import { normalizePhoneE164 } from "../../pure";
import { currentSession, shiftSession } from "../session";
import type { SessionKey } from "../types";

/** Text limits (the SQL CHECKs of `crm_lead_details`). */
export const SCHOOL_MAX = 120;
export const REFERRED_BY_MAX = 80;
/** Target year choices: the current IST year up to four years ahead. */
export const TARGET_YEARS_AHEAD = 4;

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** The IST calendar year of an instant. */
export function istYear(now: number): number {
  return new Date(now + IST_OFFSET_MS).getUTCFullYear();
}

/** Target years offered at `now` (current IST year … +4), plus `keep` (a value already saved) when outside. */
export function targetYearChoices(now: number, keep: number | null = null): number[] {
  const first = istYear(now);
  const years = Array.from({ length: TARGET_YEARS_AHEAD + 1 }, (_, index) => first + index);
  if (keep !== null && !years.includes(keep)) years.unshift(keep);
  return years;
}

/** Joining-session choices at `now`: the current session and the next, plus `keep` when outside. */
export function intakeSessionChoices(now: number, keep: SessionKey | null = null): SessionKey[] {
  const current = currentSession(now).key;
  const sessions: SessionKey[] = [current, shiftSession(current, 1)];
  if (keep !== null && !sessions.includes(keep)) sessions.unshift(keep);
  return sessions;
}

export type AltPhoneCheck = { ok: true; value: string | null } | { ok: false; issue: "altPhoneInvalid" | "altPhoneSame" };

/**
 * A typed second number → E.164 with the Add-enquiry normaliser (any Indian mobile format), or
 * null when empty. Refused when it is not an Indian mobile or equals the family's main number.
 */
export function checkAltPhone(raw: string | null | undefined, mainPhone: string | null): AltPhoneCheck {
  if (raw === null || raw === undefined || raw.trim() === "") return { ok: true, value: null };
  const value = normalizePhoneE164(raw);
  if (!value) return { ok: false, issue: "altPhoneInvalid" };
  if (mainPhone && value === mainPhone) return { ok: false, issue: "altPhoneSame" };
  return { ok: true, value };
}
