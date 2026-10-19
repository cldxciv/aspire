"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/auth/roles";
import { isActivePortalItem, portalAreas } from "./areas";

/**
 * Sidebar section links (mockup `.sidebar` / `.sideitem`). Navy panel on md+,
 * horizontally scrollable strip below md. Also rendered with `pathname={null}`
 * as the Suspense fallback while `usePathname()` resolves.
 */
export function PortalNavLinks({ area, pathname }: { area: Role; pathname: string | null }) {
  const config = portalAreas[area];
  const home = config.nav[0].href;
  return (
    <nav aria-label={`${config.label} sections`} className={cn("rounded-card p-1.5 text-white md:p-4", config.sidebar)}>
      <p className="hidden px-3 pb-3 pt-1 text-xs font-extrabold uppercase tracking-[0.14em] text-[#c2d3e6] md:block">
        {config.sidebarTitle}
      </p>
      <ul className="flex gap-1 overflow-x-auto p-0.5 md:flex-col md:overflow-visible">
        {config.nav.map(({ href, label, icon: Icon }) => {
          const active = isActivePortalItem(pathname, href, home);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-lg border-l-4 px-3 text-[13px] transition",
                  active
                    ? cn("bg-[#214d7d] font-bold text-white", config.activeItem)
                    : "border-transparent text-[#dce8f7] hover:bg-[#214d7d] hover:text-white",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function PortalNav({ area }: { area: Role }) {
  const pathname = usePathname();
  return <PortalNavLinks area={area} pathname={pathname} />;
}
