/**
 * Link helpers for contact details that come from data files/CMS.
 * Pure functions, safe in server and client components.
 */

/** `tel:` href from a display number ("+91 98166 23676" → "tel:+919816623676"), or null. */
export function telHref(phone?: string): string | null {
  const digits = phone?.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/** `mailto:` href for a plausible address only (no spaces, one @), or null. */
export function mailtoHref(email?: string): string | null {
  const value = email?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : null;
}

/** Only https links are rendered as "Directions". */
export function safeDirectionsUrl(url?: string): string | null {
  return url && /^https:\/\//i.test(url.trim()) ? url.trim() : null;
}
