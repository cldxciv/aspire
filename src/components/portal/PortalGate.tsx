import { Suspense, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { requirePortalAccess, type PortalAccess } from "@/lib/auth/portal-access";
import type { Role } from "@/lib/auth/roles";

type GateChildren = ReactNode | ((access: PortalAccess) => ReactNode);

/**
 * Server-side access check for a portal page. Renders `children` only for a
 * verified session with `area`'s role, or when data-free previews are enabled;
 * otherwise redirects to the login page of the current locale with `?next=<path>`
 * (and accounts with a temporary password to the change-password page).
 *
 * The session is read at request time, so the check sits under `<Suspense>`
 * (Cache Components) and nothing inside renders until it has passed. Pass a
 * function as children to branch on `access.kind` ("session" | "preview").
 * `path` is the page's LOCALE-FREE path (`/student/timetable`).
 */
export async function PortalGate({ area, path, children }: { area: Role; path: string; children: GateChildren }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("portal")]);
  return (
    <Suspense fallback={<GateFallback label={t.shell.checkingAccess} />}>
      <Gate area={area} path={path} locale={locale}>
        {children}
      </Gate>
    </Suspense>
  );
}

async function Gate({ area, path, locale, children }: { area: Role; path: string; locale: Locale; children: GateChildren }) {
  const access = await requirePortalAccess(area, path, locale);
  return <>{typeof children === "function" ? children(access) : children}</>;
}

function GateFallback({ label }: { label: string }) {
  return (
    <div role="status" className="rounded-card border border-line bg-white p-6 shadow-soft">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <div aria-hidden="true" className="mt-4 space-y-3">
        <div className="h-6 w-2/3 rounded-md bg-surface" />
        <div className="h-4 w-full rounded-md bg-surface" />
        <div className="h-4 w-5/6 rounded-md bg-surface" />
      </div>
    </div>
  );
}
