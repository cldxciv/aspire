import { X } from "lucide-react";
import Link from "next/link";
import type { FilterChip } from "@/components/crm/format";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";

/**
 * The active Enquiries filters as removable chips (docs/admin-phase-1b-plan.md §5.I; owner:
 * 1B-FAMILY): each chip is a link to the same list without that filter, named "Remove filter
 * Stage: New"; "Clear all" goes back to the unfiltered list. Nothing renders without filters.
 * Server-safe.
 */
export function FilterChips({
  chips,
  locale,
  t,
}: {
  chips: readonly FilterChip[];
  locale: Locale;
  t: { label: string; remove: string; clearAll: string };
}) {
  if (chips.length === 0) return null;
  const base = localePath("/crm", locale);
  return (
    <div role="group" aria-labelledby="crm-inbox-chips-label" className="mb-3 flex flex-wrap items-center gap-2">
      <span id="crm-inbox-chips-label" className="text-sm font-bold text-navy">
        {t.label}:
      </span>
      <ul className="flex min-w-0 flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={`${base}${chip.removeQuery}`}
              aria-label={format(t.remove, { filter: chip.label })}
              className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-[#b9cbe0] bg-[#edf4ff] px-3 text-sm font-semibold text-navy hover:border-blue"
            >
              <span className="min-w-0 break-words">{chip.label}</span>
              <X aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      <Link href={base} className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-blue hover:underline">
        {t.clearAll}
      </Link>
    </div>
  );
}
