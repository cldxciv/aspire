import Form from "next/form";
import Link from "next/link";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import { EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { LEAD_STAGES, type CrmPermissions, type LeadPage, type LeadSummary } from "@/lib/crm/types";
import { DueLabel, MaskedPhone, Pagination, RelativeTime, SourceBadges, StageBadge } from "./CrmBlocks";
import {
  centreLabel,
  classProgramLabel,
  hasActiveFilters,
  inboxQuery,
  leadCountLabel,
  phoneLast4,
  type CrmMessages,
  type InboxFilters,
} from "./format";
import type { Option } from "./types";

export type InboxOptions = {
  centres: Option[];
  programs: Option[];
  sources: Option[];
  /** Staff the viewer may filter by (managers / admins); counsellors only see "me". */
  assignees: Option[];
};

const selectClasses =
  "min-h-11 w-full rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px] text-ink";

/**
 * Inbox filters as a GET form (`next/form`): the URL is the saved filter, so a filtered inbox can
 * be bookmarked or shared with a colleague, and the form works before JavaScript loads.
 */
export function InboxFiltersForm({
  filters,
  options,
  permissions,
  locale,
  t,
  mode = "inbox",
}: {
  filters: InboxFilters;
  options: InboxOptions;
  permissions: CrmPermissions;
  locale: Locale;
  t: CrmMessages;
  /** The pipeline reuses the form without the stage and follow-up filters (columns are stages). */
  mode?: "inbox" | "pipeline";
}) {
  const f = t.inbox;
  const inbox = mode === "inbox";
  const action = localePath(inbox ? "/crm" : "/crm/pipeline", locale);
  const field = (id: string, label: string, control: React.ReactNode) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-navy">
        {label}
      </label>
      {control}
    </div>
  );
  return (
    <section aria-labelledby="crm-inbox-filters" className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
      <h2 id="crm-inbox-filters" className="mb-3 text-base font-extrabold text-navy">
        {f.filtersTitle}
      </h2>
      <Form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="crm-q" className="text-sm font-bold text-navy">
            {f.search}
          </label>
          <input
            id="crm-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            maxLength={80}
            aria-describedby="crm-q-hint"
            className={selectClasses}
          />
          <p id="crm-q-hint" className="text-xs text-muted">
            {f.searchHint}
          </p>
        </div>
        {inbox && field(
          "crm-stage",
          f.stage,
          <select id="crm-stage" name="stage" defaultValue={filters.stage} className={selectClasses}>
            <option value="">{t.common.any}</option>
            {LEAD_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {t.stages[stage]}
              </option>
            ))}
          </select>,
        )}
        {inbox && field(
          "crm-due",
          f.due,
          <select id="crm-due" name="due" defaultValue={filters.due} className={selectClasses}>
            <option value="">{f.dueAny}</option>
            <option value="today">{f.dueToday}</option>
            <option value="overdue">{f.dueOverdue}</option>
          </select>,
        )}
        {field(
          "crm-centre",
          f.centre,
          <select id="crm-centre" name="centre" defaultValue={filters.centre} className={selectClasses}>
            <option value="">{t.common.any}</option>
            {options.centres.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>,
        )}
        {field(
          "crm-program",
          f.program,
          <select id="crm-program" name="program" defaultValue={filters.program} className={selectClasses}>
            <option value="">{t.common.any}</option>
            {options.programs.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>,
        )}
        {field(
          "crm-source",
          f.source,
          <select id="crm-source" name="source" defaultValue={filters.source} className={selectClasses}>
            <option value="">{t.common.any}</option>
            {options.sources.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>,
        )}
        {permissions.canAssign &&
          field(
            "crm-assignee",
            f.assignee,
            <select id="crm-assignee" name="assignee" defaultValue={filters.assignee} className={selectClasses}>
              <option value="">{t.common.any}</option>
              <option value="me">{f.assigneeMe}</option>
              <option value="unassigned">{t.common.unassigned}</option>
              {options.assignees.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>,
          )}
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-navy px-4 text-sm font-bold text-white hover:bg-navy-2"
          >
            {t.common.apply}
          </button>
          {hasActiveFilters(filters) && (
            <Link
              href={action}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-[#b9cbe0] bg-white px-4 text-sm font-bold text-navy hover:border-blue"
            >
              {t.common.clear}
            </Link>
          )}
        </div>
      </Form>
    </section>
  );
}

export type InboxRowContext = {
  centres: Readonly<Record<string, string>>;
  viewerId: string;
  /** Counsellors only ever see their own leads (empty-state wording). */
  counsellor?: boolean;
  now: number;
  locale: Locale;
  t: CrmMessages;
};

function displayName(t: CrmMessages, lead: LeadSummary): string {
  if (lead.erased) return t.common.erased;
  return lead.displayName?.trim() || t.common.unnamed;
}

function assigneeText(lead: LeadSummary, ctx: InboxRowContext): string {
  if (!lead.assignee) return ctx.t.common.unassigned;
  return lead.assignee.userId === ctx.viewerId ? ctx.t.common.you : lead.assignee.displayName;
}

/**
 * The lead list: a real table from `md` up (scrolls inside its own container, never the page)
 * and a card list below. Phones are masked to the last four digits; the full number is only on
 * the lead page (whose view is audited).
 */
export function LeadList({ page, filters, ctx }: { page: LeadPage; filters: InboxFilters; ctx: InboxRowContext }) {
  const { t, locale } = ctx;
  const c = t.inbox.columns;
  const pages = Math.max(1, Math.ceil(page.total / Math.max(1, page.pageSize)));
  const base = localePath("/crm", locale);
  const href = (n: number) => `${base}${inboxQuery(filters, { page: n })}`;
  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.total, page.page * page.pageSize);

  return (
    <PortalPanel
      id="crm-inbox-list"
      title={leadCountLabel(t, page.total)}
      description={page.total > 0 ? format(t.common.showing, { from, to, total: page.total }) : undefined}
    >
      {page.items.length === 0 ? (
        hasActiveFilters(filters) ? (
          <EmptyState title={t.inbox.noMatchTitle} description={t.inbox.noMatchBody} />
        ) : (
          <EmptyState title={t.inbox.emptyTitle} description={ctx.counsellor ? t.inbox.emptyCounsellorBody : t.inbox.emptyBody} />
        )
      ) : (
        <>
          <div
            className="relative hidden overflow-x-auto rounded-control border border-line md:block"
            role="region"
            aria-labelledby="crm-inbox-list"
            tabIndex={0}
          >
            <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
              <caption className="sr-only">{t.inbox.tableCaption}</caption>
              <thead className="bg-[#f4f7fb] text-xs uppercase tracking-wide text-[#354b66]">
                <tr>
                  {[c.name, c.guardian, c.phone, c.program, c.centre, c.source, c.stage, c.assignee, c.nextTask, c.lastActivity].map(
                    (label) => (
                      <th key={label} scope="col" className="whitespace-nowrap px-3 py-2.5 font-bold">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {page.items.map((lead) => (
                  <InboxRow key={lead.id} lead={lead} ctx={ctx} />
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {page.items.map((lead) => (
              <InboxCard key={lead.id} lead={lead} ctx={ctx} />
            ))}
          </ul>
          <Pagination
            page={page.page}
            pages={pages}
            prevHref={page.page > 1 ? href(page.page - 1) : null}
            nextHref={page.page < pages ? href(page.page + 1) : null}
            t={t}
          />
        </>
      )}
    </PortalPanel>
  );
}

function leadHref(id: string, locale: Locale) {
  return localePath(`/crm/leads/${encodeURIComponent(id)}`, locale);
}

function InboxRow({ lead, ctx }: { lead: LeadSummary; ctx: InboxRowContext }) {
  const { t, locale, now, centres } = ctx;
  const name = displayName(t, lead);
  return (
    <tr className={cn("align-top hover:bg-[#f8fbff]", lead.overdue && "bg-[#fffaf0]")}>
      <th scope="row" className="px-3 py-3 font-semibold">
        <Link href={leadHref(lead.id, locale)} className="text-blue hover:underline" aria-label={format(t.common.openLead, { name })}>
          {name}
        </Link>
      </th>
      <td className="px-3 py-3">{lead.guardianName ?? <span className="text-muted">{t.common.none}</span>}</td>
      <td className="px-3 py-3">
        <MaskedPhone last4={phoneLast4(lead.phone)} t={t} />
      </td>
      <td className="px-3 py-3">{classProgramLabel(t, lead.currentClass, lead.programInterest) ?? <span className="text-muted">{t.common.none}</span>}</td>
      <td className="px-3 py-3">{centreLabel(t, centres, lead.centreSlug) ?? <span className="text-muted">{t.common.none}</span>}</td>
      <td className="px-3 py-3">
        <SourceBadges source={lead.source} tool={lead.tool} t={t} />
      </td>
      <td className="px-3 py-3">
        <StageBadge stage={lead.stage} t={t} />
      </td>
      <td className="px-3 py-3">{assigneeText(lead, ctx)}</td>
      <td className="px-3 py-3">
        <DueLabel dueAt={lead.nextTaskDueAt} now={now} locale={locale} t={t} empty={t.inbox.noTask} />
      </td>
      <td className="px-3 py-3 text-muted">
        <RelativeTime value={lead.lastActivityAt} locale={locale} />
      </td>
    </tr>
  );
}

function InboxCard({ lead, ctx }: { lead: LeadSummary; ctx: InboxRowContext }) {
  const { t, locale, now, centres } = ctx;
  const c = t.inbox.columns;
  const name = displayName(t, lead);
  const centre = centreLabel(t, centres, lead.centreSlug);
  const program = classProgramLabel(t, lead.currentClass, lead.programInterest);
  return (
    <li className={cn("rounded-control border border-line bg-white p-4", lead.overdue && "border-l-4 border-l-[#e9b431]")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-bold">
          <Link href={leadHref(lead.id, locale)} className="text-blue hover:underline">
            {name}
          </Link>
        </h3>
        <StageBadge stage={lead.stage} t={t} />
      </div>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {lead.guardianName && (
          <>
            <dt className="text-muted">{c.guardian}</dt>
            <dd className="min-w-0 break-words">{lead.guardianName}</dd>
          </>
        )}
        <dt className="text-muted">{c.phone}</dt>
        <dd>
          <MaskedPhone last4={phoneLast4(lead.phone)} t={t} />
        </dd>
        {program && (
          <>
            <dt className="text-muted">{c.program}</dt>
            <dd>{program}</dd>
          </>
        )}
        {centre && (
          <>
            <dt className="text-muted">{c.centre}</dt>
            <dd>{centre}</dd>
          </>
        )}
        <dt className="text-muted">{c.source}</dt>
        <dd>
          <SourceBadges source={lead.source} tool={lead.tool} t={t} />
        </dd>
        <dt className="text-muted">{c.assignee}</dt>
        <dd>{assigneeText(lead, ctx)}</dd>
        <dt className="text-muted">{c.nextTask}</dt>
        <dd>
          <DueLabel dueAt={lead.nextTaskDueAt} now={now} locale={locale} t={t} empty={t.inbox.noTask} />
        </dd>
        <dt className="text-muted">{c.lastActivity}</dt>
        <dd className="text-muted">
          <RelativeTime value={lead.lastActivityAt} locale={locale} />
        </dd>
      </dl>
    </li>
  );
}
