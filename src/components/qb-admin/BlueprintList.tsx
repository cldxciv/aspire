"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { QbSlot } from "@/lib/qb/types";
import { qbRequests, type QbMessages } from "./api";
import { QbFeedback, smallButton, useQbAction, useQbData } from "./client-kit";
import { QB_ADMIN_SLOTS, type QbCapabilityMap } from "./constants";
import type { QbBlueprintDetail, QbBlueprintSummary } from "./contract";
import { formatDate } from "./format";
import { QbPanel } from "./QbBlocks";

const PAGE = "/admin/questions/blueprints";

const statusStyles = {
  draft: "bg-[#f1f3f6] text-[#4a5568]",
  published: "bg-success-soft text-[#14744d]",
  archived: "bg-[#f1f3f6] text-[#6b7685]",
} as const;

/** Blueprints by exam slot, newest version first; reviewers start a draft where a slot has none. */
export function BlueprintList({ t, locale, can }: { t: QbMessages; locale: Locale; can: QbCapabilityMap }) {
  const router = useRouter();
  const list = useQbData<QbBlueprintSummary[]>(qbRequests.blueprints(), t, PAGE);
  const action = useQbAction(t, PAGE);
  const b = t.blueprints;

  async function create(slot: QbSlot) {
    const created = await action.run<QbBlueprintDetail>(qbRequests.createBlueprint(slot));
    if (created) router.push(localePath(`/admin/questions/blueprints/${encodeURIComponent(created.blueprint.id)}`, locale));
  }

  if (list.error) return <p role="alert" className="font-semibold text-danger">{list.error}</p>;
  const data = list.data;
  if (!data) return <p role="status" className="text-muted">{t.common.loading}</p>;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <QbFeedback state={action} detailsLabel={t.common.details} />
      {QB_ADMIN_SLOTS.map((slot) => {
        const versions = data.filter((entry) => entry.slot === slot).sort((x, y) => y.version - x.version);
        const hasDraft = versions.some((entry) => entry.status === "draft");
        return (
          <QbPanel
            key={slot}
            id={`qb-slot-${slot}`}
            title={t.slots[slot]}
            action={
              can.edit_blueprint && !hasDraft ? (
                <button type="button" className={smallButton} disabled={action.pending} onClick={() => void create(slot)}>
                  {b.create}
                </button>
              ) : undefined
            }
          >
            {versions.length === 0 ? (
              <p className="text-sm text-muted">{b.empty}</p>
            ) : (
              <ul className="divide-y divide-line">
                {versions.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <Link href={localePath(`/admin/questions/blueprints/${encodeURIComponent(entry.id)}`, locale)} className="inline-flex min-h-11 items-center font-bold text-navy hover:text-blue hover:underline">
                      {format(b.version, { version: entry.version })}
                    </Link>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${statusStyles[entry.status]}`}>{b.statuses[entry.status]}</span>
                    {entry.placeholder && !entry.patternConfirmed && <span className="rounded-md bg-gold-soft px-2 py-0.5 text-xs font-bold text-[#7a5600]">{b.placeholder}</span>}
                    {entry.signedOff && <span className="text-xs text-success">{b.signedOff}</span>}
                    <span className="text-muted">{format(b.totals, entry.totals)}</span>
                    {entry.reviewDueAt && (
                      <span className={entry.reviewDueAt < today ? "text-xs font-semibold text-danger" : "text-xs text-muted"}>
                        {format(entry.reviewDueAt < today ? b.reviewOverdue : b.reviewDue, { date: formatDate(entry.reviewDueAt, locale) })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </QbPanel>
        );
      })}
    </div>
  );
}
