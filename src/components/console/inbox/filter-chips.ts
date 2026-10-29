/**
 * Removable chips for every active Enquiries filter (docs/admin-phase-1b-plan.md §5.I; owner:
 * 1B-FAMILY). PURE and client-safe. Each chip links to the same list WITHOUT that one filter (page
 * reset); 1B-CORE's `consoleFilterChips` supplies the three console filters (contact, signups,
 * created) so their words stay in one place. Labels read "Stage: New".
 */
import { consoleFilterChips, inboxQuery, programLabel, sourceLabel, stageLabel, type CrmMessages, type FilterChip, type InboxFilters } from "@/components/crm/format";
import { format } from "@/i18n/format";
import type { FamilyMessages } from "../details/messages";

type Option = { value: string; label: string };

export interface ChipContext {
  t: CrmMessages;
  m: FamilyMessages["inbox"];
  /** Centre slug → name (unknown slugs are shown as they are). */
  centres: Readonly<Record<string, string>>;
  /** The words for `centre=none` ("No centre yet"). */
  noCentre: string;
  /** Staff the viewer may filter by (id → name). */
  assignees?: readonly Option[];
  /** Area filter options (id → name). */
  areas?: readonly Option[];
}

const optionLabel = (options: readonly Option[] | undefined, value: string) => options?.find((option) => option.value === value)?.label ?? value;

/** One chip per active filter, in the URL's order (search, stage, centre, …, then the console filters). */
export function inboxFilterChips(filters: InboxFilters, ctx: ChipContext): FilterChip[] {
  const { t, m } = ctx;
  const f = t.inbox;
  const chips: FilterChip[] = [];
  const add = (key: FilterChip["key"], field: string, value: string) => {
    const without: Partial<InboxFilters> = { page: 1 };
    without[key] = "";
    chips.push({ key, label: format(m.chip, { field, value }), removeQuery: inboxQuery(filters, without) });
  };
  if (filters.q) add("q", f.search, filters.q);
  if (filters.stage) add("stage", f.stage, filters.stage === "open" ? m.stageOpen : stageLabel(t, filters.stage));
  if (filters.centre) add("centre", f.centre, filters.centre === "none" ? ctx.noCentre : (ctx.centres[filters.centre] ?? filters.centre));
  if (filters.program) add("program", f.program, programLabel(t, filters.program) ?? filters.program);
  if (filters.source) add("source", f.source, sourceLabel(t, filters.source));
  if (filters.assignee) {
    const value = filters.assignee === "me" ? f.assigneeMe : filters.assignee === "unassigned" ? t.common.unassigned : optionLabel(ctx.assignees, filters.assignee);
    add("assignee", f.assignee, value);
  }
  if (filters.due) add("due", f.due, filters.due === "today" ? f.dueToday : f.dueOverdue);
  if (filters.area) {
    const value = filters.area === "none" ? f.areaNone : filters.area === "tool_signups" ? f.areaToolSignups : optionLabel(ctx.areas, filters.area);
    add("area", f.area, value);
  }
  if (filters.sla) add("sla", f.sla, filters.sla === "open" ? f.slaOpen : filters.sla === "overdue" ? f.slaOverdue : f.slaEscalated);
  chips.push(...consoleFilterChips(t, filters));
  return chips;
}
