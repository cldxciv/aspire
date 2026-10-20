import { ArrowRight, Phone } from "lucide-react";
import Link from "next/link";
import { portalAreas } from "@/components/portal/areas";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import { EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { LeadSummary, MyTask } from "@/lib/crm/types";
import { DueLabel, MaskedPhone, RelativeTime, SourceBadges, StageBadge } from "./CrmBlocks";
import { centreLabel, classProgramLabel, phoneLast4, type CrmMessages } from "./format";
import { CompleteTaskButton, type LeadIslandMessages } from "./LeadActions";

export type TodayData = {
  overdue: MyTask[];
  dueToday: MyTask[];
  /** Stage `new`, assigned to the viewer. */
  fresh: LeadSummary[];
};

const PAGE_PATH = "/crm/today";

function leadLink(id: string, locale: Locale, hash = "") {
  return `${localePath(`/crm/leads/${encodeURIComponent(id)}`, locale)}${hash}`;
}

const quick =
  "inline-flex min-h-11 items-center gap-1.5 rounded-control border border-[#b9cbe0] bg-white px-3 text-sm font-bold text-navy hover:border-blue";

/**
 * The counsellor's day: overdue and due-today follow-ups (with "done" in place) and new leads
 * waiting for a first contact. "Call" goes to the lead's contact panel so the full number is
 * only revealed — and the call logged — on the lead page.
 */
export function TodayView({
  data,
  centres,
  now,
  locale,
  t,
}: {
  data: TodayData;
  centres: Readonly<Record<string, string>>;
  now: number;
  locale: Locale;
  t: CrmMessages;
}) {
  const d = t.today;
  const island: LeadIslandMessages = { common: t.common, errors: t.errors, stages: t.stages, lostReasons: t.lostReasons, lead: t.lead };
  const tiles = [
    { label: d.tiles.overdue, value: data.overdue.length, warn: data.overdue.length > 0 },
    { label: d.tiles.due, value: data.dueToday.length, warn: false },
    { label: d.tiles.fresh, value: data.fresh.length, warn: false },
  ];

  const taskList = (tasks: MyTask[], empty: string) =>
    tasks.length === 0 ? (
      <p className="text-sm text-muted">{empty}</p>
    ) : (
      <ul className="divide-y divide-line">
        {tasks.map((task) => {
          const name = task.leadDisplayName?.trim() || t.common.unnamed;
          return (
            <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
              <div className="min-w-0">
                <p className="break-words font-semibold text-ink">{task.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <Link href={leadLink(task.leadId, locale)} className="font-semibold text-blue hover:underline">
                    {name}
                  </Link>
                  <StageBadge stage={task.leadStage} t={t} />
                  <MaskedPhone last4={phoneLast4(task.leadPhone)} t={t} />
                </p>
                <p className="mt-1 text-sm">
                  <DueLabel dueAt={task.dueAt} now={now} locale={locale} t={t} />
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <Link href={leadLink(task.leadId, locale, "#crm-lead-contact")} className={quick} aria-label={format(t.common.callLead, { name })}>
                  <Phone aria-hidden="true" className="size-4" />
                  {t.lead.contact.call}
                </Link>
                <CompleteTaskButton taskId={task.id} title={task.title} t={island} pagePath={PAGE_PATH} />
              </div>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="space-y-5">
      <section>
        <h2 className="sr-only">{d.summaryLabel}</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className={cn(
                "rounded-control border border-t-4 border-line bg-white p-4 shadow-soft",
                tile.warn ? "border-t-[#e9b431]" : portalAreas.staff.tileAccent,
              )}
            >
              <dt className="text-xs font-semibold text-muted">{tile.label}</dt>
              <dd className="mt-1 text-[27px] font-extrabold leading-tight text-navy">{tile.value}</dd>
              <dd className="text-xs text-muted">{d.tileNote}</dd>
            </div>
          ))}
        </dl>
      </section>

      <PortalPanel id="crm-today-overdue" title={d.overdueTitle}>
        {taskList(data.overdue, d.overdueEmpty)}
      </PortalPanel>

      <PortalPanel id="crm-today-due" title={d.dueTitle}>
        {taskList(data.dueToday, d.dueEmpty)}
      </PortalPanel>

      <PortalPanel id="crm-today-new" title={d.newTitle}>
        {data.fresh.length === 0 ? (
          <EmptyState title={d.newEmpty} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {data.fresh.map((lead) => {
              const name = lead.displayName?.trim() || t.common.unnamed;
              const detail = [classProgramLabel(t, lead.currentClass, lead.programInterest), centreLabel(t, centres, lead.centreSlug)]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={lead.id} className="rounded-control border border-line p-4">
                  <h3 className="break-words font-bold">
                    <Link href={leadLink(lead.id, locale)} className="text-blue hover:underline">
                      {name}
                    </Link>
                  </h3>
                  {detail && <p className="mt-1 text-sm text-muted">{detail}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <SourceBadges source={lead.source} tool={lead.tool} t={t} />
                    <MaskedPhone last4={phoneLast4(lead.phone)} t={t} />
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    <RelativeTime value={lead.createdAt} locale={locale} />
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={leadLink(lead.id, locale, "#crm-lead-contact")} className={quick} aria-label={format(t.common.callLead, { name })}>
                      <Phone aria-hidden="true" className="size-4" />
                      {t.lead.contact.call}
                    </Link>
                    <Link href={leadLink(lead.id, locale)} className={quick}>
                      {d.openLead}
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PortalPanel>
    </div>
  );
}
