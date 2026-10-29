import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { consoleCommon, xOfYText, type ConsoleCommon } from "./messages";

/**
 * A rate as "x of y (z %)" (plan §5 common UI rules, §10.3): never a bare percentage. Numbers use
 * tabular figures. Server- and client-safe.
 */
export function XofY({
  x,
  y,
  locale,
  t = consoleCommon(locale),
  className,
}: {
  x: number;
  y: number;
  locale: Locale;
  t?: ConsoleCommon;
  className?: string;
}) {
  return <span className={cn("tabular-nums", className)}>{xOfYText(x, y, locale, t)}</span>;
}
