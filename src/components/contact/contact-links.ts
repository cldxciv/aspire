/**
 * Builders for contact links. Each returns null when the value is not safe to link,
 * so the UI shows plain text (or nothing) instead of a broken or unexpected link.
 */

/** `tel:` link from a phone number ("+91 98166 23676" or "+919816623676"). */
export function telHref(phone: string): string | null {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return /^\+?\d{6,15}$/.test(cleaned) ? `tel:${cleaned}` : null;
}

// One address only: no spaces, no "?subject=" / "&body=" parameters, no extra recipients.
const EMAIL = /^[^\s@?&#,;:/<>"']+@[^\s@?&#,;:/<>"']+\.[a-z]{2,}$/i;

/** `mailto:` link for a single plain email address. */
export function mailtoHref(email: string): string | null {
  const trimmed = email.trim();
  return EMAIL.test(trimmed) ? `mailto:${trimmed}` : null;
}

/**
 * Plain WhatsApp chat link, `https://wa.me/<digits>`, never with prefilled text.
 * Digits come from the stored wa.me URL when it is exactly that form, otherwise
 * from the display number; any query string (e.g. `?text=`) is dropped.
 */
export function whatsappHref(whatsapp: { url: string; display: string }): string | null {
  const fromUrl = /^https:\/\/wa\.me\/(\d{8,15})\/?(?:\?.*)?$/.exec(whatsapp.url.trim())?.[1];
  const digits = fromUrl ?? whatsapp.display.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? `https://wa.me/${digits}` : null;
}

const TRACKING_PARAM = /^(?:utm_.*|fbclid|gclid|igshid|igsh|mc_cid|mc_eid|si)$/i;

/** Social profile link: absolute https URLs only, with tracking parameters and any fragment removed. */
export function socialHref(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) parsed.searchParams.delete(key);
  }
  parsed.hash = "";
  return parsed.toString();
}
