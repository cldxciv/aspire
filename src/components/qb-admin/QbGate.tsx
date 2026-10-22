import "server-only";

import { Suspense, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { requireQbPage } from "@/lib/qb/http";
import type { QbCapability, QbViewer } from "@/lib/qb/types";
import type { QbMessages } from "./api";
import { qbCapabilityMap, type QbCapabilityMap } from "./constants";
import { QbNotAllowed, QbPageHeader } from "./QbBlocks";

export type QbAccess = { viewer: QbViewer; can: QbCapabilityMap };

/**
 * Server-side gate for every `/admin/questions/**` page (§B6). QB-CORE-B's `requireQbPage`
 * calls `requirePortalAccess(["admin", "staff"])`: signed out or another role → the localised
 * login with `next`; a temporary password → the change-password page; staff in the admin area
 * never get a data-free preview. A staff account without an active QB membership gets an "ask an
 * admin" panel with the page's h1. Reads the request, so it renders under `<Suspense>`.
 *
 * Assumed contract: `requireQbPage(path, locale)` →
 * `{ kind: "viewer"; viewer: QbViewer } | { kind: "no_membership"; displayName: string | null }`.
 *
 * `need`: a capability the page requires (e.g. `manage_team`); viewers without it see the
 * "not for your role" panel instead of the page body.
 */
export async function QbGate({
  path,
  title,
  need,
  children,
}: {
  /** LOCALE-FREE page path (a promise for pages whose path comes from `params`). */
  path: string | Promise<string>;
  title: string;
  need?: QbCapability;
  children: (access: QbAccess) => ReactNode;
}) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <Suspense fallback={<GateFallback label={t.common.loading} />}>
      <Gate path={path} title={title} need={need} locale={locale} t={t}>
        {children}
      </Gate>
    </Suspense>
  );
}

async function Gate({
  path,
  title,
  need,
  locale,
  t,
  children,
}: {
  path: string | Promise<string>;
  title: string;
  need?: QbCapability;
  locale: Locale;
  t: QbMessages;
  children: (access: QbAccess) => ReactNode;
}) {
  const access = await requireQbPage(await path, locale);
  if (access.kind !== "viewer") {
    return (
      <>
        <QbPageHeader eyebrow={t.area.label} title={title} />
        <QbNotAllowed title={t.common.notMemberTitle} body={t.common.notMemberBody} homeHref={localePath("/", locale)} homeLabel={t.common.backToWebsite} />
      </>
    );
  }
  const can = qbCapabilityMap(access.viewer.role);
  if (need && !can[need]) {
    return (
      <>
        <QbPageHeader eyebrow={t.area.label} title={title} />
        <QbNotAllowed
          title={t.common.notAllowedTitle}
          body={t.common.notAllowedBody}
          homeHref={localePath("/admin/questions", locale)}
          homeLabel={t.common.backToList}
        />
      </>
    );
  }
  return <>{children({ viewer: access.viewer, can })}</>;
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
