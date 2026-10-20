/**
 * Countdown helpers (pure). The runner keeps an absolute `deadline` (device clock) in its saved
 * state, so a reload resumes with the right time left and the clock keeps running while the page is
 * closed — as in a real exam. At 0 the test is submitted automatically.
 */

export function remainingMs(deadline: number, now: number): number {
  return Math.max(0, deadline - now);
}

/** True when an unsubmitted attempt has reached its deadline and must be auto-submitted. */
export function shouldAutoSubmit(state: { deadline: number; submittedAt: number | null }, now: number): boolean {
  return state.submittedAt === null && now >= state.deadline;
}

/** "hh:mm:ss" from one hour up, else "mm:ss". Rounds up so the clock shows 00:00 only at the end. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${two(hours)}:${two(minutes)}:${two(secs)}` : `${two(minutes)}:${two(secs)}`;
}

/** Announcement thresholds for the screen-reader live region. */
export type TimeWarning = "five" | "one" | null;

/** The warning crossed between two readings of the remaining time, if any. */
export function crossedWarning(previousMs: number, currentMs: number): TimeWarning {
  if (previousMs > 60_000 && currentMs <= 60_000) return "one";
  if (previousMs > 300_000 && currentMs <= 300_000) return "five";
  return null;
}

/** "1 min 05 s" style duration parts for time-per-question displays. */
export function durationParts(totalSeconds: number): { minutes: number; seconds: number } {
  const total = Math.max(0, Math.round(totalSeconds));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}
