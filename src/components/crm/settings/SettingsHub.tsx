import { ChevronRight, Clock3, FileUp, MapPinned, PlugZap, UserCog, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { CrmPermissions } from "@/lib/crm/types";
import type { CrmMessages } from "../format";
import { ReadOnlyNotice } from "./ReadOnlyNotice";

export type SettingsSectionKey = "areas" | "speed" | "import" | "integrations" | "staff";

/** LOCALE-FREE paths of the settings pages (each page re-checks access on the server). */
export const SETTINGS_SECTIONS: readonly { key: SettingsSectionKey; href: string; icon: LucideIcon }[] = [
  { key: "areas", href: "/crm/settings/areas", icon: MapPinned },
  { key: "speed", href: "/crm/settings/speed", icon: Clock3 },
  { key: "import", href: "/crm/settings/import", icon: FileUp },
  { key: "integrations", href: "/crm/settings/integrations", icon: PlugZap },
  { key: "staff", href: "/crm/staff", icon: UserCog },
];

/** Which sections a viewer gets: import history is for admins; the rest for area heads and admins. */
export function visibleSettingsSections(permissions: CrmPermissions): SettingsSectionKey[] {
  if (!permissions.canViewSettings) return [];
  return SETTINGS_SECTIONS.filter((section) => section.key !== "import" || permissions.canViewImportHistory || permissions.canImport).map(
    (section) => section.key,
  );
}

/**
 * The CRM settings hub (`/crm/settings`, docs/lead-routing-plan.md §20): one card per section.
 * Area heads and admins can open every page read-only; only a super admin can change anything
 * (the line under the title says which applies). Server-safe.
 */
export function SettingsHub({
  permissions,
  superAdminNames,
  locale,
  t,
}: {
  permissions: CrmPermissions;
  /** Names of the effective super admins (who to ask), or empty. */
  superAdminNames: string[];
  locale: Locale;
  t: CrmMessages;
}) {
  const s = t.settings;
  const keys = new Set(visibleSettingsSections(permissions));
  return (
    <div className="space-y-5">
      <ReadOnlyNotice canEdit={permissions.canEditSettings} t={t} />
      {superAdminNames.length > 0 && <p className="text-sm text-muted">{format(s.superAdmins, { names: superAdminNames.join(", ") })}</p>}
      <nav aria-label={s.sectionsLabel}>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SETTINGS_SECTIONS.filter((section) => keys.has(section.key)).map(({ key, href, icon: Icon }) => {
            const section = s.sections[key];
            return (
              <li key={key}>
                <Link
                  href={localePath(href, locale)}
                  aria-label={format(s.open, { title: section.title })}
                  className="group flex h-full min-h-11 items-start gap-3 rounded-card border border-line bg-white p-5 shadow-soft transition hover:border-blue focus-visible:border-blue"
                >
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-control bg-[#f3eeff] text-[#5b3cc4]">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-extrabold text-navy">
                      {section.title}
                      <ChevronRight aria-hidden="true" className="size-4 transition group-hover:translate-x-0.5 motion-reduce:transition-none" />
                    </span>
                    <span className="mt-1 block text-sm text-muted">{section.body}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
