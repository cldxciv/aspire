import {
  BookOpen,
  CalendarDays,
  FileText,
  GraduationCap,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  MapPin,
  Megaphone,
  ShieldCheck,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth/roles";

export type PortalNavItem = { label: string; href: string; icon: LucideIcon };

export interface PortalAreaConfig {
  /** Role badge / eyebrow text. */
  label: string;
  /** Uppercase title at the top of the sidebar (desktop). */
  sidebarTitle: string;
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
 * and label, so student, parent and staff views are never confused.
 */
export const portalAreas: Record<Role, PortalAreaConfig> = {
  student: {
    label: "Student portal",
    sidebarTitle: "Aspire Student",
    icon: GraduationCap,
    nav: [
      { label: "Overview", href: "/student", icon: LayoutDashboard },
      { label: "Timetable", href: "/student/timetable", icon: CalendarDays },
      { label: "Resources", href: "/student/resources", icon: BookOpen },
      { label: "Progress", href: "/student/progress", icon: TrendingUp },
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
    label: "Parent portal",
    sidebarTitle: "Aspire Parent",
    icon: HeartHandshake,
    nav: [
      { label: "Overview", href: "/parent", icon: LayoutDashboard },
      { label: "Updates", href: "/parent/updates", icon: Megaphone },
      { label: "Progress", href: "/parent/progress", icon: TrendingUp },
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
    label: "Staff admin",
    sidebarTitle: "Aspire Admin",
    icon: ShieldCheck,
    nav: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard },
      { label: "Enquiries", href: "/admin/enquiries", icon: Inbox },
      { label: "Content", href: "/admin/content", icon: FileText },
      { label: "Centres", href: "/admin/centres", icon: MapPin },
      { label: "Results", href: "/admin/results", icon: Trophy },
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

/** Whether `href` is the current section for `pathname`. */
export function isActivePortalItem(pathname: string | null, href: string, areaHome: string): boolean {
  if (pathname === null) return false;
  if (href === areaHome) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
