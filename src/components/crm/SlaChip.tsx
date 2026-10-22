import { AlarmClock, ArrowUpCircle, Clock3 } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import type { SlaClockView } from "@/lib/crm/lead-ops-types";
import { isoOrUndefined, slaChipText, type CrmMessages } from "./format";

/**
 * The first-call clock of a lead (docs/lead-routing-plan.md §15, D-046): "Call by 11:30",
 * "Call overdue (due 11:30)", "Escalated (due …)". The state is always written out (never colour
 * alone) and the due time is a `<time>`. Imported clocks carry a small "Imported" tag (A7).
 * Server-safe (no hooks); `now` is the request time.
 */
export function SlaChip({
  clock,
  now,
  locale,
  t,
  className,
}: {
  clock: SlaClockView;
  now: number;
  locale: Locale;
  t: Pick<CrmMessages, "slaChip">;
  className?: string;
}) {
  const Icon = clock.state === "escalated" ? ArrowUpCircle : clock.state === "overdue" ? AlarmClock : Clock3;
  const tone =
    clock.state === "escalated"
      ? "border-[#f2b8b5] bg-danger-soft text-[#8a1c14]"
      : clock.state === "overdue"
        ? "border-[#f2dfa0] bg-gold-soft text-[#6b4a00]"
        : "border-[#bcd6fb] bg-blue-soft text-[#0755b5]";
  return (
    <span
      className={cn("inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold", tone, className)}
      data-sla-state={clock.state}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="sr-only">{t.slaChip.label}: </span>
      <time dateTime={isoOrUndefined(clock.dueAt)}>{slaChipText(t, clock, now, locale)}</time>
      {clock.reason === "import" && <span className="rounded bg-white/70 px-1 font-semibold">{t.slaChip.imported}</span>}
    </span>
  );
}
