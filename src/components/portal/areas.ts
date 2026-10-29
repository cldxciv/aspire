import {
  ArchiveRestore,
  Award,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  Compass,
  FileQuestion,
  Gauge,
  GraduationCap,
  HeartHandshake,
  History,
  Inbox,
  LayoutDashboard,
  ListOrdered,
  MessageSquareText,
  MonitorCheck,
  Megaphone,
  Route,
  SearchCheck,
  Settings2,
  ShieldCheck,
  SquareKanban,
  Target,
  TrendingUp,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Messages } from "@/i18n/messages/types";
import type { Role } from "@/lib/auth/roles";

export type PortalNavKey = Exclude<keyof Messages<"portal">["nav"], "sectionsLabel">;
/** Sidebar group headings (`portal.navGroups`). */
export type PortalNavGroupKey = keyof Messages<"portal">["navGroups"];
/**
 * Staff (CRM) sidebar keys: labels come from the `crm` messages (`crm.nav`), except the plain
 * console names in `portal.crmNav` ("Enquiries", "Today's calls"), which win.
 */
export type CrmNavKey = keyof Messages<"crm">["nav"];
export type AnyPortalNavKey = PortalNavKey | CrmNavKey;

/**
 * Portal areas. `staff` is the admissions CRM at `/crm` (D-038); it joins `Role` once the core
 * `staff` role exists, and `Role | "staff"` keeps this type stable before and after.
 */
export type PortalArea = Role | "staff";

/**
 * A sidebar item: `href` is LOCALE-FREE (localise with `localePath`), the label comes from
 * `portal.nav` (or `portal.crmNav` / `crm.nav` for the CRM items). `managersOnly` items are hidden from
 * counsellors (the page itself re-checks on the server). `exact` items match only their own
 * path (the area home always does), so `/crm` (Inbox) is not "current" on `/crm/today`.
 */
export type PortalNavItem = { key: AnyPortalNavKey; href: string; icon: LucideIcon; managersOnly?: boolean; exact?: boolean };

/** A headed block of sidebar items; `key: null` would be an untitled block. */
export type PortalNavGroup = { key: PortalNavGroupKey | null; items: PortalNavItem[] };

export interface PortalAreaConfig {
  icon: LucideIcon;
  /** Every item, in order. Area home (`nav[0]`) is matched exactly; other items also match their sub-paths. */
  nav: PortalNavItem[];
  /**
   * Grouped sidebar (admin console): headed blocks on md+, a "Menu" disclosure below md. Areas
   * without groups keep the flat list (a scrollable strip below md).
   */
  groups?: PortalNavGroup[];
  // Static Tailwind class strings (kept literal so Tailwind can detect them).
  strip: string;
  badge: string;
  eyebrow: string;
  sidebar: string;
  activeItem: string;
  tileAccent: string;
  iconTile: string;
}

/**
 * The admissions CRM pages (`/crm/**`, D-038). Staff (counsellors / centre managers) get them as
 * their whole sidebar; admins get them as the "Admission engine" group of the admin console, so
 * the CRM is never a dead end for an admin.
 */
export const crmNavItems: PortalNavItem[] = [
  { key: "inbox", href: "/crm", icon: Inbox, exact: true },
  { key: "today", href: "/crm/today", icon: CalendarCheck },
  // Lead routing (docs/lead-routing-plan.md §16, §20): area heads, admins and super admins.
  { key: "dashboard", href: "/crm/dashboard", icon: LayoutDashboard, managersOnly: true },
  { key: "pipeline", href: "/crm/pipeline", icon: SquareKanban },
  // Admin console 1b (docs/admin-phase-1b-plan.md §5.B, 1B-NUMBERS): every CRM role.
  { key: "admissions", href: "/crm/admissions", icon: Award },
  { key: "reports", href: "/crm/reports", icon: ChartColumn },
  { key: "staff", href: "/crm/staff", icon: UserCog, managersOnly: true },
  { key: "settings", href: "/crm/settings", icon: Settings2, managersOnly: true },
];

/**
 * Admin console 1b (§13): the "Manage" group — Targets (1B-NUMBERS), WhatsApp templates
 * (1B-CALLS) and Lost enquiries to review (1B-FAMILY). Area heads and admins; each page re-checks.
 */
