import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { AttentionItem } from "@/lib/crm/console/types";
import { consoleCommon, formatCount } from "../shared/messages";
import { numbersMessages, type NumbersMessages } from "./labels";
import type { NumbersVariant } from "./CentreNumbers";

/** The words of one attention row. Overdue rows: a person, nobody assigned (`userId: null`) or everyone (no `userId`). */
export function attentionLabel(item: AttentionItem, m: NumbersMessages): string {
  const rows = m.attention.rows;
  switch (item.kind) {
    case "unassigned":
      return rows.unassigned;
    case "tool_signups":
      return rows.toolSignups;
    case "not_called_24h":
      return rows.notCalled24;
    case "lost_to_review":
      return rows.lostToReview;
    case "overdue_by_counsellor":
      if (item.userId === undefined) return rows.overdueEveryone;
      if (item.userId === null) return rows.overdueUnassigned;
      return format(rows.overdueBy, { name: item.name?.trim() || m.attention.unknownName });
  }
}

/**
 * Needs attention (docs/admin-phase-1b-plan.md §5.A, §6.2; owner: 1B-NUMBERS): one link per row
 * with a count above 0 (the service drops the rest), each opening its list; "Nothing needs
 * attention right now." when there is none. Icon plus text, never colour alone. Server- and
 * client-safe. `items: null` is the data-free preview ("—", no database read).
 */
export function NeedsAttention({ items, variant, locale }: { items: AttentionItem[] | null; variant: NumbersVariant; locale: Locale }) {
  const m = numbersMessages(locale);
  const common = consoleCommon(locale);
  const titleId = `console-attention-${variant}`;
  return (
    <section aria-labelledby={titleId} className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-lg font-extrabold text-navy">
          {m.attention.title}
        </h2>
        {!items && <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted">{common.common.preview}</span>}
      </div>
      {!items ? (
        <p className="mt-3 text-2xl font-extrabold text-navy">{common.common.previewValue}</p>
      ) : items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
          {m.attention.nothing}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">{m.attention.lead}</p>
          <ul className="mt-3 divide-y divide-line rounded-control border border-line">
            {items.map((item, index) => {
              const label = attentionLabel(item, m);
              const count = formatCount(item.count, locale);
              return (
                <li key={`${item.kind}-${item.userId === undefined ? "all" : (item.userId ?? "none")}-${index}`}>
                  <Link
                    href={localePath(item.href, locale)}
                    className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm hover:bg-surface"
                  >
                    <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-[#8a5a00]" />
                    <span className="min-w-0 flex-1 font-semibold text-navy">{label}</span>
                    <span className="font-extrabold tabular-nums text-navy">{count}</span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
