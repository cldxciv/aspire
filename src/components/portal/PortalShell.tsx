import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { Container } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { isPortalPreviewEnabled } from "@/lib/auth/config";
import { getPageSession } from "@/lib/auth/page-session";
import { decidePortalPage } from "@/lib/auth/policy";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { resolveCrmViewer } from "@/lib/crm/access";
import { crmPermissions } from "@/lib/crm/types";
import { crmNavItems, portalAreas, visibleStaffNavKeys, type PortalArea } from "./areas";
import { PortalLanguageSwitcher } from "./PortalLanguageSwitcher";
import { PortalBreadcrumb, PortalNav, PortalNavLinks, type PortalBreadcrumbMessages, type PortalNavMessages } from "./PortalNav";
import { PortalUserMenu, type PortalUserMenuMessages } from "./PortalUserMenu";

/**
 * Portal chrome shared by the student, parent, admin and staff (CRM, `/crm`) areas (and, with
 * `area={null}`, the role-agnostic /account pages): navy top bar (localised logo link, role badge, language
 * switcher, account menu with sign-out), a preview banner only for data-free previews, the
 * sidebar navigation and the page's `<main>` landmark. The skip link that targets `#main`
 * lives in `src/app/[lang]/(portal)/layout.tsx`.
 *
 * The bar and sidebar are static and prerender into the shell; everything that depends on the
 * session (account menu, preview banner) streams in under <Suspense>. Access checks happen per
 * page inside `<PortalGate>`.
 */
export async function PortalShell({ area, children }: { area: PortalArea | null; children: ReactNode }) {
  const [locale, t, auth, common, crm] = await Promise.all([
    getLocale(),
    getMessages("portal"),
    getMessages("auth"),
    getMessages("common"),
    getMessages("crm"),
  ]);
  const config = area ? portalAreas[area] : null;
  const AreaIcon = config?.icon;
  const userMessages: PortalUserMenuMessages = { shell: t.shell, roles: auth.roles, signOut: auth.signOut };
  const homePath = area ? portalAreas[area].nav[0].href : "/";
  const nav = area === "staff" ? staffNavMessages(t, crm) : area ? navMessages(t, area, crm) : null;
  const areaLabel = area === "staff" ? crm.area.label : area ? t.areas[area].label : "";

  return (
    <div className="flex flex-1 flex-col bg-surface">
      <header data-surface="dark" className="bg-navy text-white shadow-[0_4px_18px_rgb(3_16_32/0.18)]">
        <div aria-hidden="true" className={cn("h-1", config ? config.strip : "bg-gold")} />
        <Container className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
          <Logo tone="dark" locale={locale} label={common.logo.homeLabel} className="shrink-0" />
          {area && config && AreaIcon && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide",
                config.badge,
              )}
            >
              <AreaIcon aria-hidden="true" className="size-3.5" />
              {areaLabel}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
            <Link
              href={localePath("/", locale)}
              className="hidden min-h-11 items-center gap-1.5 rounded-control px-1 text-sm font-bold text-white hover:text-gold hover:underline xl:inline-flex"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t.shell.backToWebsite}
            </Link>
            <Suspense fallback={<LanguageSwitcher path={homePath} locale={locale} label={common.languageSwitcher.label} />}>
              <PortalLanguageSwitcher locale={locale} label={common.languageSwitcher.label} />
            </Suspense>
            <Suspense fallback={<span className="px-2 text-sm text-[#c2d3e6]">{t.shell.loadingAccount}</span>}>
              <PortalUserArea area={area} locale={locale} t={userMessages} />
            </Suspense>
          </div>
        </Container>
      </header>

      {area && area !== "staff" && (
        <Suspense fallback={null}>
          <PreviewBanner area={area} t={t.shell} />
        </Suspense>
      )}

      {area && nav ? (
        <Container className="grid flex-1 grid-cols-1 content-start gap-4 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 md:py-8">
          <div className="min-w-0 md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)] md:self-start md:overflow-y-auto">
            {area === "staff" ? (
              // Counsellors don't see manager-only items; the static shell starts with the counsellor set.
              // Admins get the whole admin console nav (CRM pages as its "Leads & admissions" group).
              <Suspense
                fallback={<PortalNavLinks area={area} locale={locale} messages={nav} visibleKeys={visibleStaffNavKeys(false)} pathname={null} />}
              >
                <StaffNav locale={locale} messages={nav} adminMessages={navMessages(t, "admin", crm)} />
              </Suspense>
            ) : (
              <Suspense fallback={<PortalNavLinks area={area} locale={locale} messages={nav} pathname={null} />}>
                <PortalNav area={area} locale={locale} messages={nav} />
              </Suspense>
            )}
          </div>
          <main id="main" className="min-w-0">
            {area === "staff" && (
              <Suspense fallback={null}>
                <AdminCrmBreadcrumb locale={locale} messages={crmBreadcrumbMessages(t, crm)} />
              </Suspense>
            )}
            {children}
          </main>
        </Container>
      ) : (
        <Container className="flex-1 py-6 md:py-10">
          <main id="main" className="min-w-0">
            {children}
          </main>
        </Container>
      )}
    </div>
  );
}

