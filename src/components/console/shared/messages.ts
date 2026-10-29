/**
 * Console message helpers (docs/admin-phase-1b-plan.md §1.2 rule 6; owner: 1B-CORE). Console
 * packages keep their words in `src/i18n/messages/{en,hi}/console-<pkg>.ts` (not registered
 * namespaces); a page imports both files and picks one with `pick(locale, en, hi)`. Client-safe.
 */
import type { Locale } from "@/i18n/config";
import { htmlLang } from "@/i18n/config";
import { format } from "@/i18n/format";
import consoleCommonEn from "@/i18n/messages/en/console-common";
import consoleCommonHi from "@/i18n/messages/hi/console-common";

/** The shared console words (`src/i18n/messages/en/console-common.ts`). */
export type ConsoleCommon = typeof consoleCommonEn;

/** The messages of `locale`: Hindi for "hi", English otherwise. */
export function pick<T>(locale: Locale, en: T, hi: T): T {
  return locale === "hi" ? hi : en;
}

/** The shared console words in `locale`. */
export function consoleCommon(locale: Locale): ConsoleCommon {
  return pick(locale, consoleCommonEn, consoleCommonHi);
}

/** A count in the page language's grouping (Indian: 1,00,000), always Latin digits. */
export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(htmlLang[locale], { maximumFractionDigits: 0, numberingSystem: "latn" }).format(value);
}

/** round(100 · x / y), or null when y is 0 (a rate is never shown without its "x of y"). */
export function percentOf(x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || y <= 0) return null;
  return Math.round((100 * x) / y);
}

/** "23 of 60 (38 %)", or "0 of 0" without a percentage (plan §5 common UI rules: never a bare %). */
export function xOfYText(x: number, y: number, locale: Locale, t: ConsoleCommon = consoleCommon(locale)): string {
  const values = { x: formatCount(x, locale), y: formatCount(y, locale) };
  const percent = percentOf(x, y);
  return percent === null ? format(t.common.xOfY, values) : format(t.common.xOfYPercent, { ...values, percent });
}
