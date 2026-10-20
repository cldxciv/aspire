"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { localePath, stripLocale } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/auth/roles";
import { isActivePortalItem, portalAreas, type PortalNavKey } from "./areas";

export type PortalNavMessages = {
  /** Accessible name of the `<nav>`, e.g. "Student portal sections". */
  label: string;
  sidebarTitle: string;
  items: Record<PortalNavKey, string>;
};

type NavProps = { area: Role; locale: Locale; messages: PortalNavMessages };

/**
 * Sidebar section links (mockup `.sidebar` / `.sideitem`). Navy panel on md+,
 * horizontally scrollable strip below md. Also rendered with `pathname={null}`
 * as the Suspense fallback while `usePathname()` resolves. Hrefs are localised; the
 * active state compares locale-free paths (`/hi/student` and `/student` both match).
 */
export function PortalNavLinks({ area, locale, messages, pathname }: NavProps & { pathname: string | null }) {
  const config = portalAreas[area];
  const home = config.nav[0].href;
  const path = pathname === null ? null : stripLocale(pathname);
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
        {config.nav.map(({ key, href, icon: Icon }) => {
          const active = isActivePortalItem(path, href, home);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={localePath(href, locale)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-lg border-l-4 px-3 text-[13px] transition",
                  active
                    ? cn("bg-[#214d7d] font-bold text-white", config.activeItem)
                    : "border-transparent text-[#dce8f7] hover:bg-[#214d7d] hover:text-white",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {messages.items[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function PortalNav(props: NavProps) {
  const pathname = usePathname();
  return <PortalNavLinks {...props} pathname={pathname} />;
}