/** Student / parent / admin nav labels; the admin console also needs `crm` for its CRM group. */
export function navMessages(t: Messages<"portal">, area: Exclude<Role, "staff">, crm?: Messages<"crm">): PortalNavMessages {
  const { sectionsLabel, ...items } = t.nav;
  return {
    label: format(sectionsLabel, { area: t.areas[area].label }),
    sidebarTitle: t.areas[area].sidebarTitle,
    items: { ...crm?.nav, ...items },
    groups: t.navGroups,
    menu: t.shell.menu,
  };
}

/** Breadcrumb an admin sees on every CRM page: Staff admin › Leads & admissions › <page>. */
export function crmBreadcrumbMessages(t: Messages<"portal">, crm: Messages<"crm">): PortalBreadcrumbMessages {
  return {
    label: t.shell.breadcrumbLabel,
    trail: [
      { label: t.areas.admin.label, href: portalAreas.admin.nav[0].href },
      { label: t.navGroups.leads, href: crmNavItems[0].href },
    ],
    pages: crmNavItems.map((item) => ({ label: crm.nav[item.key as keyof Messages<"crm">["nav"]], href: item.href, exact: item.exact })),
    fallback: crm.lead.metaTitle,
  };
}

/** Staff (CRM) area: labels from the `crm` messages. */
export function staffNavMessages(t: Messages<"portal">, crm: Messages<"crm">): PortalNavMessages {
  return {
    label: format(t.nav.sectionsLabel, { area: crm.area.label }),
    sidebarTitle: crm.area.sidebarTitle,
    items: crm.nav,
  };
}

/**
 * CRM nav for the verified viewer (request time). Admins get the admin console nav, so the CRM is a
 * section of it rather than a dead end; managers also get "Staff & rules"; counsellors the rest.
 */
async function StaffNav({ locale, messages, adminMessages }: { locale: Locale; messages: PortalNavMessages; adminMessages: PortalNavMessages }) {
  const session = await getPageSession();
  const viewer = resolveCrmViewer(session);
  if (viewer?.role === "admin") return <PortalNav area="admin" locale={locale} messages={adminMessages} />;
  const canManage = viewer ? crmPermissions(viewer).canViewStaff : false;
  return <PortalNav area="staff" locale={locale} messages={messages} visibleKeys={visibleStaffNavKeys(canManage)} />;
}

/** The way back to the admin console on CRM pages: admins only (staff have the CRM as their home). */
async function AdminCrmBreadcrumb({ locale, messages }: { locale: Locale; messages: PortalBreadcrumbMessages }) {
  const session = await getPageSession();
  if (session?.role !== "admin" || session.mustChangePassword === true) return null;
  return <PortalBreadcrumb locale={locale} messages={messages} />;
}

/** Reads the verified session (request time). */
async function PortalUserArea({ area, locale, t }: { area: PortalArea | null; locale: Locale; t: PortalUserMenuMessages }) {
  const session = await getPageSession();
  return <PortalUserMenu session={session} area={area} locale={locale} t={t} />;
}

/** Only for data-free previews: a signed-in account of the area's role never sees it. */
async function PreviewBanner({ area, t }: { area: Exclude<Role, "staff">; t: Messages<"portal">["shell"] }) {
  const session = await getPageSession();
  if (session?.mustChangePassword) return null;
  if (decidePortalPage(session, area, isPortalPreviewEnabled()).kind !== "preview") return null;
  return <PreviewNote t={t} />;
}

export function PreviewNote({ t }: { t: Messages<"portal">["shell"] }) {
  return (
    <div role="note" className="border-b border-[#f2dfa0] bg-gold-soft text-[#5c4a12]">
      <Container className="flex items-start gap-2 py-2 text-xs sm:items-center sm:text-sm">
        <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <p>
          <strong>{t.previewTitle}</strong> — {t.previewBody}
        </p>
      </Container>
    </div>
  );
}
