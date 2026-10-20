import type { NavItem } from "@/config/site";

/** Path part of an internal href ("/resources#downloads" → "/resources", "/login?role=x" → "/login"). */
function pathOf(href: string): string {
  return href.split(/[?#]/)[0] || "/";
}

function isPlainPath(href: string): boolean {
  return !/[?#]/.test(href);
}

/** True when `pathname` is the href's page or one of its sub-pages. Home ("/") only matches itself. */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (pathname === null) return false;
  const path = pathOf(href);
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
}

/** True only for an exact page match of a plain href (no hash or query). */
export function isCurrentPage(pathname: string | null, href: string): boolean {
  return pathname !== null && isPlainPath(href) && pathname === href;
}

/**
 * Whether a top-level item (or its dropdown section) contains the current page.
 * Children that are anchors into another section's page (e.g. "/admissions#faqs"
 * under Resources) don't count, so only one section is highlighted at a time.
 */
export function isActiveSection(pathname: string | null, item: NavItem): boolean {
  return (
    isActivePath(pathname, item.href) ||
    (item.children ?? []).some((child) => isPlainPath(child.href) && isActivePath(pathname, child.href))
  );
}

/** `aria-current` for a link: "page" on an exact match, "true" on a sub-page of the item. */
export function ariaCurrentFor(pathname: string | null, href: string): "page" | "true" | undefined {
  if (isCurrentPage(pathname, href)) return "page";
  return isPlainPath(href) && isActivePath(pathname, href) ? "true" : undefined;
}
