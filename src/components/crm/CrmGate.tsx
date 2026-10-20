import "server-only";

import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { getCentres } from "@/lib/data";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { LEAD_PROGRAMS, PUBLIC_LEAD_SOURCES, MANUAL_LEAD_SOURCES, type CrmPermissions, type CrmViewer } from "@/lib/crm/types";
import { requireCrmPage } from "@/lib/crm/page";
import { CrmPageHeader, NotAllowed } from "./CrmBlocks";
import type { CrmMessages } from "./format";
import type { Option } from "./types";

export type CrmAccess = { viewer: CrmViewer; permissions: CrmPermissions };

/**
 * Server-side gate for every `/crm/**` page (CRM-CORE `requireCrmPage`, docs/crm.md §2): signed
 * out / wrong role → localised login with `next`; temporary password → change-password page; a
 * staff account without an active CRM membership → an "ask an admin" panel (with the page's h1).
 * Reads the request, so it sits under `<Suspense>`. No preview mode for lead data.
 */
export async function CrmGate({
  path,
  title,
  children,
}: {
  /** LOCALE-FREE page path, e.g. `/crm/today` (a promise for pages whose path comes from `params`). */
  path: string | Promise<string>;
  /** The page's h1 for the "no membership" panel. */
  title: string;
  children: (access: CrmAccess) => ReactNode;
}) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  return (
    <Suspense fallback={<GateFallback label={t.common.loading} />}>
      <Gate path={path} title={title} locale={locale} t={t}>
        {children}
      </Gate>
    </Suspense>
  );
}

async function Gate({
  path,
  title,
  locale,
  t,
  children,
}: {
  path: string | Promise<string>;
  title: string;
  locale: Locale;
  t: CrmMessages;
  children: (access: CrmAccess) => ReactNode;
}) {
  const access = await requireCrmPage(await path, locale);
  if (access.kind === "no_membership") {
    return (
      <>
        <CrmPageHeader eyebrow={t.area.label} title={title} />
        <NotAllowed title={t.common.notStaffTitle} body={t.common.notStaffBody} homeHref={localePath("/", locale)} homeLabel={t.common.backToWebsite} />
      </>
    );
  }
  return <>{children({ viewer: access.viewer, permissions: access.permissions })}</>;
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

/** Centre names for the current locale: a slug → name map and select options. */
export async function crmCentres(locale: Locale): Promise<{ names: Record<string, string>; options: Option[] }> {
  const centres = await getCentres(undefined, locale);
  return {
    names: Object.fromEntries(centres.map((centre) => [centre.slug, centre.name])),
    options: centres.map((centre) => ({ value: centre.slug, label: centre.name })),
  };
}

export function programOptions(t: CrmMessages): Option[] {
  return LEAD_PROGRAMS.map((value) => ({ value, label: t.programs[value] }));
}

export function sourceOptions(t: CrmMessages): Option[] {
  return [...PUBLIC_LEAD_SOURCES, ...MANUAL_LEAD_SOURCES].map((value) => ({ value, label: t.sources[value] }));
}

/**
 * The request time (epoch ms) for "due today / overdue" maths. Waits for the request first, so it
 * never runs while prerendering (Cache Components); call it inside a `<Suspense>`d component.
 */
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}
