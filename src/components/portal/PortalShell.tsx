import { Eye, Globe, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { HideInQuestionBank } from "@/components/qb-admin/HideInQuestionBank";
import { Container } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { isPortalPreviewEnabled } from "@/lib/auth/config";
import { getPageSession } from "@/lib/auth/page-session";
import { decidePortalPage } from "@/lib/auth/policy";
import type { Role, Session } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { resolveCrmViewer } from "@/lib/crm/access";
import { crmPermissions } from "@/lib/crm/types";
import {
  adminChromeFor,
  crmLeadGenItems,
  crmManageItems,
  crmNavItems,
  isQuestionBankPath,
  portalAreas,
  visibleStaffNavKeys,
  type CrmNavKey,
  type PortalArea,
} from "./areas";
import { ConsoleTopBarTools } from "./ConsoleTopBar";
import { PortalLanguageSwitcher } from "./PortalLanguageSwitcher";
import { PortalBreadcrumb, PortalNav, PortalNavLinks, type PortalBreadcrumbMessages, type PortalNavMessages } from "./PortalNav";
import { PortalUserMenu, type PortalUserMenuMessages } from "./PortalUserMenu";

/**
 * Portal chrome shared by the student, parent, admin and staff (CRM, `/crm`) areas (and, with
 * `area={null}`, the role-agnostic /account pages): navy top bar (localised logo link, role badge
 * linking to the area home, "View website" at every width, language switcher, account menu with
 * sign-out), a preview banner only for data-free previews, the sidebar navigation and the page's
 * `<main>` landmark. The console areas (admin and staff) also get "Find an enquiry" and
 * "+ Add enquiry" in the bar (docs/admin-console-plan.md §2.2). The skip link that targets
 * `#main` lives in `src/app/[lang]/(portal)/layout.tsx`.
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
        <Container className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
          <Logo tone="dark" locale={locale} label={common.logo.homeLabel} className="shrink-0" />
          {area && config && AreaIcon &&
            (area === "admin" ? (
              // Staff (question-bank members) get "Question bank" leading to /admin/questions (§B6).
              <Suspense
                fallback={
                  <AreaBadge href={localePath(homePath, locale)} label={areaLabel} ariaLabel={format(t.shell.homeLink, { area: areaLabel })} badgeClass={config.badge} Icon={AreaIcon} />
                }
              >
                <AdminAreaBadge locale={locale} t={t} badgeClass={config.badge} Icon={AreaIcon} />
              </Suspense>
            ) : (
              <AreaBadge href={localePath(homePath, locale)} label={areaLabel} ariaLabel={format(t.shell.homeLink, { area: areaLabel })} badgeClass={config.badge} Icon={AreaIcon} />
            ))}
          {area === "staff" && <ConsoleTopBarTools locale={locale} t={t.shell} />}
          {area === "admin" && (
            <Suspense fallback={<ConsoleTopBarTools locale={locale} t={t.shell} />}>
              <AdminConsoleTools locale={locale} t={t.shell} />
            </Suspense>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
            <Link
              href={localePath("/", locale)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-sm font-bold text-white hover:text-gold hover:underline"
            >
              <Globe aria-hidden="true" className="size-4 shrink-0" />
              <span aria-hidden="true" className="sm:hidden">
                {t.shell.viewWebsiteShort}
              </span>
              <span className="sr-only sm:not-sr-only">{t.shell.viewWebsite}</span>
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
              // Admins get the whole admin console nav (CRM pages as its "Admission engine" group).
              <Suspense
                fallback={<PortalNavLinks area={area} locale={locale} messages={nav} visibleKeys={visibleStaffNavKeys(false)} pathname={null} />}
              >
                <StaffNav locale={locale} messages={nav} adminMessages={navMessages(t, "admin", crm)} />
              </Suspense>
            ) : (
              <Suspense fallback={<PortalNavLinks area={area} locale={locale} messages={nav} pathname={null} />}>
                {area === "admin" ? (
                  <AdminNav locale={locale} messages={nav} crmLinkLabel={t.shell.crmLink} />
                ) : (
                  <PortalNav area={area} locale={locale} messages={nav} />
                )}
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

/**
 * Console names of the CRM pages: `crm.nav`, with the plain names of `portal.crmNav` winning
 * ("Enquiries", "Today's calls"; docs/admin-console-plan.md decision 2). Admin and staff
 * sidebars and the admin breadcrumb all use these, so a page has one name everywhere.
 */
export function crmPageLabels(t: Messages<"portal">, crm: Messages<"crm">): Record<CrmNavKey, string> {
  return { ...crm.nav, ...t.crmNav };
}

/** Student / parent / admin nav labels; the admin console also needs `crm` for its CRM group. */
export function navMessages(t: Messages<"portal">, area: Exclude<Role, "staff">, crm?: Messages<"crm">): PortalNavMessages {
  const { sectionsLabel, ...items } = t.nav;
  return {
    label: format(sectionsLabel, { area: t.areas[area].label }),
    sidebarTitle: t.areas[area].sidebarTitle,
    items: { ...(crm ? crmPageLabels(t, crm) : {}), ...items },
    groups: t.navGroups,
    menu: t.shell.menu,
  };
}

/** Breadcrumb an admin sees on every CRM page: Staff admin › Admission engine › <page>. */
export function crmBreadcrumbMessages(t: Messages<"portal">, crm: Messages<"crm">): PortalBreadcrumbMessages {
  const labels = crmPageLabels(t, crm);
  return {
    label: t.shell.breadcrumbLabel,
    trail: [
      { label: t.areas.admin.label, href: portalAreas.admin.nav[0].href },
      { label: t.navGroups.admission, href: crmNavItems[0].href },
    ],
    // Admin console 1b (§13): the Manage and Lead generation pages are CRM pages too.
    pages: [...crmNavItems, ...crmManageItems, ...crmLeadGenItems].map((item) => ({ label: labels[item.key as CrmNavKey], href: item.href, exact: item.exact })),
    fallback: crm.lead.metaTitle,
  };
}

/**
 * Staff (CRM) area: the console names of the CRM pages (`crmPageLabels`), and (admin console 1b,
 * §13) the "Manage" / "Lead generation" group headings and the phone "Menu" button.
 */
export function staffNavMessages(t: Messages<"portal">, crm: Messages<"crm">): PortalNavMessages {
  return {
    label: format(t.nav.sectionsLabel, { area: crm.area.label }),
    sidebarTitle: crm.area.sidebarTitle,
    items: crmPageLabels(t, crm),
    groups: t.navGroups,
    menu: t.shell.menu,
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

/** The area badge: a link to the area's home ("Home"), with the area's icon and name. */
function AreaBadge({ href, label, ariaLabel, badgeClass, Icon }: { href: string; label: string; ariaLabel: string; badgeClass: string; Icon: LucideIcon }) {
  return (
    <Link href={href} aria-label={ariaLabel} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-0.5 hover:underline">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide", badgeClass)}>
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </span>
    </Link>
  );
}

/**
 * Admin-area badge for the verified session (request time): a staff session (a question-bank
 * member; the admin area is open to staff only at /admin/questions) gets "Question bank" leading
 * to /admin/questions instead of the console home it cannot open (§B6).
 */
async function AdminAreaBadge({ locale, t, badgeClass, Icon }: { locale: Locale; t: Messages<"portal">; badgeClass: string; Icon: LucideIcon }) {
  const session = await getPageSession();
  const chrome = adminChromeFor(session?.mustChangePassword ? null : session?.role, false);
  const label = chrome.staffMode ? t.shell.qbAreaLabel : t.areas.admin.label;
  return <AreaBadge href={localePath(chrome.badgeHref, locale)} label={label} ariaLabel={format(t.shell.homeLink, { area: label })} badgeClass={badgeClass} Icon={Icon} />;
}

/** "Find an enquiry" / "+ Add enquiry" in the admin area: not for staff without a CRM membership. */
async function AdminConsoleTools({ locale, t }: { locale: Locale; t: Messages<"portal">["shell"] }) {
  const session = await getPageSession();
  const chrome = adminChromeFor(session?.role, session?.role === "staff" && resolveCrmViewer(session) !== null);
  return chrome.showConsoleTools ? <ConsoleTopBarTools locale={locale} t={t} /> : null;
}

/**
 * Admin sidebar for the verified session: admins get the whole console; staff (question-bank
 * members) get the "Tests & question bank" group, plus one "Admissions (CRM)" link when they are
 * also CRM members.
 */
async function AdminNav({ locale, messages, crmLinkLabel }: { locale: Locale; messages: PortalNavMessages; crmLinkLabel: string }) {
  const session = await getPageSession();
  const chrome = adminChromeFor(session?.role, session?.role === "staff" && resolveCrmViewer(session) !== null);
  return (
    <>
      <PortalNav area="admin" locale={locale} messages={messages} visibleKeys={chrome.navKeys} />
      {chrome.crmLink && (
        <Link
          href={localePath(crmNavItems[0].href, locale)}
          className="mt-2 inline-flex min-h-11 w-full items-center rounded-card border border-line bg-white px-4 text-sm font-bold text-navy hover:border-blue hover:text-blue"
        >
          {crmLinkLabel}
        </Link>
      )}
    </>
  );
}

/** Reads the verified session (request time). */
async function PortalUserArea({ area, locale, t }: { area: PortalArea | null; locale: Locale; t: PortalUserMenuMessages }) {
  const session = await getPageSession();
  return <PortalUserMenu session={session} area={area} locale={locale} t={t} />;
}

/** Only for data-free previews: a signed-in account of the area's role never sees it. */
async function PreviewBanner({ area, t }: { area: Exclude<Role, "staff">; t: Messages<"portal">["shell"] }) {
  const session = await getPageSession();
  const mode = previewBannerMode(session, area, isPortalPreviewEnabled());
  if (mode === "hidden") return null;
  if (mode === "outside_question_bank") {
    return (
      <HideInQuestionBank>
        <PreviewNote t={t} />
      </HideInQuestionBank>
    );
  }
  return <PreviewNote t={t} />;
}

/**
 * When the data-free preview banner shows: only for a real preview (no session of the area's
 * role), never for an account with a pending temporary password. A staff session in the ADMIN
 * area gets real question-bank pages at /admin/questions/** (§B6) but the data-free preview on
 * every other admin page, so there the banner shows everywhere except the question bank
 * (`outside_question_bank`, decided on the client from the path). Staff in the student and parent
 * areas are treated like anyone else.
 */
export type PreviewBannerMode = "hidden" | "shown" | "outside_question_bank";

export function previewBannerMode(session: Session | null | undefined, area: Exclude<Role, "staff">, previewEnabled: boolean): PreviewBannerMode {
  if (session?.mustChangePassword) return "hidden";
  if (decidePortalPage(session, area, previewEnabled).kind !== "preview") return "hidden";
  if (session?.role === "staff" && area === "admin") return "outside_question_bank";
  return "shown";
}

/** `previewBannerMode` for a known LOCALE-FREE path (tests and server-side callers). */
export function previewBannerVisible(session: Session | null | undefined, area: Exclude<Role, "staff">, previewEnabled: boolean, path: string): boolean {
  const mode = previewBannerMode(session, area, previewEnabled);
  return mode === "shown" || (mode === "outside_question_bank" && !isQuestionBankPath(path));
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
