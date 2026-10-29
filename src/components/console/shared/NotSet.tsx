import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { consoleCommon, type ConsoleCommon } from "./messages";

/**
 * An honest empty value (plan §10.1): "Not set" (or another `kind`) in muted text, never an
 * invented number, date or link. Server- and client-safe.
 */
export function NotSet({
  locale,
  kind = "notSet",
  t = consoleCommon(locale),
  className,
}: {
  locale: Locale;
  kind?: "notSet" | "noTarget" | "notRecorded";
  t?: ConsoleCommon;
  className?: string;
}) {
  return <span className={cn("text-muted", className)}>{t.common[kind]}</span>;
}
