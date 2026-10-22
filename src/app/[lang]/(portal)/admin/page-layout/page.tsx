import type { Metadata } from "next";
import { Suspense } from "react";

import { defaultStateViews } from "@/components/page-layout/editor-model";
import type { LayoutMessages } from "@/components/page-layout/labels";
import { PageLayoutEditor } from "@/components/page-layout/PageLayoutEditor";
import { PortalPageHeader } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import type { Session } from "@/lib/auth/roles";
import { getDb } from "@/lib/db/connection";
import { isLayoutEditor } from "@/lib/page-layout/access";
import { isLayoutPageKey, PAGE_LAYOUT_ADMIN_PATH } from "@/lib/page-layout/registry";
import { listPageLayoutStates } from "@/lib/page-layout/store";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("layout");
  return { title: t.meta.title, description: t.meta.description };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Website & content → Page layout (docs/page-layout-plan.md §10). The order and visibility of the
 * sections of the 10 public pages: super admins edit (draft → preview → publish, reset); other
 * admins see the live order and the history. Layout data is read on the server only after the
 * admin gate passed; the data-free console preview shows every page's original order.
 */
export default async function AdminPageLayoutPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, portal, t] = await Promise.all([getLocale(), getMessages("portal"), getMessages("layout")]);
  return (
    <PortalGate area="admin" path={PAGE_LAYOUT_ADMIN_PATH}>
      {(access) => (
        <>
          <PortalPageHeader
            area="admin"
            eyebrow={portal.areas.admin.label}
            title={t.title}
            description={t.lead}
            badge={access.kind === "preview" ? portal.blocks.previewBadge : undefined}
          />
          {access.kind === "session" ? (
            <Suspense fallback={<p className="text-sm text-muted">{portal.shell.checkingAccess}</p>}>
              <SessionEditor searchParams={searchParams} session={access.session} locale={locale} t={t} />
            </Suspense>
          ) : (
            <PageLayoutEditor canEdit={false} previewAccess states={defaultStateViews()} initialPage="home" locale={locale} t={t} />
          )}
        </>
      )}
    </PortalGate>
  );
}

/** Rendered only inside the admin branch of the gate. */
async function SessionEditor({
  searchParams,
  session,
  locale,
  t,
}: {
  searchParams: SearchParams;
  session: Session;
  locale: Locale;
  t: LayoutMessages;
}) {
  const requested = (await searchParams).page;
  const initialPage = typeof requested === "string" && isLayoutPageKey(requested) ? requested : "home";
  return (
    <PageLayoutEditor
      canEdit={isLayoutEditor(session)}
      states={listPageLayoutStates(getDb())}
      initialPage={initialPage}
      locale={locale}
      t={t}
    />
  );
}
