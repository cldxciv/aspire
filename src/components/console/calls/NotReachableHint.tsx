import { PhoneOff } from "lucide-react";
import { format } from "@/i18n/format";
import { NOT_REACHABLE_AFTER } from "@/lib/crm/console/types";
import type { CallsMessages } from "./messages";

/**
 * Decision 10 / O10: after 5 unanswered calls in a row, OFFER "Mark as not reachable" (a checkbox the
 * staff member ticks; never automatic). Ticking it moves the enquiry to Lost (reason "Not reachable").
 */
export function NotReachableHint({
  id,
  streak,
  checked,
  onChange,
  c,
}: {
  id: string;
  /** Unanswered calls in a row including this one. */
  streak: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
  c: Pick<CallsMessages["calls"], "notReachable" | "notReachableLabel">;
}) {
  return (
    <div className="rounded-control border border-[#e3c46a] bg-[#fffbeb] p-3">
      <p id={`${id}-text`} className="flex items-start gap-2 text-sm font-semibold text-[#5c4a12]">
        <PhoneOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {format(c.notReachable, { n: Math.max(streak, NOT_REACHABLE_AFTER) })}
      </p>
      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={checked}
          aria-describedby={`${id}-text`}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 accent-[#1768d4]"
        />
        {c.notReachableLabel}
      </label>
    </div>
  );
}
