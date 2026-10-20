"use client";

import { ArrowLeft, ChevronDown, ChevronRight, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type KeyboardEvent } from "react";
import type { Locale } from "@/i18n/config";
import { localePath, stripLocale } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import {
  isActivePortalItem,
  portalAreas,
  type AnyPortalNavKey,
  type PortalArea,
  type PortalAreaConfig,
  type PortalNavGroup,
  type PortalNavGroupKey,
  type PortalNavItem,
} from "./areas";

export type PortalNavMessages = {
  /** Accessible name of the `<nav>`, e.g. "Student portal sections". */
  label: string;
  sidebarTitle: string;
  /** Labels for the area's items (`portal.nav`, plus `crm.nav` for the CRM items). */
  items: Partial<Record<AnyPortalNavKey, string>>;
  /** Group headings (`portal.navGroups`): grouped areas only. */
  groups?: Partial<Record<PortalNavGroupKey, string>>;
  /** Mobile disclosure button ("Menu"): grouped areas only. */
  menu?: string;
};

type NavProps = {
  area: PortalArea;
  locale: Locale;
  messages: PortalNavMessages;
  /** Only these items (staff area: counsellors don't see manager-only items). Default: all. */
  visibleKeys?: readonly AnyPortalNavKey[];
};

type ResolvedItem = PortalNavItem & { active: boolean };

function resolveItems(items: readonly PortalNavItem[], visibleKeys: readonly AnyPortalNavKey[] | undefined, path: string | null, home: string): ResolvedItem[] {
  return items
    .filter((item) => !visibleKeys || visibleKeys.includes(item.key))
    .map((item) => ({ ...item, active: isActivePortalItem(path, item.href, home, item.exact) }));
}

/**
 * Sidebar section links (mockup `.sidebar` / `.sideitem`). Navy panel on md+. Below md a flat
 * area is a horizontally scrollable strip; a grouped area (admin console) is a "Menu" disclosure.
 * Also rendered with `pathname={null}` as the Suspense fallback while `usePathname()` resolves.
 * Hrefs are localised; the active state compares locale-free paths (`/hi/student` and
 * `/student` both match).
 */
