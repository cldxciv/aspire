import {
  BookOpen,
  Bot,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  FileText,
  GraduationCap,
  HeartHandshake,
  History,
  Inbox,
  LayoutDashboard,
  Mail,
  MapPin,
  Megaphone,
  ShieldCheck,
  SquareKanban,
  TrendingUp,
  Trophy,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Messages } from "@/i18n/messages/types";
import type { Role } from "@/lib/auth/roles";

export type PortalNavKey = Exclude<keyof Messages<"portal">["nav"], "sectionsLabel">;
/** Sidebar group headings (`portal.navGroups`). */
export type PortalNavGroupKey = keyof Messages<"portal">["navGroups"];
/** Staff (CRM) sidebar keys: labels come from the `crm` messages (`crm.nav`). */
export type CrmNavKey = keyof Messages<"crm">["nav"];
export type AnyPortalNavKey = PortalNavKey | CrmNavKey;

/**
 * Portal areas. `staff` is the admissions CRM at `/crm` (D-038); it joins `Role` once the core
 * `staff` role exists, and `Role | "staff"` keeps this type stable before and after.
 */
export type PortalArea = Role | "staff";

/**
 * A sidebar item: `href` is LOCALE-FREE (localise with `localePath`), the label comes from
 * `portal.nav` (or `crm.nav` for the CRM items). `managersOnly` items are hidden from
 * counsellors (the page itself re-checks on the server). `exact` items match only their own
 * path (the area home always does), so `/crm` (Inbox) is not "current" on `/crm/today`.
 */
export type PortalNavItem = { key: AnyPortalNavKey; href: string; icon: LucideIcon; managersOnly?: boolean; exact?: boolean };

/** A headed block of sidebar items; `key: null` is the untitled first block (e.g. Overview). */
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
 * their whole sidebar; admins get them as the "Leads & admissions" group of the admin console, so
 * the CRM is never a dead end for an admin.
 */
export const crmNavItems: PortalNavItem[] = [
  { key: "inbox", href: "/crm", icon: Inbox, exact: true },
  { key: "today", href: "/crm/today", icon: CalendarCheck },
  { key: "pipeline", href: "/crm/pipeline", icon: SquareKanban },
  { key: "reports", href: "/crm/reports", icon: ChartColumn },
  { key: "staff", href: "/crm/staff", icon: UserCog, managersOnly: true },
];

/** Admin console: Overview, then the CRM and the other admin sections in headed groups. */
const adminGroups: PortalNavGroup[] = [
  { key: null, items: [{ key: "overview", href: "/admin", icon: LayoutDashboard }] },
  { key: "leads", items: [...crmNavItems, { key: "enquiries", href: "/admin/enquiries", icon: Mail }] },
  {
    key: "website",
    items: [
      { key: "content", href: "/admin/content", icon: FileText },
      { key: "centres", href: "/admin/centres", icon: MapPin },
      { key: "results", href: "/admin/results", icon: Trophy },
    ],
  },
  {
    key: "access",
    items: [
      { key: "users", href: "/admin/users", icon: UsersRound },
      { key: "audit", href: "/admin/audit", icon: History },
      { key: "mcp", href: "/admin/mcp", icon: Bot },
    ],
  },
];

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
    nav: crmNavItems,
    strip: "bg-[#7c5cd6]",
    badge: "border-[#d9ccf7] bg-[#f3eeff] text-[#5b3cc4]",
    eyebrow: "text-[#5b3cc4]",
    sidebar: "bg-navy",
    activeItem: "border-[#b9a4f5]",
    tileAccent: "border-t-[#7c5cd6]",
    iconTile: "bg-[#f3eeff] text-[#5b3cc4]",
  },
};

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
