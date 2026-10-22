"use client";

import { Phone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { SlaQueueItem } from "@/lib/crm/lead-ops-types";
import { maskPhone, withBack, type CrmMessages } from "../format";
import { SlaChip } from "../SlaChip";
import { countdownText, sourceText } from "./model";

/** Messages the list needs (serialisable from the server page). */
export type CallNowMessages = Pick<CrmMessages, "slaChip" | "sources"> & {
  callNow: CrmMessages["speed"]["callNow"];
  common: Pick<CrmMessages["common"], "unnamed" | "callLead" | "phoneEnding">;
};

const COUNTDOWN_TICK_MS = 30_000;

/**
 * "Call now" at the top of Today's calls (owner: LR-SLA; docs/lead-routing-plan.md §15, §20): the
 * viewer's families waiting for a first call, most urgent first, each with its first-call chip and
 * a live countdown ("due in 25 min" / "late by 10 min", refreshed every 30 s). "Call" opens the
 * lead's contact panel, where the full number is revealed and the call is logged (D-041).
 */
export function CallNowList({
  items,
  total,
  now,
  locale,
  areaNames,
  backPath,
  t,
}: {
  items: SlaQueueItem[];
  /** All waiting (the list shows at most 200). */
  total: number;
  /** The request time (first render), then the browser clock. */
  now: number;
  locale: Locale;
  /** Area id → name in the page's language. */
  areaNames: Readonly<Record<string, string>>;
  /** LOCALE-FREE page the lead's "Back" returns to. */
  backPath: string;
  t: CallNowMessages;
}) {
  const [clock, setClock] = useState(now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), COUNTDOWN_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (items.length === 0) return <p className="text-sm text-muted">{t.callNow.empty}</p>;
  const leadHref = (id: string, hash = "") => `${withBack(localePath(`/crm/leads/${encodeURIComponent(id)}`, locale), backPath)}${hash}`;

  return (
    <>
      <ol className="divide-y divide-line">
        {items.map((item) => {
          const name = item.displayName?.trim() || t.common.unnamed;
          const countdown = countdownText(t.callNow, item.clock.dueAt, clock);
          const state = clock >= Date.parse(item.clock.dueAt) && item.clock.state === "due" ? { ...item.clock, state: "overdue" as const } : item.clock;
          const area = item.areaId ? areaNames[item.areaId] : null;
          return (
            <li key={item.leadId} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={leadHref(item.leadId)} className="break-words font-bold text-blue hover:underline">
                    {name}
                  </Link>
                  <SlaChip clock={state} now={clock} locale={locale} t={t} />
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span className={cn("font-bold", countdown.late ? "text-[#8a1c14]" : "text-navy")}>{countdown.text}</span>
                  {item.phoneLast4 && (
                    <span className="whitespace-nowrap font-mono" lang="en">
                      <span aria-hidden="true">{maskPhone(item.phoneLast4)}</span>
                      <span className="sr-only">{format(t.common.phoneEnding, { last4: item.phoneLast4 })}</span>
                    </span>
                  )}
                  {area && <span>{area}</span>}
                  <span>{sourceText(t.sources, item.source)}</span>
                  {item.clock.reason === "import" && <span>{t.callNow.imported}</span>}
                </p>
              </div>
              <Link
                href={leadHref(item.leadId, "#crm-lead-contact")}
                aria-label={format(t.common.callLead, { name })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-[#b9cbe0] bg-white px-3 text-sm font-bold text-navy hover:border-blue"
              >
                <Phone aria-hidden="true" className="size-4" />
                {t.callNow.call}
              </Link>
            </li>
          );
        })}
      </ol>
      {total > items.length && <p className="mt-3 text-sm text-muted">{format(t.callNow.more, { count: total - items.length })}</p>}
    </>
  );
}
