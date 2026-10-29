/**
 * Enquiries quick views (docs/admin-phase-1b-plan.md §5.I; owner: 1B-FAMILY). PURE and client-safe:
 * each preset is a set of ordinary inbox filters, so its link is a plain `/crm?…` URL that
 * `parseInboxFilters` (the page) and `leadFiltersFromSearch` (the API) read back unchanged.
 *
 * | My new          | assignee=me&stage=new                        | everyone                    |
 * | Not called yet  | stage=new&contact=none&signups=hide          | everyone                    |
 * | Due today       | due=today                                    | everyone                    |
 * | Overdue         | due=overdue&stage=open                       | everyone                    |
 * | Unassigned      | assignee=unassigned&stage=open&signups=hide  | managers and admins         |
 * | This centre     | centre=<slug> (effective centre)             | one per centre in scope, ≤ 4 |
 * | Free tool users | area=tool_signups&stage=open (LR's queue)    | admins (incl. super admins) |
 */
import { EMPTY_FILTERS, INBOX_FILTER_KEYS, inboxQuery, type InboxFilters } from "@/components/crm/format";
import { format } from "@/i18n/format";
import type { FamilyMessages } from "../details/messages";

export const INBOX_PRESET_KINDS = ["my_new", "not_called", "due_today", "overdue", "unassigned", "centre", "tool_users"] as const;
export type InboxPresetKind = (typeof INBOX_PRESET_KINDS)[number];

/** "This centre" chips are offered only when the viewer's scope has this many centres or fewer. */
export const CENTRE_PRESET_MAX = 4;

export interface InboxPreset {
  /** Unique: the kind, or `centre:<slug>`. */
  key: string;
  kind: InboxPresetKind;
  label: string;
  filters: InboxFilters;
  /** Leading "?" (never empty: every preset filters). */
  query: string;
}

export interface PresetViewer {
  role: "admin" | "manager" | "counsellor";
}

const filters = (values: Partial<InboxFilters>): InboxFilters => ({ ...EMPTY_FILTERS, ...values });

/**
 * The quick views this viewer gets. `centres` = the centres in the viewer's scope (slug + label in
 * the page language); "This centre" chips appear only when there are 1–4 of them.
 */
export function inboxPresets(viewer: PresetViewer, centres: readonly { slug: string; label: string }[], m: FamilyMessages["inbox"]): InboxPreset[] {
  const head = viewer.role === "admin" || viewer.role === "manager";
  const list: Omit<InboxPreset, "query">[] = [
    { key: "my_new", kind: "my_new", label: m.presets.my_new, filters: filters({ assignee: "me", stage: "new" }) },
    { key: "not_called", kind: "not_called", label: m.presets.not_called, filters: filters({ stage: "new", contact: "none", signups: "hide" }) },
    { key: "due_today", kind: "due_today", label: m.presets.due_today, filters: filters({ due: "today" }) },
    { key: "overdue", kind: "overdue", label: m.presets.overdue, filters: filters({ due: "overdue", stage: "open" }) },
  ];
  if (head) {
    list.push({ key: "unassigned", kind: "unassigned", label: m.presets.unassigned, filters: filters({ assignee: "unassigned", stage: "open", signups: "hide" }) });
  }
  if (centres.length > 0 && centres.length <= CENTRE_PRESET_MAX) {
    for (const centre of centres) {
      list.push({ key: `centre:${centre.slug}`, kind: "centre", label: format(m.centrePresetLabel, { centre: centre.label }), filters: filters({ centre: centre.slug }) });
    }
  }
  if (viewer.role === "admin") {
    list.push({ key: "tool_users", kind: "tool_users", label: m.presets.tool_users, filters: filters({ area: "tool_signups", stage: "open" }) });
  }
  return list.map((preset) => ({ ...preset, query: inboxQuery(preset.filters) }));
}

/** The preset whose filters are exactly the current ones (the page number aside), or null. */
export function activePresetKey(presets: readonly InboxPreset[], current: InboxFilters): string | null {
  const same = (a: InboxFilters, b: InboxFilters) => INBOX_FILTER_KEYS.every((key) => (a[key] ?? "") === (b[key] ?? ""));
  return presets.find((preset) => same(preset.filters, current))?.key ?? null;
}