export const crmManageItems: PortalNavItem[] = [
  { key: "targets", href: "/crm/targets", icon: Target, managersOnly: true },
  { key: "templates", href: "/crm/templates", icon: MessageSquareText, managersOnly: true },
  { key: "lostReview", href: "/crm/lost", icon: ArchiveRestore, managersOnly: true },
];

/** Admin console 1b (§13): "Lead generation" — Where enquiries come from (1B-SOURCES). */
export const crmLeadGenItems: PortalNavItem[] = [{ key: "sources", href: "/crm/sources", icon: Compass, managersOnly: true }];

/** Every staff (CRM) sidebar item, in order. */
const staffNavItems: PortalNavItem[] = [...crmNavItems, ...crmManageItems, ...crmLeadGenItems];

/**
 * Admin console sections (docs/admin-console-plan.md §2.3, decision 2). Only working pages (or, from
 * Phase 1b, the pages its packages build) are listed; everything else is on "What's coming"
 * (`console-roadmap.ts`).
 */
const adminGroups: PortalNavGroup[] = [
  {
    key: "dashboard",
    items: [
      { key: "home", href: "/admin", icon: LayoutDashboard },
      { key: "coming", href: "/admin/coming", icon: Route },
    ],
  },
  { key: "admission", items: crmNavItems },
  { key: "manage", items: crmManageItems },
  { key: "leadGeneration", items: crmLeadGenItems },
  // Question bank (docs/question-bank-plan.md §B6): also the whole admin nav of QB staff.
  { key: "tests", items: [{ key: "questionBank", href: "/admin/questions", icon: FileQuestion }] },
  {
    key: "website",
    items: [
      { key: "website", href: "/admin/website", icon: MonitorCheck },
      // Page layout (docs/page-layout-plan.md §10): reorder / show-hide the public pages' sections.
      { key: "pageLayout", href: "/admin/page-layout", icon: ListOrdered },
    ],
  },
  // Admin console 1b (§5.J, 1B-SOURCES): admins only, English.
  { key: "search", items: [{ key: "searchOverview", href: "/admin/search", icon: SearchCheck }] },
  {
    key: "access",
    items: [
      { key: "users", href: "/admin/users", icon: UsersRound },
      { key: "mcp", href: "/admin/mcp", icon: Bot },
    ],
  },
  {
    key: "settings",
    items: [
      // Admin console 1b (§5.M, 1B-HOUSEKEEPING): admins only, English.
      { key: "status", href: "/admin/status", icon: Gauge },
      { key: "audit", href: "/admin/audit", icon: History },
    ],
  },
];

/**
 * The staff (CRM) sidebar: the CRM pages, then the "Manage" and "Lead generation" groups (hidden
 * from counsellors: `managersOnly`; a group with no visible item is not shown).
 */
const staffGroups: PortalNavGroup[] = [
  { key: null, items: crmNavItems },
  { key: "manage", items: crmManageItems },
  { key: "leadGeneration", items: crmLeadGenItems },
];

/**
 * Console top bar (admin and staff areas). "Find an enquiry" is a GET search of the Enquiries
 * inbox: `/crm?q=<text>` (the inbox's own `q` filter: name or the last digits of a phone).
 */
export const ENQUIRY_SEARCH_PATH = "/crm";
export const ENQUIRY_SEARCH_PARAM = "q";
/**
 * "+ Add enquiry" opens the Enquiries inbox with `?add=1`. The add-enquiry form (CRM work,
 * `AddLeadForm`) opens itself when it sees `add=1`; until then the link lands on the inbox.
 * LOCALE-FREE: localise with `localePath`.
 */
export const ADD_ENQUIRY_PARAM = "add";
export const ADD_ENQUIRY_HREF = `/crm?${ADD_ENQUIRY_PARAM}=1`;

/**
 * Visual identity per portal area: same layout, different accent colour, icon
 * and label, so student, parent and staff views are never confused. Labels live in the
 * `portal` messages (`areas.<role>`, `nav.<key>`).
 */
