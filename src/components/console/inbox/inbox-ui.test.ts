import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/crm",
  useSearchParams: () => new URLSearchParams(),
}));

import { EMPTY_FILTERS, inboxQuery, parseInboxFilters, toLeadFilters, type InboxFilters } from "@/components/crm/format";
import { InboxControls, InboxFiltersForm, LeadList } from "@/components/crm/InboxView";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { leadFiltersFromSearch } from "@/lib/crm/http";
import { crmPermissions, type LeadSummary } from "@/lib/crm/types";
import { familyMessages } from "../details/messages";
import { inboxFilterChips } from "./filter-chips";
import { activePresetKey, CENTRE_PRESET_MAX, inboxPresets, type PresetViewer } from "./presets";

// 1B-FAMILY (docs/admin-phase-1b-plan.md §5.I): Enquiries quick views, removable filter chips and
// the folded filter form. Synthetic data only.

const LOCALES: Locale[] = ["en", "hi"];
const CENTRES = [
  { slug: "shimla", label: "Shimla" },
  { slug: "hamirpur", label: "Hamirpur" },
];

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

const keysOf = (role: PresetViewer["role"], centres = CENTRES) => inboxPresets({ role }, centres, familyMessages("en").inbox).map((preset) => preset.key);

describe("quick views (§5.I)", () => {
  it("match the plan's table exactly", () => {
    const presets = inboxPresets({ role: "admin" }, CENTRES, familyMessages("en").inbox);
    expect(Object.fromEntries(presets.map((preset) => [preset.key, preset.query]))).toEqual({
      my_new: "?stage=new&assignee=me",
      not_called: "?stage=new&contact=none&signups=hide",
      due_today: "?due=today",
      overdue: "?stage=open&due=overdue",
      unassigned: "?stage=open&assignee=unassigned&signups=hide",
      "centre:shimla": "?centre=shimla",
      "centre:hamirpur": "?centre=hamirpur",
      tool_users: "?stage=open&area=tool_signups",
    });
  });

  it("every preset round-trips through parseInboxFilters (the page) and leadFiltersFromSearch (the API)", () => {
    for (const role of ["admin", "manager", "counsellor"] as const) {
      for (const preset of inboxPresets({ role }, CENTRES, familyMessages("en").inbox)) {
        const search = new URLSearchParams(preset.query.slice(1));
        expect(parseInboxFilters(search), preset.key).toEqual(preset.filters);
        const { sort, ...expected } = toLeadFilters(preset.filters);
        expect(sort).toBe("recent_activity");
        expect(leadFiltersFromSearch(search), preset.key).toEqual(expected);
      }
    }
  });

  it("are gated by role; 'This centre' only for 1–4 centres in scope", () => {
    expect(keysOf("counsellor", [])).toEqual(["my_new", "not_called", "due_today", "overdue"]);
    expect(keysOf("manager", [])).toEqual(["my_new", "not_called", "due_today", "overdue", "unassigned"]);
    expect(keysOf("admin", [])).toEqual(["my_new", "not_called", "due_today", "overdue", "unassigned", "tool_users"]);
    expect(keysOf("manager")).toContain("centre:shimla");
    const five = Array.from({ length: CENTRE_PRESET_MAX + 1 }, (_, index) => ({ slug: `centre-${index}`, label: `Centre ${index}` }));
    expect(keysOf("admin", five).some((key) => key.startsWith("centre:"))).toBe(false);
    expect(keysOf("admin", five.slice(0, CENTRE_PRESET_MAX)).filter((key) => key.startsWith("centre:"))).toHaveLength(CENTRE_PRESET_MAX);
  });

  it("marks the preset that equals the current filters (page aside), and none otherwise", () => {
    const presets = inboxPresets({ role: "manager" }, CENTRES, familyMessages("en").inbox);
    expect(activePresetKey(presets, parseInboxFilters({ stage: "new", contact: "none", signups: "hide", page: "3" }))).toBe("not_called");
    expect(activePresetKey(presets, parseInboxFilters({ centre: "shimla" }))).toBe("centre:shimla");
    expect(activePresetKey(presets, parseInboxFilters({ stage: "new", contact: "none" }))).toBeNull();
    expect(activePresetKey(presets, EMPTY_FILTERS)).toBeNull();
  });
});

