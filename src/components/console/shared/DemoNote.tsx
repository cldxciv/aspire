import { Info } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { consoleCommon, type ConsoleCommon } from "./messages";

/**
 * "Demo centre list: the real list is pending" (O1, decision 7; plan §10.4): shown above centre
 * numbers and centre pickers while the site is in demo mode. Renders nothing when `demo` is false.
 * Icon plus text, never colour alone.
 */
export function DemoNote({
  demo,
  locale,
  t = consoleCommon(locale),
  className,
}: {
  demo: boolean;
  locale: Locale;
  t?: ConsoleCommon;
  className?: string;
}) {
  if (!demo) return null;
  return (
    <div role="note" className={cn("flex items-start gap-2 rounded-control border border-[#f2dfa0] bg-gold-soft px-3 py-2 text-sm text-[#5c4a12]", className)}>
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong className="font-bold">{t.common.demoCentres}</strong>
        <span className="block text-xs">{t.common.demoCentresDecision}</span>
      </p>
    </div>
  );
}
