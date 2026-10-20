"use client";

import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import type { Locale } from "@/i18n/config";
import { stripLocale } from "@/i18n/paths";

/**
 * The site's English | हिन्दी switcher for the portal header: keeps the current portal page
 * (`/student/progress` ⇄ `/hi/student/progress`). The session cookie is site-wide, so
 * switching never signs anyone out. Render under <Suspense> with a `LanguageSwitcher`
 * fallback pointing at the area home.
 */
export function PortalLanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  return <LanguageSwitcher path={stripLocale(pathname)} locale={locale} label={label} />;
}
