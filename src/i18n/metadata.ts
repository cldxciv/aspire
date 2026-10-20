import { defaultLocale, htmlLang, locales, type Locale } from "./config";
import { localePath, stripLocale } from "./paths";

/** `hreflang` → href for every locale, plus `x-default` (English). Relative hrefs resolve against `metadataBase`. */
export function languageAlternates(path: string, toUrl: (href: string) => string = (href) => href): Record<string, string> {
  const base = stripLocale(path);
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[htmlLang[locale]] = toUrl(localePath(base, locale));
  languages["x-default"] = toUrl(localePath(base, defaultLocale));
  return languages;
}

/**
 * `alternates` for a page's metadata: the canonical URL in `locale` plus hreflang links
 * (`en-IN`, `hi-IN`, `x-default`). Pass the locale-free path, e.g. `"/programs/jee-main"`.
 * In pages, prefer the async `localeAlternates(path)` from `@/i18n/server`, which reads the locale.
 */
export function alternatesFor(path: string, locale: Locale) {
  return {
    canonical: localePath(stripLocale(path), locale),
    languages: languageAlternates(path),
  };
}
