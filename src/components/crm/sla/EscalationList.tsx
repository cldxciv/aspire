import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import type { SlaQueueItem } from "@/lib/crm/lead-ops-types";
import { isoOrUndefined, slaTimeLabel, withBack, type CrmMessages } from "../format";

/**
 * Escalated first calls (owner: LR-SLA; docs/lead-routing-plan.md §15, §16): families still
 * without a first call after the super-admin step, as a table (family, area, who holds it, when it
 * was due). Super admins see it on the dashboard. Server-safe; names link to the lead.
 */
export function EscalationList({
  items,
  now,
  locale,
  areaNames,
  backPath,
  t,
}: {
  items: SlaQueueItem[];
  now: number;
  locale: Locale;
  areaNames: Readonly<Record<string, string>>;
  backPath: string;
  t: { escalation: CrmMessages["speed"]["escalation"]; common: Pick<CrmMessages["common"], "unnamed" | "unassigned" | "none"> };
}) {
  const e = t.escalation;
  if (items.length === 0) return <p className="text-sm text-muted">{e.empty}</p>;
  return (
    <div role="region" aria-label={e.title} tabIndex={0} className="overflow-x-auto rounded-control">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">{e.title}</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-3 font-bold">{e.columns.family}</th>
            <th scope="col" className="py-2 pr-3 font-bold">{e.columns.area}</th>
            <th scope="col" className="py-2 pr-3 font-bold">{e.columns.assignee}</th>
            <th scope="col" className="py-2 font-bold">{e.columns.due}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.leadId} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 pr-3 font-semibold">
                <Link
                  href={withBack(localePath(`/crm/leads/${encodeURIComponent(item.leadId)}`, locale), backPath)}
                  className="break-words text-blue hover:underline"
                >
                  {item.displayName?.trim() || t.common.unnamed}
                </Link>
              </th>
              <td className="py-2 pr-3">{item.areaId ? (areaNames[item.areaId] ?? item.areaId) : t.common.none}</td>
              <td className="py-2 pr-3">{item.assignee?.displayName || t.common.unassigned}</td>
              <td className="py-2">
                <time dateTime={isoOrUndefined(item.clock.dueAt)}>{slaTimeLabel(item.clock.dueAt, now, locale)}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