export function PortalNavLinks({ area, locale, messages, visibleKeys, pathname }: NavProps & { pathname: string | null }) {
  const config = portalAreas[area];
  const home = config.nav[0].href;
  const path = pathname === null ? null : stripLocale(pathname);
  if (config.groups) {
    const groups = config.groups
      .map((group) => ({ key: group.key, items: resolveItems(group.items, visibleKeys, path, home) }))
      .filter((group) => group.items.length > 0);
    return <GroupedNav config={config} groups={groups} locale={locale} messages={messages} path={path} />;
  }
  const items = resolveItems(config.nav, visibleKeys, path, home);
  return (
    <nav
      aria-label={messages.label}
      data-surface="dark"
      className={cn("rounded-card p-1.5 text-white md:p-4", config.sidebar)}
    >
      <p className="hidden px-3 pb-3 pt-1 text-xs font-extrabold uppercase tracking-[0.14em] text-[#c2d3e6] md:block">
        {messages.sidebarTitle}
      </p>
      <ul className="flex gap-1 overflow-x-auto p-0.5 md:flex-col md:overflow-visible">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <NavLink item={item} label={messages.items[item.key]} locale={locale} config={config} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NavLink({ item, label, locale, config, compact = false }: { item: ResolvedItem; label: string | undefined; locale: Locale; config: PortalAreaConfig; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={localePath(item.href, locale)}
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-lg border-l-4 px-3 text-[13px] transition",
        compact && "md:min-h-9",
        item.active
          ? cn("bg-[#214d7d] font-bold text-white", config.activeItem)
          : "border-transparent text-[#dce8f7] hover:bg-[#214d7d] hover:text-white",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </Link>
  );
}

/**
 * Grouped sidebar: headed lists on md+; below md the lists sit behind a "Menu · <current page>"
 * button (`aria-expanded`), which closes again on navigation and on Escape.
 */
function GroupedNav({
  config,
  groups,
  locale,
  messages,
  path,
}: {
  config: PortalAreaConfig;
  groups: { key: PortalNavGroup["key"]; items: ResolvedItem[] }[];
  locale: Locale;
  messages: PortalNavMessages;
  path: string | null;
}) {
  const id = useId();
  const listId = `${id}-sections`;
  // Open "for" the path it was opened on: navigating elsewhere closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === (path ?? "");
  const current = groups.flatMap((group) => group.items).find((item) => item.active);
  const currentLabel = current ? messages.items[current.key] : messages.sidebarTitle;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !open) return;
    setOpenOn(null);
    document.getElementById(`${id}-toggle`)?.focus();
  }

  return (
    <nav
      aria-label={messages.label}
      data-surface="dark"
      onKeyDown={onKeyDown}
      className={cn("rounded-card p-1.5 text-white md:p-4", config.sidebar)}
    >
      <p className="hidden px-3 pb-2 pt-1 text-xs font-extrabold uppercase tracking-[0.14em] text-[#c2d3e6] md:block">
        {messages.sidebarTitle}
      </p>
      <button
        type="button"
        id={`${id}-toggle`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpenOn(open ? null : (path ?? ""))}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-bold text-white hover:bg-[#214d7d] md:hidden"
      >
        <Menu aria-hidden="true" className="size-4 shrink-0" />
        <span className="shrink-0">{messages.menu}</span>
        <span aria-hidden="true" className="text-[#9fb3cc]">
          ·
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-[#dce8f7]">{currentLabel}</span>
        <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      <div id={listId} className={cn(open ? "block" : "hidden", "pb-1 md:block md:pb-0")}>
        {groups.map((group) => {
          const headingId = group.key ? `${id}-${group.key}` : undefined;
          return (
            <div key={group.key ?? "main"} className="mt-1 first:mt-0 md:mt-2 md:first:mt-0">
              {group.key && (
                <p id={headingId} className="px-3 pb-1 pt-2.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#9fb3cc]">
                  {messages.groups?.[group.key]}
                </p>
              )}
              <ul aria-labelledby={headingId} className="flex flex-col gap-0.5 p-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} label={messages.items[item.key]} locale={locale} config={config} compact />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export function PortalNav(props: NavProps) {
  const pathname = usePathname();
  return <PortalNavLinks {...props} pathname={pathname} />;
}

export type PortalBreadcrumbMessages = {
  /** Accessible name of the breadcrumb `<nav>`. */
  label: string;
  /** Ancestor links, outermost first (LOCALE-FREE hrefs). The first gets a back arrow. */
  trail: { label: string; href: string }[];
  /** Pages the current path may be; the matching one's label is the last crumb. */
  pages: { label: string; href: string; exact?: boolean }[];
  /** Last crumb when no page matches (e.g. a lead's own page). */
  fallback: string;
};

/**
 * "Staff admin › Admission engine › Pipeline": the way back to the admin console on every CRM
 * page an admin opens. The last crumb is the current page (`aria-current="page"`, not a link).
 */
export function PortalBreadcrumbLinks({ locale, messages, pathname }: { locale: Locale; messages: PortalBreadcrumbMessages; pathname: string | null }) {
  const path = pathname === null ? null : stripLocale(pathname);
  const current = messages.pages.find((page) => isActivePortalItem(path, page.href, "", page.exact ?? false))?.label ?? messages.fallback;
  return (
    <nav aria-label={messages.label} className="mb-3">
      <ol className="flex flex-wrap items-center gap-x-1 text-sm">
        {messages.trail.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-1">
            {index > 0 && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />}
            <Link
              href={localePath(crumb.href, locale)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 font-bold text-[#0755b5] underline-offset-2 hover:underline"
            >
              {index === 0 && <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />}
              {crumb.label}
            </Link>
          </li>
        ))}
        <li className="flex min-w-0 items-center gap-1">
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
          <span aria-current="page" className="inline-flex min-h-11 items-center px-1 font-semibold text-navy">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}

export function PortalBreadcrumb(props: { locale: Locale; messages: PortalBreadcrumbMessages }) {
  const pathname = usePathname();
  return <PortalBreadcrumbLinks {...props} pathname={pathname} />;
}
