import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import type { MetaInboxItem } from "@/lib/crm/meta/types";
import { formatWhen, inboxErrorText, type MetaMessages } from "./model";

/**
 * Meta lead ids that need a super admin's eye (failed, no longer on Meta, held, waiting): ids and
 * fixed codes only — the family's answers are never kept in the inbox. An `invalid_phone` row keeps
 * its Meta lead id so the lead can be found in Leads Center. "Retry failed leads" is one of the
 * connection actions. Server-safe.
 */
export function FailedLeadsList({ items, locale, m }: { items: readonly MetaInboxItem[]; locale: Locale; m: MetaMessages }) {
  const t = m.inbox;
  return (
    <section aria-labelledby="meta-inbox-heading" className="space-y-4 rounded-card border border-line bg-white p-5 shadow-soft">
      <div>
        <h2 id="meta-inbox-heading" className="text-lg font-extrabold text-navy">
          {t.heading}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.lead}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink">{t.empty}</p>
      ) : (
        <div role="region" aria-labelledby="meta-inbox-heading" tabIndex={0} className="overflow-x-auto rounded-control">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">{t.caption}</caption>
            <thead>
              <tr className="border-b border-line text-navy">
                <th scope="col" className="py-2 pr-3">
                  {t.id}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t.status}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t.problem}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t.attempts}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t.received}
                </th>
                <th scope="col" className="py-2">
                  {t.crmLead}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.leadgenId} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pr-3 font-mono text-xs font-semibold text-ink">
                    {item.leadgenId}
                    <span className="block font-sans font-normal text-muted">{t.vias[item.via]}</span>
                  </th>
                  <td className="py-2 pr-3 text-ink">{m.status.counts[item.status]}</td>
                  <td className="py-2 pr-3 text-ink">{inboxErrorText(item.lastError, m)}</td>
                  <td className="py-2 pr-3 text-ink">{item.attempts}</td>
                  <td className="py-2 pr-3 text-ink">{formatWhen(item.receivedAt, locale, "")}</td>
                  <td className="py-2">
                    {item.leadId ? (
                      <Link href={localePath(`/crm/leads/${encodeURIComponent(item.leadId)}`, locale)} className="font-bold text-blue underline-offset-2 hover:underline focus-visible:underline">
                        {t.openLead}
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
