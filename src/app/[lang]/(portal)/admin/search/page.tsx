import type { Metadata } from "next";
import { Suspense } from "react";
import { SEARCH_TEXT, SearchOverviewView } from "@/components/console/sources/SearchOverviewView";
import { timeLabel } from "@/components/console/sources/labels";
import { requestTime } from "@/components/crm/CrmGate";
import { PortalPageHeader } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import type { Locale } from "@/i18n/config";
import portalEn from "@/i18n/messages/en/portal";
import { getLocale, getMessages } from "@/i18n/server";
import type { Session } from "@/lib/auth/roles";
import { resolveCrmViewer } from "@/lib/crm/access";
import { searchOverview } from "@/lib/crm/console/sources/search";

const PATH = "/admin/search";

export async function generateMetadata(): Promise<Metadata> {
  return { title: SEARCH_TEXT.metaTitle, description: SEARCH_TEXT.metaDescription };
}

/**
 * Google & AI search › Search overview (docs/admin-phase-1b-plan.md §5.J; owner: 1B-SOURCES).
 * Admins only (the admin gate), English only (decision 5). Whether search engines may index the
 * site (the `showPlaceholderContent()` check robots.ts uses) and enquiries from search engines,
 * Google Maps and AI assistants over 30 and 90 days. It measures arrivals only and promises no
 * rankings. The data-free console preview shows "—" and reads nothing. On a Hindi URL the English
 * header and body are marked `lang="en"` (WCAG 3.1.2); the header's area label is English too.
 */
export default async function AdminSearchPage() {
  const [locale, portal] = await Promise.all([getLocale(), getMessages("portal")]);
  return (
    <PortalGate area="admin" path={PATH}>
      {(access) => (
        <>
          <div lang={locale === "en" ? undefined : "en"}>
            <PortalPageHeader
              area="admin"
              eyebrow={portalEn.areas.admin.label}
              title={SEARCH_TEXT.title}
              description={SEARCH_TEXT.lead}
              badge={access.kind === "preview" ? SEARCH_TEXT.previewNote : undefined}
            />
          </div>
          {access.kind === "session" ? (
            <Suspense fallback={<p className="text-sm text-muted">{portal.shell.checkingAccess}</p>}>
              <Overview session={access.session} locale={locale} />
            </Suspense>
          ) : (
            <SearchOverviewView overview={null} asOf={null} locale={locale} />
          )}
        </>
      )}
    </PortalGate>
  );
}

/** Rendered only inside the admin branch of the gate. */
async function Overview({ session, locale }: { session: Session; locale: Locale }) {
  const now = await requestTime();
  const viewer = resolveCrmViewer(session);
  if (!viewer || viewer.role !== "admin") return <SearchOverviewView overview={null} asOf={null} locale={locale} />;
  const overview = searchOverview(viewer, now);
  return <SearchOverviewView overview={overview} asOf={timeLabel(overview.generatedAt, "en")} locale={locale} />;
}
