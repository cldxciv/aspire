import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Range } from "@/lib/predictor/types";

/**
 * Display helpers for the predictor (client-safe, pure). Ranks use Indian digit grouping
 * (1,20,000); Hindi pages keep Latin digits (hi-IN's default numbering system).
 */
const formatters = new Map<string, Intl.NumberFormat>();

export function formatNumber(value: number, locale: Locale, maximumFractionDigits = 0): string {
  const key = `${locale}|${maximumFractionDigits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale === "hi" ? "hi-IN" : "en-IN", { maximumFractionDigits });
    formatters.set(key, formatter);
  }
  return formatter.format(value);
}

/** "2,700 – 6,000" with the locale's `result.range` template. */
export function formatRankRange(range: Range, locale: Locale, template: string): string {
  return format(template, { low: formatNumber(range.low, locale), high: formatNumber(range.high, locale) });
}

/** Percentile range with up to 2 decimals; a single value when both ends are equal. */
export function formatPercentileRange(range: Range, locale: Locale, template: string): string {
  const low = formatNumber(Math.floor(range.low * 100) / 100, locale, 2);
  const high = formatNumber(Math.ceil(range.high * 100) / 100, locale, 2);
  return low === high ? low : format(template, { low, high });
}
