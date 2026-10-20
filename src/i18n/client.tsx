"use client";

import { createContext, useContext, type ReactNode } from "react";
import { defaultLocale, type Locale } from "./config";

/**
 * Client-side locale (D-028). The root layout wraps the app in <LocaleProvider>, so any
 * Client Component can call `useLocale()` and build links with `localePath(href, locale)`.
 * Messages are NOT provided here: pass the strings a client component needs as props from
 * its server parent (see src/i18n/README.md).
 */
const LocaleContext = createContext<Locale>(defaultLocale);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

/** The current locale inside a Client Component. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}
