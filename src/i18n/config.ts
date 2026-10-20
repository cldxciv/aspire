/**
 * Locale configuration (D-028). Pure and client-safe: no server APIs, no message catalogs.
 *
 * English is the default locale and its URLs stay unprefixed (`/about`); Hindi lives under
 * `/hi` (`/hi/about`). Internally every route sits under `src/app/[lang]/`, and the proxy
 * rewrites unprefixed URLs to `/en/...`.
 */
export const locales = ["en", "hi"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Narrows an untrusted value (route param, URL segment) to a supported locale. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** BCP 47 tags for `<html lang>` and `hreflang`. */
export const htmlLang: Readonly<Record<Locale, string>> = { en: "en-IN", hi: "hi-IN" };

/** Open Graph `og:locale` values. */
export const ogLocale: Readonly<Record<Locale, string>> = { en: "en_IN", hi: "hi_IN" };

/** Each language's name written in that language (language switcher). */
export const localeNames: Readonly<Record<Locale, string>> = { en: "English", hi: "हिन्दी" };
