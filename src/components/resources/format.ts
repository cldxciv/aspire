import enResources from "@/i18n/messages/en/resources";

/** English month abbreviations (the `resources.card.months` messages); pass the localised list for other locales. */
const EN_MONTHS = enResources.card.months;

/**
 * Formats an ISO date ("2026-10-18") as "18 Oct 2026" (or "18 अक्टूबर 2026" with the Hindi
 * month names) without constructing a Date, so output is deterministic (no timezone shift)
 * and safe during prerendering. Digits stay Western Arabic in every locale.
 */
export function formatIsoDate(iso: string, months: readonly string[] = EN_MONTHS): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = months[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : iso;
}
