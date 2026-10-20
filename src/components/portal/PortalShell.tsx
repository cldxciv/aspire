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
import { portalAreas } from "./areas";
import { PortalLanguageSwitcher } from "./PortalLanguageSwitcher";
import { PortalNav, PortalNavLinks, type PortalNavMessages } from "./PortalNav";
import { PortalUserMenu, type PortalUserMenuMessages } from "./PortalUserMenu";

/**
 * Portal chrome shared by the student, parent and admin areas (and, with `area={null}`, the
 * role-agnostic /account pages): navy top bar (localised logo link, role badge, language
 * switcher, account menu with sign-out), a preview banner only for data-free previews, the
 * sidebar navigation and the page's `<main>` landmark. The skip link that targets `#main`
 * lives in `src/app/[lang]/(portal)/layout.tsx`.
 *
 * The bar and sidebar are static and prerender into the shell; everything that depends on the
 * session (account menu, preview banner) streams in under <Suspense>. Access checks happen per
 * page inside `<PortalGate>`.
 */
export async function PortalShell({ area, children }: { area: Role | null; children: ReactNode }) {
  const [locale, t, auth, common] = await Promise.all([
    getLocale(),
    getMessages("portal"),
    getMessages("auth"),
    getMessages("common"),
  ]);
  const config = area ? portalAreas[area] : null;
  const AreaIcon = config?.icon;
  const userMessages: PortalUserMenuMessages = { shell: t.shell, roles: auth.roles, signOut: auth.signOut };
  const homePath = area ? portalAreas[area].nav[0].href : "/";
  const nav = area ? navMessages(t, area) : null;

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
              {t.areas[area].label}
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

      {area && (
        <Suspense fallback={null}>
          <PreviewBanner area={area} t={t.shell} />
        </Suspense>
      )}

      {area && nav ? (
        <Container className="grid flex-1 grid-cols-1 content-start gap-4 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 md:py-8">
          <div className="min-w-0 md:sticky md:top-4 md:self-start">
            <Suspense fallback={<PortalNavLinks area={area} locale={locale} messages={nav} pathname={null} />}>
              <PortalNav area={area} locale={locale} messages={nav} />
            </Suspense>
          </div>
          <main id="main" className="min-w-0">
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

export function navMessages(t: Messages<"portal">, area: Role): PortalNavMessages {
  const { sectionsLabel, ...items } = t.nav;
  return {
    label: format(sectionsLabel, { area: t.areas[area].label }),
    sidebarTitle: t.areas[area].sidebarTitle,
    items,
  };
}

/** Reads the verified session (request time). */
async function PortalUserArea({ area, locale, t }: { area: Role | null; locale: Locale; t: PortalUserMenuMessages }) {
  const session = await getPageSession();
  return <PortalUserMenu session={session} area={area} locale={locale} t={t} />;
}

/** Only for data-free previews: a signed-in account of the area's role never sees it. */
async function PreviewBanner({ area, t }: { area: Role; t: Messages<"portal">["shell"] }) {
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