describe.each(LOCALES)("filter chips and the Enquiries controls (%s)", (locale) => {
  const t = messagesFor(locale, "crm");
  const m = familyMessages(locale).inbox;
  const prefix = locale === "hi" ? "/hi" : "";
  const options = {
    centres: [{ value: "shimla", label: "Shimla" }],
    programs: [],
    sources: [],
    assignees: [{ value: "u2", label: "Counsellor Two" }],
    areas: [{ value: "kangra", label: "Kangra" }],
  };

  it("gives every active filter a chip that removes only that filter", () => {
    const filters: InboxFilters = parseInboxFilters({
      q: "riya",
      stage: "open",
      centre: "shimla",
      program: "jee",
      source: "walk_in",
      assignee: "u2",
      due: "overdue",
      area: "kangra",
      sla: "escalated",
      contact: "none",
      signups: "hide",
      created: "week",
      page: "2",
    });
    const chips = inboxFilterChips(filters, { t, m, centres: { shimla: "Shimla" }, noCentre: "—", assignees: options.assignees, areas: options.areas });
    expect(chips.map((chip) => chip.key)).toEqual(["q", "stage", "centre", "program", "source", "assignee", "due", "area", "sla", "contact", "signups", "created"]);
    for (const chip of chips) {
      expect(chip.removeQuery, chip.key).toBe(inboxQuery(filters, { [chip.key]: "", page: 1 } as Partial<InboxFilters>));
      expect(new URLSearchParams(chip.removeQuery.slice(1)).has(chip.key), chip.key).toBe(false);
      expect(new URLSearchParams(chip.removeQuery.slice(1)).has("page"), chip.key).toBe(false);
    }
    const label = (key: string) => chips.find((chip) => chip.key === key)?.label;
    expect(label("stage")).toBe(`${t.inbox.stage}: ${m.stageOpen}`);
    expect(label("centre")).toBe(`${t.inbox.centre}: Shimla`);
    expect(label("assignee")).toBe(`${t.inbox.assignee}: Counsellor Two`);
    expect(label("area")).toBe(`${t.inbox.area}: Kangra`);
    expect(label("sla")).toBe(`${t.inbox.sla}: ${t.inbox.slaEscalated}`);
    expect(label("contact")).toBe(t.inbox.chips.contactNone);
    expect(inboxFilterChips(parseInboxFilters({ centre: "none", assignee: "me" }), { t, m, centres: {}, noCentre: "No centre yet" }).map((chip) => chip.label)).toEqual([
      `${t.inbox.centre}: No centre yet`,
      `${t.inbox.assignee}: ${t.inbox.assigneeMe}`,
    ]);
    expect(inboxFilterChips(EMPTY_FILTERS, { t, m, centres: {}, noCentre: "—" })).toEqual([]);
  });

  it("renders quick views (one aria-current), removable chips with Clear all, and the folded form", () => {
    const filters = parseInboxFilters({ stage: "new", contact: "none", signups: "hide" });
    const html = inLocale(
      locale,
      createElement(InboxControls, { filters, options, permissions: crmPermissions({ role: "manager" }), presets: { viewer: { role: "manager" }, centres: CENTRES }, locale, t }),
    );
    expect(html).toContain(`<nav aria-label="${esc(m.presetsLabel)}"`);
    expect(html.split('aria-current="page"').length - 1).toBe(1);
    expect(html).toMatch(new RegExp(`<a aria-current="page"[^>]*href="${prefix}/crm\\?stage=new&amp;contact=none&amp;signups=hide"`));
    for (const label of [m.presets.my_new, m.presets.not_called, m.presets.due_today, m.presets.overdue, m.presets.unassigned]) expect(html).toContain(esc(label));
    expect(html).not.toContain(esc(m.presets.tool_users));
    expect(html).toContain(esc(m.centrePresetLabel.replace("{centre}", "Shimla")));
    // Chips: one link per active filter, named "Remove filter …", plus Clear all.
    const stageChip = `${t.inbox.stage}: ${t.stages.new}`;
    expect(html).toContain(`aria-label="${esc(t.inbox.chips.remove.replace("{filter}", stageChip))}"`);
    expect(html).toContain(`href="${prefix}/crm?contact=none&amp;signups=hide"`);
    expect(html).toContain(`href="${prefix}/crm?stage=new&amp;signups=hide"`);
    expect(html).toContain(`href="${prefix}/crm?stage=new&amp;contact=none"`);
    expect(html).toContain(`>${esc(t.inbox.chips.clearAll)}</a>`);
    // The form folds into "Filters (3 on)"; its fields stay labelled.
    // Closed in the markup; open from lg on the first paint only (then an ordinary disclosure).
    expect(html).toMatch(/<details class="group[^"]*lg:data-first-paint:details-content:\[content-visibility:visible\][^"]*" data-first-paint=""><summary/);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain(esc(m.filtersOn.replace("{n}", "3")));
    expect(html).toContain(`<h2 id="crm-inbox-filters" class="sr-only">`);
    for (const id of ["crm-q", "crm-stage", "crm-centre", "crm-assignee"]) expect(html).toContain(`for="${id}"`);
    // Applying the form keeps the quick view's filters the form has no field for.
    expect(html).toContain('<input type="hidden" name="contact" value="none"/>');
    expect(html).toContain('<input type="hidden" name="signups" value="hide"/>');
    expect(html).not.toContain('name="created"');
    const fromDashboard = inLocale(locale, createElement(InboxFiltersForm, { filters: parseInboxFilters({ created: "week" }), options, permissions: crmPermissions({ role: "manager" }), locale, t }));
    expect(fromDashboard).toContain('<input type="hidden" name="created" value="week"/>');
    const pipeline = inLocale(locale, createElement(InboxFiltersForm, { filters: parseInboxFilters({ created: "week" }), options, permissions: crmPermissions({ role: "manager" }), locale, t, mode: "pipeline" }));
    expect(pipeline).not.toContain('type="hidden"');
  });

  it("shows an area-routed lead with no centre of its own under its area's centre, marked 'from area'", () => {
    const lead: LeadSummary = {
      id: "lead-1",
      stage: "new",
      lostReason: null,
      displayName: "Synthetic Student",
      studentName: "Synthetic Student",
      guardianName: null,
      phone: "+919600000001",
      centreSlug: null,
      effectiveCentreSlug: "shimla",
      programInterest: null,
      currentClass: null,
      source: "admissions",
      tool: null,
      assignee: null,
      createdAt: "2026-10-18T05:00:00.000Z",
      updatedAt: "2026-10-18T05:00:00.000Z",
      lastActivityAt: "2026-10-18T05:00:00.000Z",
      nextTaskDueAt: null,
      overdue: false,
      submissionCount: 1,
      erased: false,
    };
    const ctx = { centres: { shimla: "Shimla" }, viewerId: "u1", now: Date.parse("2026-10-21T06:00:00.000Z"), locale, t };
    const fromArea = esc(m.centreFromArea.replace("{centre}", "Shimla"));
    const html = inLocale(locale, createElement(LeadList, { page: { items: [lead], total: 1, page: 1, pageSize: 25 }, filters: parseInboxFilters({ centre: "shimla" }), ctx }));
    expect(html.split(fromArea).length - 1).toBe(2); // table row and card
    const own = inLocale(locale, createElement(LeadList, { page: { items: [{ ...lead, centreSlug: "shimla" }], total: 1, page: 1, pageSize: 25 }, filters: EMPTY_FILTERS, ctx }));
    expect(own).not.toContain(fromArea);
    expect(own).toContain(">Shimla<");
  });

  it("an unfiltered list: no chips, 'Filters' without a count, nothing current", () => {
    const html = inLocale(locale, createElement(InboxControls, { filters: EMPTY_FILTERS, options, permissions: crmPermissions({ role: "counsellor" }), presets: { viewer: { role: "counsellor" }, centres: [] }, locale, t }));
    expect(html).not.toContain(esc(t.inbox.chips.clearAll));
    expect(html).not.toContain('aria-current="page"');
    expect(html).toContain(`<span>${esc(m.filters)}</span>`);
    expect(html).not.toContain(esc(m.presets.unassigned));
    // The pipeline keeps its plain, always-open form.
    const pipeline = inLocale(locale, createElement(InboxFiltersForm, { filters: EMPTY_FILTERS, options, permissions: crmPermissions({ role: "manager" }), locale, t, mode: "pipeline" }));
    expect(pipeline).not.toContain("<details");
    expect(pipeline).toContain(esc(t.inbox.filtersTitle));
  });
});
