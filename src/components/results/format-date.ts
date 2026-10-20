const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec";

/**
 * Formats an ISO date ("2026-10-18" or a full ISO timestamp) as "18 Oct 2026".
 * `months` = the 12 short month names, space-separated (`results.card.months` messages).
 * Pure string parsing: no Date construction, so it is deterministic during
 * prerendering and identical on server and client. Unrecognised input is returned unchanged.
 */
export function formatIsoDate(value: string, months: string = MONTHS): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const monthName = months.split(/\s+/)[Number(month) - 1];
  return monthName ? `${Number(day)} ${monthName} ${year}` : value;
}
