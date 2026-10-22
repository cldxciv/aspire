"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { localePath, stripLocale } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { QbMessages } from "./api";

/** The question-bank sections, LOCALE-FREE. `import/**` belongs to QB-IMPORT. */
export const QB_TABS = [
  { key: "questions", href: "/admin/questions", exact: true },
  { key: "review", href: "/admin/questions/review" },
  { key: "import", href: "/admin/questions/import" },
  { key: "taxonomy", href: "/admin/questions/taxonomy" },
  { key: "blueprints", href: "/admin/questions/blueprints" },
  { key: "coverage", href: "/admin/questions/coverage" },
  { key: "team", href: "/admin/questions/team" },
] as const;

export type QbTabKey = (typeof QB_TABS)[number]["key"];

/**
 * Which tab is current for a LOCALE-FREE path. "Questions" also covers a question's own page
 * (`/admin/questions/<id>`) and `/admin/questions/new`, but not the other sections.
 */
export function activeQbTab(path: string | null): QbTabKey | null {
  if (path === null) return null;
  for (const tab of QB_TABS) {
    if (tab.key === "questions") continue;
    if (path === tab.href || path.startsWith(`${tab.href}/`)) return tab.key;
  }
  return path === "/admin/questions" || path.startsWith("/admin/questions/") ? "questions" : null;
}

/** Tab bar (links, `aria-current` on the current section). `pathname` null = static fallback. */
export function QbTabLinks({ locale, t, pathname }: { locale: Locale; t: QbMessages["tabs"]; pathname: string | null }) {
  const active = activeQbTab(pathname === null ? null : stripLocale(pathname));
  return (
    <nav aria-label={t.label} className="mb-5 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {QB_TABS.map((tab) => {
          const current = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={localePath(tab.href, locale)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-bold",
                  current ? "border-navy text-navy" : "border-transparent text-muted hover:border-[#b9cbe0] hover:text-navy",
                )}
              >
                {t[tab.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function QbTabs({ locale, t }: { locale: Locale; t: QbMessages["tabs"] }) {
  const pathname = usePathname();
  return <QbTabLinks locale={locale} t={t} pathname={pathname} />;
}
