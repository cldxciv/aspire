import {
  BookOpen,
  CalendarDays,
  FileText,
  GraduationCap,
  HeartHandshake,
  History,
  Inbox,
  LayoutDashboard,
  MapPin,
  Megaphone,
  ShieldCheck,
  TrendingUp,
  Trophy,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Messages } from "@/i18n/messages/types";
import type { Role } from "@/lib/auth/roles";

export type PortalNavKey = Exclude<keyof Messages<"portal">["nav"], "sectionsLabel">;

/** A sidebar item: `href` is LOCALE-FREE (localise with `localePath`), the label comes from `portal.nav`. */
export type PortalNavItem = { key: PortalNavKey; href: string; icon: LucideIcon };

export interface PortalAreaConfig {
  icon: LucideIcon;
  /** Area home is matched exactly; every other item also matches its sub-paths. */
  nav: PortalNavItem[];
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
 * Visual identity per portal area: same layout, different accent colour, icon
 * and label, so student, parent and staff views are never confused. Labels live in the
 * `portal` messages (`areas.<role>`, `nav.<key>`).
 */
export const portalAreas: Record<Role, PortalAreaConfig> = {
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
    nav: [
      { key: "overview", href: "/admin", icon: LayoutDashboard },
      { key: "users", href: "/admin/users", icon: UsersRound },
      { key: "audit", href: "/admin/audit", icon: History },
      { key: "enquiries", href: "/admin/enquiries", icon: Inbox },
      { key: "content", href: "/admin/content", icon: FileText },
      { key: "centres", href: "/admin/centres", icon: MapPin },
      { key: "results", href: "/admin/results", icon: Trophy },
    ],
    strip: "bg-gold",
    badge: "border-[#f2dfa0] bg-gold-soft text-[#7a5600]",
    eyebrow: "text-[#7a5600]",
    sidebar: "bg-navy-deep",
    activeItem: "border-gold",
    tileAccent: "border-t-gold",
    iconTile: "bg-gold-soft text-[#7a5600]",
  },
};

/** Whether `href` is the current section for a LOCALE-FREE `pathname`. */
export function isActivePortalItem(pathname: string | null, href: string, areaHome: string): boolean {
  if (pathname === null) return false;
  if (href === areaHome) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