export const portalAreas: Record<PortalArea, PortalAreaConfig> = {
  student: {
    icon: GraduationCap,
    nav: [
      { key: "overview", href: "/student", icon: LayoutDashboard },
      { key: "timetable", href: "/student/timetable", icon: CalendarDays },
      { key: "resources", href: "/student/resources", icon: BookOpen },
      { key: "progress", href: "/student/progress", icon: TrendingUp },
    ],
    strip: "bg-blue",
    badge: "border-[#bcd6fb] bg-blue-soft text-[#0755b5]",
    eyebrow: "text-blue",
    sidebar: "bg-navy",
    activeItem: "border-[#7cb8ff]",
    tileAccent: "border-t-blue",
    iconTile: "bg-blue-soft text-blue",
  },
  parent: {
    icon: HeartHandshake,
    nav: [
      { key: "overview", href: "/parent", icon: LayoutDashboard },
      { key: "updates", href: "/parent/updates", icon: Megaphone },
      { key: "progress", href: "/parent/progress", icon: TrendingUp },
    ],
    strip: "bg-success",
    badge: "border-[#bfe5cf] bg-success-soft text-[#0f5a3c]",
    eyebrow: "text-[#0f6b48]",
    sidebar: "bg-navy",
    activeItem: "border-[#6fd6a4]",
    tileAccent: "border-t-success",
    iconTile: "bg-success-soft text-[#0f6b48]",
  },
  admin: {
    icon: ShieldCheck,
    nav: adminGroups.flatMap((group) => group.items),
    groups: adminGroups,
    strip: "bg-gold",
    badge: "border-[#f2dfa0] bg-gold-soft text-[#7a5600]",
    eyebrow: "text-[#7a5600]",
    sidebar: "bg-navy-deep",
    activeItem: "border-gold",
    tileAccent: "border-t-gold",
    iconTile: "bg-gold-soft text-[#7a5600]",
  },
  staff: {
    icon: BriefcaseBusiness,
    nav: staffNavItems,
    groups: staffGroups,
    strip: "bg-[#7c5cd6]",
    badge: "border-[#d9ccf7] bg-[#f3eeff] text-[#5b3cc4]",
    eyebrow: "text-[#5b3cc4]",
    sidebar: "bg-navy",
    activeItem: "border-[#b9a4f5]",
    tileAccent: "border-t-[#7c5cd6]",
    iconTile: "bg-[#f3eeff] text-[#5b3cc4]",
  },
};

/**
 * What a `staff` session sees in the ADMIN area (only the question bank is open to staff there,
 * §B6): the "Tests & question bank" group, with the question bank as the area's home.
 */
export const QUESTION_BANK_NAV_KEYS: readonly AnyPortalNavKey[] = ["questionBank"];
export const QUESTION_BANK_HREF = "/admin/questions";

/** Whether a LOCALE-FREE path is a question-bank page (`/admin/questions` and below). */
export function isQuestionBankPath(path: string): boolean {
  return path === QUESTION_BANK_HREF || path.startsWith(`${QUESTION_BANK_HREF}/`);
}

/** The admin area's chrome for the signed-in role (request time; the static shell is the admin's). */
export type AdminChrome = {
  /** A `staff` account (a question-bank member) inside the admin area. */
  staffMode: boolean;
  /** Where the area badge leads: the console home, or the question bank for staff. */
  badgeHref: string;
  /** "Find an enquiry" / "+ Add enquiry": hidden for staff without a CRM membership. */
  showConsoleTools: boolean;
  /** Sidebar items to show (`undefined` = all). */
  navKeys: readonly AnyPortalNavKey[] | undefined;
  /** One "Admissions (CRM)" link under the sidebar for staff who are also CRM members. */
  crmLink: boolean;
};

export function adminChromeFor(role: Role | null | undefined, crmMember: boolean): AdminChrome {
  if (role === "staff") {
    return { staffMode: true, badgeHref: QUESTION_BANK_HREF, showConsoleTools: crmMember, navKeys: QUESTION_BANK_NAV_KEYS, crmLink: crmMember };
  }
  return { staffMode: false, badgeHref: portalAreas.admin.nav[0].href, showConsoleTools: true, navKeys: undefined, crmLink: false };
}

/** Staff nav keys a viewer may see: counsellors don't get the manager-only items. */
export function visibleStaffNavKeys(canManage: boolean): CrmNavKey[] {
  return portalAreas.staff.nav
    .filter((item) => canManage || !item.managersOnly)
    .map((item) => item.key as CrmNavKey);
}

/** Whether `href` is the current section for a LOCALE-FREE `pathname` (`exact`: no sub-paths). */
export function isActivePortalItem(pathname: string | null, href: string, areaHome: string, exact = false): boolean {
  if (pathname === null) return false;
  if (exact || href === areaHome) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
